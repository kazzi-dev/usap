import 'package:flutter_webrtc/flutter_webrtc.dart';

final _privateIp = RegExp(r'^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|fe80:|fc|fd)', caseSensitive: false);

/// Does this ICE config include a TURN relay to fall back on?
bool hasTurnServer(List<Map<String, dynamic>> servers) => servers.any((s) {
      final urls = s['urls'];
      final list = urls is List ? urls.cast<String>() : [urls.toString()];
      return list.any((u) => u.toLowerCase().startsWith('turn'));
    });

/// Which network path a connected call uses (same logic as the web app's
/// webrtc-route.ts): "relay" (through TURN), "lan" (same network), or
/// "internet" (direct across the internet).
Future<String> describeRoute(RTCPeerConnection pc) async {
  try {
    final reports = await pc.getStats();
    final byId = {for (final r in reports) r.id: r};
    StatsReport? pair;
    for (final r in reports) {
      final selected = r.values['selectedCandidatePairId'];
      if (r.type == 'transport' && selected != null) pair = byId[selected];
    }
    pair ??= reports.where((r) => r.type == 'candidate-pair' && r.values['state'] == 'succeeded' && r.values['nominated'] == true).firstOrNull;
    if (pair == null) return 'unknown';
    final local = byId[pair.values['localCandidateId']]?.values ?? const {};
    final remote = byId[pair.values['remoteCandidateId']]?.values ?? const {};
    if (local['candidateType'] == 'relay' || remote['candidateType'] == 'relay') return 'relay';
    // "srflx" = public address from STUN: direct, but across the internet.
    if (local['candidateType'] == 'srflx' || remote['candidateType'] == 'srflx') return 'internet';
    // Browsers hide local IPs behind random "<uuid>.local" names; count those as local.
    bool isLocal(Object? a) {
      final address = (a ?? '').toString();
      return address.isEmpty || address.endsWith('.local') || _privateIp.hasMatch(address);
    }
    return isLocal(local['address'] ?? local['ip']) && isLocal(remote['address'] ?? remote['ip']) ? 'lan' : 'internet';
  } catch (_) {
    return 'unknown';
  }
}
