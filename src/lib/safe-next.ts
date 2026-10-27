/** Only allow redirects to our own pages (blocks "//evil.com" and absolute URLs). */
export function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
