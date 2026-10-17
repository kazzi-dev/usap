import type { WebRtcReport } from "@usap/shared";

const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|fe80:|fc|fd)/i;

/** Does this ICE config include a TURN relay to fall back on? */
export const hasTurnServer = (servers: RTCIceServer[]) =>
  servers.some((s) => [s.urls].flat().some((u) => /^turns?:/i.test(u)));

/**
 * Which network path a connected call is using, read from WebRTC's own stats:
 * the "selected candidate pair" is the pair of addresses that actually won.
 *  - a "relay" candidate means the video goes through the TURN server;
 *  - two private addresses mean both devices are on the same network;
 *  - otherwise it's a direct connection across the internet.
 */
export async function describeRoute(pc: RTCPeerConnection): Promise<NonNullable<WebRtcReport["route"]>> {
  try {
    const stats = await pc.getStats();
    let pair: RTCIceCandidatePairStats | undefined;
    stats.forEach((report) => {
      if (report.type === "transport" && report.selectedCandidatePairId) {
        pair = stats.get(report.selectedCandidatePairId) as RTCIceCandidatePairStats;
      }
    });
    if (!pair) {
      // Firefox has no transport.selectedCandidatePairId; use the nominated pair.
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) pair = report;
      });
    }
    if (!pair) return "unknown";
    const local = stats.get(pair.localCandidateId) as { candidateType?: string; address?: string } | undefined;
    const remote = stats.get(pair.remoteCandidateId) as { candidateType?: string; address?: string } | undefined;
    if (local?.candidateType === "relay" || remote?.candidateType === "relay") return "relay";
    // "srflx" = a public address learned from the STUN server: a direct
    // connection that crosses the internet (through both routers).
    if (local?.candidateType === "srflx" || remote?.candidateType === "srflx") return "internet";
    // Otherwise both ends used local addresses. Browsers hide those behind
    // random "<uuid>.local" names for privacy, so accept those as local too.
    const isLocal = (address = "") => address === "" || address.endsWith(".local") || PRIVATE_IP.test(address);
    return isLocal(local?.address) && isLocal(remote?.address) ? "lan" : "internet";
  } catch {
    return "unknown";
  }
}
