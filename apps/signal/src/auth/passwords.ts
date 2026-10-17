import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/*
 * Password hashing with scrypt (built into Node, no dependency).
 *
 * scrypt is deliberately slow AND memory-hungry, so guessing passwords from a
 * stolen database costs an attacker a lot of time and RAM per guess. A random
 * salt per user means identical passwords get different hashes.
 *
 * Stored format: scrypt$N$r$p$<salt base64>$<hash base64>
 * The parameters are stored with the hash, so they can be raised later
 * without breaking existing accounts.
 */

const N = 2 ** 15; // CPU/memory cost (~32 MB, ~100 ms per hash)
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function scrypt(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, KEY_LENGTH, { ...options, maxmem: 128 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
  // Constant-time comparison: doesn't leak how many bytes matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
