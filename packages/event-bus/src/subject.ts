/**
 * NATS subject wildcard matching, used by the in-memory bus to route published
 * subjects to subscriptions. Mirrors NATS semantics:
 *  - `*` matches exactly one token,
 *  - `>` matches one or more trailing tokens (must be the last token).
 */
export function subjectMatches(pattern: string, subject: string): boolean {
  const p = pattern.split(".");
  const s = subject.split(".");
  for (let i = 0; i < p.length; i++) {
    const token = p[i];
    if (token === ">") return s.length >= i + 1;
    if (i >= s.length) return false;
    if (token === "*") continue;
    if (token !== s[i]) return false;
  }
  return p.length === s.length;
}
