// Dart versions of the Socket.IO messages defined in packages/shared/protocol.d.ts.
// The web app and this app speak exactly the same protocol, which is why they
// can join the same calls. If you change one, change the other.

class Language {
  const Language(this.code, this.label, this.native);

  final String code; // "en" | "tl" | "ceb" | "ja"
  final String label;
  final String native;

  String get displayName => label == native ? label : '$label ($native)';
}

const languages = <Language>[
  Language('en', 'English', 'English'),
  Language('tl', 'Tagalog', 'Tagalog'),
  Language('ceb', 'Cebuano', 'Bisaya'),
  Language('ja', 'Japanese', '日本語'),
];

Language? languageByCode(String? code) {
  for (final language in languages) {
    if (language.code == code) return language;
  }
  return null;
}

class MediaState {
  const MediaState({required this.audio, required this.video});

  final bool audio;
  final bool video;

  MediaState copyWith({bool? audio, bool? video}) =>
      MediaState(audio: audio ?? this.audio, video: video ?? this.video);

  Map<String, dynamic> toJson() => {'audio': audio, 'video': video};

  factory MediaState.fromJson(dynamic json) {
    final map = json is Map ? json : const {};
    return MediaState(audio: map['audio'] == true, video: map['video'] == true);
  }
}

class PeerInfo {
  const PeerInfo({
    required this.clientId,
    required this.name,
    required this.media,
    required this.lang,
    this.signalConnected = true,
  });

  final String clientId;
  final String name;
  final MediaState media;
  final String lang;

  /// False while the other person's connection to the signaling server is down.
  final bool signalConnected;

  PeerInfo copyWith({MediaState? media, String? lang, bool? signalConnected}) => PeerInfo(
        clientId: clientId,
        name: name,
        media: media ?? this.media,
        lang: lang ?? this.lang,
        signalConnected: signalConnected ?? this.signalConnected,
      );

  factory PeerInfo.fromJson(Map json) => PeerInfo(
        clientId: json['clientId'] as String,
        name: (json['name'] as String?) ?? 'Guest',
        media: MediaState.fromJson(json['media']),
        lang: (json['lang'] as String?) ?? 'en',
      );
}

class Subtitle {
  const Subtitle({
    required this.segmentId,
    required this.speakerId,
    required this.originalText,
    required this.translatedText,
    required this.lang,
    required this.targetLang,
    required this.timestamp,
    required this.engine,
  });

  final String segmentId;
  final String speakerId;
  final String originalText;
  final String translatedText;
  final String? lang;
  final String? targetLang;
  final int timestamp;
  final String engine;

  bool get wasTranslated => targetLang != null && targetLang != lang;

  factory Subtitle.fromJson(Map json) => Subtitle(
        segmentId: json['segmentId'] as String,
        speakerId: json['speakerId'] as String,
        originalText: (json['originalText'] as String?) ?? '',
        translatedText: (json['translatedText'] as String?) ?? '',
        lang: json['lang'] as String?,
        targetLang: json['targetLang'] as String?,
        timestamp: (json['timestamp'] as num?)?.toInt() ?? 0,
        engine: (json['engine'] as String?) ?? '',
      );
}

/// A subtitle plus what the UI needs to show it.
class SubtitleLine {
  SubtitleLine({required this.subtitle, required this.speakerName, required this.isOwn})
      : receivedAt = DateTime.now();

  final Subtitle subtitle;
  final String speakerName;
  final bool isOwn;
  final DateTime receivedAt;
}
