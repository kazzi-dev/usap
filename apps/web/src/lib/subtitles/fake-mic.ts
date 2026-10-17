/**
 * Development helper: open a room with ?fakeMic=/dev/sample-speech.wav and
 * that file plays (on a loop, with pauses) as if it were your microphone.
 * Handy for testing subtitles without talking, or on a machine with no mic.
 * Disabled in production builds.
 */
export function getFakeMicUrl(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const url = new URLSearchParams(window.location.search).get("fakeMic");
  // Same-origin paths only, so a link can't make the app fetch arbitrary URLs.
  return url && url.startsWith("/") && !url.startsWith("//") ? url : null;
}

export async function createFakeMicTrack(url: string, ctx: AudioContext): Promise<MediaStreamTrack> {
  const res = await fetch(url);
  const speech = await ctx.decodeAudioData(await res.arrayBuffer());

  // Speech followed by 2.5 s of silence, looped, so VAD sees separate segments.
  const silence = Math.round(speech.sampleRate * 2.5);
  const looped = ctx.createBuffer(1, speech.length + silence, speech.sampleRate);
  looped.copyToChannel(speech.getChannelData(0), 0);

  const source = ctx.createBufferSource();
  source.buffer = looped;
  source.loop = true;
  const destination = ctx.createMediaStreamDestination();
  source.connect(destination);
  source.start();
  return destination.stream.getAudioTracks()[0];
}
