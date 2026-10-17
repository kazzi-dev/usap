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
