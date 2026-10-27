/** Readable random password (no look-alike characters like 0/O, 1/l), from the browser's secure generator. */
export function randomPassword(length = 8) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => alphabet[n % alphabet.length]).join("");
}
