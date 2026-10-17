import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:wakelock_plus/wakelock_plus.dart';

import '../models/protocol.dart';
import '../speech/speech_capture.dart';
import '../util/ids.dart';

/// Same states as the web app (apps/web/src/lib/call-session.ts).
enum CallStatus { idle, starting, waiting, connecting, connected, reconnecting, roomFull, ended, error }

enum CaptionStatus { off, starting, on, unavailable }

/// One 1-on-1 call: camera/mic, the Socket.IO signaling connection, and the
/// RTCPeerConnection. A Dart port of the web app's CallSession, so both sides
/// follow exactly the same rules:
///
///  * The NEWCOMER creates the peer connection and sends the offer.
///  * Every signaling message carries a connectionId; messages for an old
///    connection are ignored.
///  * "Perfect negotiation" settles the rare case where both sides send an
///    offer at once (the polite peer backs off).
///  * Media is peer-to-peer, so a signaling blip doesn't end the call; a broken
///    media path triggers an ICE restart.
///
/// The UI listens to it as a ChangeNotifier.
class CallSession extends ChangeNotifier {
  CallSession({
    required this.signalUrl,
    required this.roomId,
    required this.name,
    required String language,
    // A private field can't be a named parameter, so assign it here.
    // ignore: prefer_initializing_formals
  }) : _language = language;

  final String signalUrl;
  final String roomId;
  final String name;
  final String clientId = randomId();

  final localRenderer = RTCVideoRenderer();
  final remoteRenderer = RTCVideoRenderer();

  // ---------- State the UI reads ----------

  CallStatus get status => _status;
  CallStatus _status = CallStatus.idle;

  String? get error => _error;
  String? _error;

  String? get notice => _notice;
  String? _notice;

  bool get signalConnected => _signalConnected;
  bool _signalConnected = false;

  MediaState get localMedia => _localMedia;
  MediaState _localMedia = const MediaState(audio: false, video: false);

  PeerInfo? get remote => _remote;
  PeerInfo? _remote;

  bool get hasRemoteVideo => _remoteStream != null;

  String get language => _language;
  String _language;

  List<SubtitleLine> get subtitles => List.unmodifiable(_subtitles);
  final _subtitles = <SubtitleLine>[];

  bool get captionsEnabled => _captionsEnabled;
  bool _captionsEnabled = true;

  CaptionStatus get captionStatus => _captionStatus;
  CaptionStatus _captionStatus = CaptionStatus.off;

  bool get localSpeaking => _localSpeaking;
  bool _localSpeaking = false;

  /// True while this call's transcript is being saved (someone in it is logged in).
  bool get recording => _recording;
  bool _recording = false;

  // ---------- Internals ----------

  io.Socket? _socket;
  List<Map<String, dynamic>> _iceServers = const [];
  MediaStream? _localStream;
  bool _joined = false;
  bool _ended = false;
  bool _disposed = false;

  RTCPeerConnection? _pc;
  String? _connectionId;
  bool _makingOffer = false;
  bool _ignoreOffer = false;
  bool _hasConnectedToPeer = false;
  Timer? _disconnectTimer;
  MediaStream? _remoteStream;
  /// True when _remoteStream is one we created ourselves (and so must dispose).
  bool _ownsRemoteStream = false;

  /// Signaling messages are handled strictly one after another. WebRTC calls
  /// are async; without this, an ICE candidate could be applied before the
  /// offer it belongs to has finished being applied.
  Future<void> _signalQueue = Future.value();

  /// flutter_webrtc reports the signaling state as null until the first change,
  /// but a new connection is "stable". Treating null as "not stable" made the
  /// app think every incoming offer collided with its own and ignore it.
  static RTCSignalingState _stateOf(RTCPeerConnection pc) =>
      pc.signalingState ?? RTCSignalingState.RTCSignalingStateStable;

  SpeechCapture? _capture;
  int _segmentSeq = 0;
  DateTime _lastSubtitleError = DateTime.fromMillisecondsSinceEpoch(0);

  static const _maxSubtitles = 50;
  static const _iceDisconnectGrace = Duration(seconds: 4);

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  // ---------- Public actions ----------

  Future<void> start() async {
    if (_status != CallStatus.idle) return;
    _status = CallStatus.starting;
    _notify();

    await localRenderer.initialize();
    await remoteRenderer.initialize();
    await _acquireMedia();
    if (_ended) return;

    // Phones route call audio to the earpiece by default; a video call wants the speaker.
    await Helper.setSpeakerphoneOn(true);
    await WakelockPlus.enable(); // keep the screen on during the call

    _iceServers = await _fetchIceServers();
    if (_ended) return;
    _connectSignal();
  }

  Future<void> toggleAudio() async {
    final track = _track('audio');
    if (track == null) return;
    track.enabled = !track.enabled;
    _setLocalMedia(_localMedia.copyWith(audio: track.enabled));
    if (track.enabled) {
      _capture?.resume();
    } else {
      _capture?.pause();
    }
  }

  Future<void> toggleVideo() async {
    final track = _track('video');
    if (track != null) {
      // Fully release the camera (the privacy light goes off).
      await track.stop();
      await _localStream?.removeTrack(track);
      await _replaceSenderTrack('video', null);
      localRenderer.srcObject = null;
      _setLocalMedia(_localMedia.copyWith(video: false));
      return;
    }
    try {
      final stream = await navigator.mediaDevices.getUserMedia({'video': _videoConstraints});
      final newTrack = stream.getVideoTracks().first;
      await _localStream?.addTrack(newTrack);
      await _replaceSenderTrack('video', newTrack);
      localRenderer.srcObject = _localStream;
      _setLocalMedia(_localMedia.copyWith(video: true));
    } catch (e) {
      _notice = 'Could not turn on the camera.';
      _notify();
    }
  }

  /// Front <-> back camera.
  Future<void> switchCamera() async {
    final track = _track('video');
    if (track != null) await Helper.switchCamera(track);
  }

  void setLanguage(String language) {
    if (language == _language) return;
    _language = language;
    if (_joined) _socket?.emit('set-language', language);
    _notify();
  }

  void toggleCaptions() {
    _captionsEnabled = !_captionsEnabled;
    if (_captionsEnabled) {
      _startCaptions();
    } else {
      _stopCaptions();
      _captionStatus = CaptionStatus.off;
    }
    _notify();
  }

  /// Leave the call and release camera/mic.
  Future<void> end() async {
    if (_ended) return;
    await _teardown();
    _status = CallStatus.ended;
    _notify();
  }

  @override
  void dispose() {
    _disposed = true;
    // Free the video views only after the call is fully shut down; the
    // teardown still touches them (it clears what they show).
    _teardown().whenComplete(() {
      localRenderer.dispose();
      remoteRenderer.dispose();
    });
    super.dispose();
  }

  Future<void> _teardown() async {
    _ended = true;
    await _stopCaptions();
    final socket = _socket;
    _socket = null;
    if (socket != null) {
      // Wait (briefly) until the server confirms, otherwise closing the socket
      // can drop the message and the other person sees "reconnecting" for 30 s.
      final left = Completer<void>();
      if (socket.connected) {
        socket.emitWithAck('leave-room', null, ack: (_) {
          if (!left.isCompleted) left.complete();
        });
        await left.future.timeout(const Duration(milliseconds: 500), onTimeout: () {});
      }
      socket.clearListeners();
      socket.dispose();
    }
    await _closePeerConnection();
    for (final track in _localStream?.getTracks() ?? <MediaStreamTrack>[]) {
      await track.stop();
    }
    await _localStream?.dispose();
    _localStream = null;
    localRenderer.srcObject = null;
    _remote = null;
    _signalConnected = false;
    await WakelockPlus.disable();
  }

  // ---------- Local media ----------

  static const _audioConstraints = {
    'echoCancellation': true,
    'noiseSuppression': true,
    'autoGainControl': true,
  };
  static const _videoConstraints = {
    'facingMode': 'user',
    'width': {'ideal': 1280},
    'height': {'ideal': 720},
  };

  MediaStreamTrack? _track(String kind) {
    final tracks = kind == 'audio' ? _localStream?.getAudioTracks() : _localStream?.getVideoTracks();
    return (tracks == null || tracks.isEmpty) ? null : tracks.first;
  }

  Future<void> _acquireMedia() async {
    final attempts = <Map<String, dynamic>>[
      {'audio': _audioConstraints, 'video': _videoConstraints},
      {'audio': _audioConstraints},
      {'video': _videoConstraints},
    ];
    for (final constraints in attempts) {
      try {
        _localStream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (_) {
        // Try the next, smaller combination (e.g. camera denied, mic allowed).
      }
    }
    if (_localStream == null) {
      _notice = 'No camera or microphone access. You can still see and hear the other person.';
    } else if (_track('video') == null || _track('audio') == null) {
      _notice = _track('video') == null ? 'Camera unavailable.' : 'Microphone unavailable.';
    }
    localRenderer.srcObject = _localStream;
    _setLocalMedia(MediaState(audio: _track('audio') != null, video: _track('video') != null));
  }

  Future<void> _replaceSenderTrack(String kind, MediaStreamTrack? track) async {
    final pc = _pc;
    if (pc == null) return;
    for (final t in await pc.getTransceivers()) {
      if (t.receiver.track?.kind == kind) {
        await t.sender.replaceTrack(track);
        return;
      }
    }
  }

  void _setLocalMedia(MediaState media) {
    _localMedia = media;
    if (_joined) _socket?.emit('media-state', media.toJson());
    _notify();
  }

  // ---------- Signaling ----------

  Future<List<Map<String, dynamic>>> _fetchIceServers() async {
    const fallback = [
      {'urls': 'stun:stun.l.google.com:19302'},
    ];
    try {
      final res = await http.get(Uri.parse('$signalUrl/ice-servers')).timeout(const Duration(seconds: 5));
      final servers = (jsonDecode(res.body)['iceServers'] as List).cast<Map<String, dynamic>>();
      return servers.isEmpty ? fallback : servers;
    } catch (_) {
      return fallback;
    }
  }

  void _connectSignal() {
    final socket = io.io(
      signalUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableReconnection()
          .setReconnectionDelayMax(5000)
          .enableForceNew()
          .build(),
    );
    _socket = socket;

    socket.onConnect((_) {
      _signalConnected = true;
      _error = null;
      _notify();
      _joinRoom();
    });

    socket.onDisconnect((_) {
      _signalConnected = false;
      _updateStatus();
      _notify();
    });

    socket.onConnectError((_) {
      if (!_joined) {
        _error = "Can't reach the server at $signalUrl. Is it running, and is the phone on the same Wi-Fi?";
        _notify();
      }
    });

    socket.on('peer-joined', (data) async {
      // A fresh participant: drop any old connection and wait for their offer.
      await _closePeerConnection();
      _hasConnectedToPeer = false;
      _remote = PeerInfo.fromJson(data as Map);
      _notice = null;
      _updateStatus();
    });

    socket.on('peer-left', (data) async {
      final remote = _remote;
      if (remote == null || (data as Map)['clientId'] != remote.clientId) return;
      await _closePeerConnection();
      _hasConnectedToPeer = false;
      _remote = null;
      _notice = '${remote.name} left the call.';
      _updateStatus();
    });

    socket.on('peer-disconnected', (data) => _patchRemote(data, (r) => r.copyWith(signalConnected: false)));
    socket.on('peer-reconnected', (data) {
      _patchRemote(data, (r) => r.copyWith(signalConnected: true));
      _recoverIfNeeded();
    });
    socket.on('media-state', (data) => _patchRemote(data, (r) => r.copyWith(media: MediaState.fromJson(data['media']))));
    socket.on('language-changed', (data) => _patchRemote(data, (r) => r.copyWith(lang: data['lang'] as String)));

    socket.on('signal', (data) {
      final map = data as Map;
      // catchError keeps the queue alive: one failed message must not block all later ones.
      _signalQueue = _signalQueue
          .then((_) => _handleSignal(map['from'] as String, map['payload'] as Map))
          .catchError((Object e) => debugPrint('[webrtc] signal handling crashed: $e'));
    });

    socket.on('subtitle', (data) => _addSubtitle(Subtitle.fromJson(data as Map)));
    socket.on('call-recording', (data) {
      _recording = (data as Map)['recording'] == true;
      _notify();
    });
    socket.on('subtitle-error', (data) {
      final now = DateTime.now();
      if (now.difference(_lastSubtitleError).inSeconds < 15) return;
      _lastSubtitleError = now;
      _notice = switch ((data as Map)['reason']) {
        'ai-unavailable' => "Subtitles are unavailable right now: the AI service can't be reached.",
        'busy' => 'Subtitles are falling behind, so some lines were skipped.',
        _ => "A piece of your speech couldn't be transcribed.",
      };
      _notify();
    });
  }

  void _patchRemote(dynamic data, PeerInfo Function(PeerInfo) update) {
    final remote = _remote;
    if (remote == null || (data as Map)['clientId'] != remote.clientId) return;
    _remote = update(remote);
    _notify();
  }

  Future<void> _joinRoom() async {
    final socket = _socket;
    if (socket == null) return;
    final completer = Completer<Map>();
    socket.emitWithAck('join-room', {
      'roomId': roomId,
      'clientId': clientId,
      'name': name,
      'media': _localMedia.toJson(),
      'lang': _language,
    }, ack: (response) {
      if (!completer.isCompleted) completer.complete(response as Map);
    });

    Map res;
    try {
      res = await completer.future.timeout(const Duration(seconds: 8));
    } on TimeoutException {
      socket.disconnect().connect(); // reconnecting triggers another join
      return;
    }
    if (_ended || socket != _socket) return;

    if (res['ok'] != true) {
      if (res['error'] == 'room-full') {
        await _teardown();
        _status = CallStatus.roomFull;
      } else {
        _status = CallStatus.error;
        _error = 'The server rejected this room code.';
      }
      _notify();
      return;
    }

    _joined = true;
    _startCaptions();
    final peers = (res['peers'] as List).cast<Map>();
    if (peers.isEmpty) {
      if (_remote != null) {
        await _closePeerConnection();
        _remote = null;
      }
      _updateStatus();
      return;
    }

    final peer = PeerInfo.fromJson(peers.first);
    final samePeer = _remote?.clientId == peer.clientId && _pc != null;
    _remote = peer;
    if (res['resumed'] == true && samePeer) {
      _recoverIfNeeded(); // our socket blipped; the media connection may be fine
    } else {
      _hasConnectedToPeer = false;
      await _startPeerConnection(); // we're the newcomer: we send the offer
    }
    _updateStatus();
  }

  void _sendSignal(Map<String, dynamic> payload) {
    final to = _remote?.clientId;
    final socket = _socket;
    if (to == null || _connectionId == null || socket == null || !socket.connected) return;
    socket.emit('signal', {
      'to': to,
      'payload': {...payload, 'connectionId': _connectionId},
    });
  }

  // ---------- WebRTC ----------

  /// Both apps compare ids the same way, so they always agree on who is polite.
  bool get _polite => clientId.compareTo(_remote?.clientId ?? '') > 0;

  Future<void> _startPeerConnection() async {
    final pc = await _createPeerConnection(randomId());
    // Always create both channels, even with the camera off, so turning it on
    // later is a simple replaceTrack (no renegotiation).
    for (final kind in [RTCRtpMediaType.RTCRtpMediaTypeAudio, RTCRtpMediaType.RTCRtpMediaTypeVideo]) {
      final track = _track(kind == RTCRtpMediaType.RTCRtpMediaTypeAudio ? 'audio' : 'video');
      final init = RTCRtpTransceiverInit(direction: TransceiverDirection.SendRecv);
      if (track != null) {
        await pc.addTransceiver(track: track, kind: kind, init: init);
      } else {
        await pc.addTransceiver(kind: kind, init: init); // camera/mic off: empty channel for later
      }
    }
    // Adding transceivers fires onRenegotiationNeeded, which sends the offer.
  }

  Future<RTCPeerConnection> _createPeerConnection(String connectionId) async {
    await _closePeerConnection();
    final pc = await createPeerConnection({'iceServers': _iceServers, 'sdpSemantics': 'unified-plan'});
    _pc = pc;
    _connectionId = connectionId;
    _makingOffer = false;
    _ignoreOffer = false;

    pc.onRenegotiationNeeded = () async {
      if (_pc != pc) return;
      try {
        _makingOffer = true;
        final offer = await pc.createOffer();
        if (_pc != pc) return;
        await pc.setLocalDescription(offer);
        _sendSignal({'description': {'type': offer.type, 'sdp': offer.sdp}});
      } catch (e) {
        debugPrint('[webrtc] negotiation failed: $e');
      } finally {
        _makingOffer = false;
      }
    };

    pc.onIceCandidate = (candidate) {
      if (_pc != pc || candidate.candidate == null) return;
      _sendSignal({'candidate': candidate.toMap()});
    };

    pc.onTrack = (event) async {
      // Audio plays by itself; only the video track needs to go to the view.
      if (_pc != pc || event.track.kind != 'video') return;
      if (event.streams.isNotEmpty) {
        // Normal case: the sender grouped its tracks into a stream.
        _remoteStream = event.streams.first;
        _ownsRemoteStream = false;
      } else {
        // Older senders send a "loose" track: wrap it in a stream of our own.
        final stream = await createLocalMediaStream('remote-$connectionId');
        await stream.addTrack(event.track);
        if (_pc != pc) {
          await stream.dispose();
          return;
        }
        _remoteStream = stream;
        _ownsRemoteStream = true;
      }
      remoteRenderer.srcObject = _remoteStream;
      debugPrint('[webrtc] showing remote video');
      _notify();
    };

    pc.onConnectionState = (state) => _onConnectionState(pc, state);
    return pc;
  }

  Future<void> _handleSignal(String from, Map payload) async {
    if (_remote == null || from != _remote!.clientId) return;
    final connectionId = payload['connectionId'] as String?;
    final description = payload['description'] as Map?;
    final candidate = payload['candidate'] as Map?;

    if (connectionId != _connectionId) {
      if (description?['type'] != 'offer') return; // leftover from an old connection
      final pc = _pc;
      if (pc != null && _stateOf(pc) == RTCSignalingState.RTCSignalingStateHaveLocalOffer && !_polite) {
        return; // both started at once; ours wins
      }
      // The other side started a new connection: follow it.
      _hasConnectedToPeer = false;
      await _createPeerConnection(connectionId!);
    }

    final pc = _pc;
    if (pc == null) return;
    try {
      if (description != null) {
        final type = description['type'] as String;
        final collision = type == 'offer' &&
            (_makingOffer || _stateOf(pc) != RTCSignalingState.RTCSignalingStateStable);
        _ignoreOffer = !_polite && collision;
        if (_ignoreOffer) return;
        if (collision) {
          // Polite peer: undo our own offer before accepting theirs.
          await pc.setLocalDescription(RTCSessionDescription('', 'rollback'));
        }
        await pc.setRemoteDescription(RTCSessionDescription(description['sdp'] as String?, type));
        debugPrint('[webrtc] applied remote $type');
        if (type == 'offer') {
          await _attachLocalTracks(pc);
          final answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (_pc == pc) _sendSignal({'description': {'type': answer.type, 'sdp': answer.sdp}});
        }
      } else if (candidate != null) {
        try {
          await pc.addCandidate(RTCIceCandidate(
            candidate['candidate'] as String?,
            candidate['sdpMid'] as String?,
            (candidate['sdpMLineIndex'] as num?)?.toInt(),
          ));
        } catch (e) {
          if (!_ignoreOffer) debugPrint('[webrtc] bad ICE candidate: $e');
        }
      }
    } catch (e) {
      debugPrint('[webrtc] failed to handle signal: $e');
    }
  }

  /// Answerer side: the offer created receive-only channels; make them
  /// send-and-receive and plug in our camera/mic.
  Future<void> _attachLocalTracks(RTCPeerConnection pc) async {
    for (final t in await pc.getTransceivers()) {
      final kind = t.receiver.track?.kind;
      if (kind == null) continue;
      await t.setDirection(TransceiverDirection.SendRecv);
      final track = _track(kind);
      if (track != null) await t.sender.replaceTrack(track);
    }
  }

  void _onConnectionState(RTCPeerConnection pc, RTCPeerConnectionState state) {
    if (pc != _pc) return;
    debugPrint('[webrtc] connection state: ${state.name}');
    _disconnectTimer?.cancel();
    switch (state) {
      case RTCPeerConnectionState.RTCPeerConnectionStateConnected:
        _hasConnectedToPeer = true;
      case RTCPeerConnectionState.RTCPeerConnectionStateDisconnected:
        // Often recovers by itself; if not, look for a new network path.
        _disconnectTimer = Timer(_iceDisconnectGrace, () {
          if (_pc == pc && pc.connectionState == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
            _restartIce();
          }
        });
      case RTCPeerConnectionState.RTCPeerConnectionStateFailed:
        _restartIce();
      default:
        break;
    }
    _updateStatus();
  }

  /// New network paths without ending the call (e.g. Wi-Fi -> mobile data).
  Future<void> _restartIce() async {
    final pc = _pc;
    if (pc == null || !(_socket?.connected ?? false)) return; // retried after reconnecting
    try {
      await pc.restartIce();
    } catch (e) {
      debugPrint('[webrtc] ICE restart failed: $e');
    }
  }

  /// After a signaling reconnect: resend what may have been lost.
  void _recoverIfNeeded() {
    final pc = _pc;
    if (pc == null || pc.connectionState == RTCPeerConnectionState.RTCPeerConnectionStateConnected) return;
    if (_stateOf(pc) == RTCSignalingState.RTCSignalingStateHaveLocalOffer) {
      pc.getLocalDescription().then((d) {
        if (d != null) _sendSignal({'description': {'type': d.type, 'sdp': d.sdp}});
      });
    } else if (_stateOf(pc) == RTCSignalingState.RTCSignalingStateStable) {
      _restartIce();
    }
  }

  Future<void> _closePeerConnection() async {
    _disconnectTimer?.cancel();
    final pc = _pc;
    _pc = null;
    _connectionId = null;
    if (pc != null) {
      pc.onRenegotiationNeeded = null;
      pc.onIceCandidate = null;
      pc.onTrack = null;
      pc.onConnectionState = null;
      await pc.close();
    }
    remoteRenderer.srcObject = null;
    // Streams that belong to the peer connection are cleaned up with it.
    if (_ownsRemoteStream) await _remoteStream?.dispose();
    _remoteStream = null;
    _ownsRemoteStream = false;
  }

  void _updateStatus() {
    if (const [CallStatus.idle, CallStatus.roomFull, CallStatus.ended, CallStatus.error].contains(_status)) {
      _notify();
      return;
    }
    if (!_joined) {
      _status = CallStatus.starting;
    } else if (_remote == null) {
      _status = CallStatus.waiting;
    } else if (_pc?.connectionState == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
      _status = CallStatus.connected;
    } else {
      _status = _hasConnectedToPeer ? CallStatus.reconnecting : CallStatus.connecting;
    }
    _notify();
  }

  // ---------- Subtitles ----------

  Future<void> _startCaptions() async {
    if (!_captionsEnabled || _capture != null || _ended) return;
    if (_track('audio') == null) {
      _captionStatus = CaptionStatus.unavailable;
      _notify();
      return;
    }
    final capture = SpeechCapture(
      onSegment: _sendSegment,
      onSpeaking: (speaking) {
        if (_localSpeaking == speaking) return;
        _localSpeaking = speaking;
        _notify();
      },
    );
    _capture = capture;
    _captionStatus = CaptionStatus.starting;
    _notify();
    try {
      await capture.start();
      if (_capture != capture) return;
      if (!_localMedia.audio) capture.pause();
      _captionStatus = CaptionStatus.on;
    } catch (e) {
      debugPrint('[subtitles] could not start: $e');
      if (_capture != capture) return;
      _capture = null;
      _captionStatus = CaptionStatus.unavailable;
      _notice = "Subtitles couldn't start on this phone.";
    }
    _notify();
  }

  Future<void> _stopCaptions() async {
    final capture = _capture;
    _capture = null;
    _localSpeaking = false;
    await capture?.dispose();
  }

  void _sendSegment(Uint8List wav, int durationMs) {
    // Only transcribe when someone is there to read it: saves free-tier quota.
    final socket = _socket;
    if (!_joined || _remote == null || socket == null || !socket.connected) return;
    _segmentSeq++;
    socket.emit('audio-segment', {'seq': _segmentSeq, 'durationMs': durationMs, 'audio': wav});
  }

  void _addSubtitle(Subtitle subtitle) {
    final isOwn = subtitle.speakerId == clientId;
    final speakerName = isOwn ? name : (_remote?.clientId == subtitle.speakerId ? _remote!.name : 'Guest');
    _subtitles
      ..add(SubtitleLine(subtitle: subtitle, speakerName: speakerName, isOwn: isOwn))
      ..sort((a, b) => a.subtitle.timestamp.compareTo(b.subtitle.timestamp));
    if (_subtitles.length > _maxSubtitles) _subtitles.removeRange(0, _subtitles.length - _maxSubtitles);
    _notify();
  }
}
