const LETTERS = "abcdefghijkmnopqrstuvwxyz"; // no "l", too easy to confuse with "1"/"I"

function randomLetters(count: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(count));
  return Array.from(bytes, (b) => LETTERS[b % LETTERS.length]).join("");
}

/** Short, readable room code like "kfp-wqzt-mbd" (~2^47 combinations, hard to guess). */
export function createRoomId(): string {
  return `${randomLetters(3)}-${randomLetters(4)}-${randomLetters(3)}`;
}

/**
 * Random id for a participant or a peer connection.
 * (crypto.randomUUID only exists on https/localhost pages; getRandomValues
 * works everywhere, so we can still show a helpful error on plain http.)
 */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Accepts a full invite link or just the code; returns the room code or null. */
export function parseRoomInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let code = trimmed;
  try {
    const url = new URL(trimmed);
    code = url.pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    // Not a URL, treat it as a code.
  }
  code = code.toLowerCase();
  return /^[a-z0-9-]{3,64}$/.test(code) ? code : null;
}
