import 'dart:math';

final _random = Random.secure();
const _letters = 'abcdefghijkmnopqrstuvwxyz'; // no "l", too easy to confuse with "1"/"I"

String _randomLetters(int count) =>
    List.generate(count, (_) => _letters[_random.nextInt(_letters.length)]).join();

/// Short, readable room code like "kfp-wqzt-mbd" (same format as the web app).
String createRoomId() => '${_randomLetters(3)}-${_randomLetters(4)}-${_randomLetters(3)}';

/// Random id for a participant or a peer connection.
String randomId() => List.generate(16, (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();

final _roomIdPattern = RegExp(r'^[a-z0-9-]{3,64}$');

/// Accepts a full invite link (https://host/room/abc-defg-hij) or just the code.
String? parseRoomInput(String input) {
  var code = input.trim();
  if (code.isEmpty) return null;
  final uri = Uri.tryParse(code);
  if (uri != null && uri.hasScheme) {
    final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    code = segments.isEmpty ? '' : segments.last;
  }
  code = code.toLowerCase();
  return _roomIdPattern.hasMatch(code) ? code : null;
}

/// The signaling server that belongs to an invite link, when it can be told
/// from the link itself (otherwise null: keep the server from the settings).
///  - https://192.168.1.10:3000/room/x (local dev web app, port 3000/3001)
///      -> https://192.168.1.10:4000
///  - https://some-words.trycloudflare.com/room/x (`npm run share`: one
///      address for everything) -> https://some-words.trycloudflare.com
String? signalUrlFromInvite(String input) {
  final uri = Uri.tryParse(input.trim());
  if (uri == null || !uri.hasScheme || uri.host.isEmpty) return null;
  if (uri.hasPort && (uri.port == 3000 || uri.port == 3001)) {
    return Uri(scheme: uri.scheme, host: uri.host, port: 4000).origin;
  }
  if (uri.host.endsWith('.trycloudflare.com')) return uri.origin;
  return null;
}
