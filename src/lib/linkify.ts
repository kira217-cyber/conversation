/**
 * Finds links, emails and phone numbers in message text.
 *
 * Kept separate from the component so it can be exercised on its own —
 * the risk here is not missing a link, it is turning ordinary writing
 * like "ok.thanks" into one.
 */

export type Token =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

/**
 * A bare domain is only treated as a link when it ends in a TLD people
 * actually use. Without this, any two words joined by a full stop
 * becomes a link.
 */
const TLDS = [
  "com", "net", "org", "edu", "gov", "mil", "int", "info", "biz", "io", "co",
  "app", "dev", "ai", "me", "tv", "cc", "xyz", "site", "online", "store",
  "shop", "blog", "page", "link", "live", "news", "tech", "cloud", "space",
  "fun", "click", "top", "pro", "run", "sh", "gg", "to", "ly", "be", "so",
  "bd", "in", "uk", "us", "ca", "au", "de", "fr", "jp", "cn", "ru", "br",
  "pk", "np", "lk", "my", "sg", "ae", "sa", "za", "ng", "id", "ph", "th",
  "vn", "kr", "it", "es", "nl", "se", "no", "fi", "dk", "pl", "tr", "ch",
];

const TLD = TLDS.join("|");

const PATTERN = new RegExp(
  [
    // http(s)://…
    String.raw`\bhttps?:\/\/[^\s<>"']+`,
    // www.something…
    String.raw`\bwww\.[^\s<>"']+`,
    // email
    String.raw`\b[^\s@<>()]+@[^\s@<>()]+\.(?:${TLD})\b`,
    // bare domain with a known TLD, optionally with a path
    String.raw`\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:${TLD})\b(?:\/[^\s<>"']*)?`,
    // phone: +880 1712-345678, 01712345678
    String.raw`(?<![\w.])\+?\d[\d\s-]{7,16}\d(?![\w.])`,
  ].join("|"),
  "gi",
);

/** Trailing punctuation belongs to the sentence, not the link */
function splitTrailing(raw: string): [string, string] {
  const m = raw.match(/[.,!?;:"'…]+$/);
  if (!m) {
    // a closing bracket only counts as part of the link if it was opened in it
    const close = raw.match(/[)\]}]+$/);
    if (close) {
      const opens = (raw.match(/[([{]/g) ?? []).length;
      const closes = (raw.match(/[)\]}]/g) ?? []).length;
      if (closes > opens) {
        const extra = closes - opens;
        return [raw.slice(0, raw.length - extra), raw.slice(raw.length - extra)];
      }
    }
    return [raw, ""];
  }
  return [raw.slice(0, raw.length - m[0].length), m[0]];
}

export function hrefFor(token: string): string | null {
  if (/^https?:\/\//i.test(token)) return token;
  if (/^www\./i.test(token)) return `https://${token}`;
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i.test(token)) return `mailto:${token}`;
  if (/^\+?[\d\s-]{8,}$/.test(token)) return `tel:${token.replace(/[\s-]/g, "")}`;
  if (new RegExp(`^(?:[a-z0-9-]+\\.)+(?:${TLD})(?:/|$)`, "i").test(token)) {
    return `https://${token}`;
  }
  return null;
}

export function tokenize(text: string): Token[] {
  if (!text) return [];

  const out: Token[] = [];
  let last = 0;

  PATTERN.lastIndex = 0;
  for (const match of text.matchAll(PATTERN)) {
    const raw = match[0];
    const start = match.index ?? 0;

    const lead = raw.match(/^\s+/)?.[0] ?? "";
    const [clean, tail] = splitTrailing(raw.slice(lead.length));
    const href = hrefFor(clean);
    if (!href) continue;

    if (start > last) out.push({ type: "text", value: text.slice(last, start) });
    if (lead) out.push({ type: "text", value: lead });

    out.push({ type: "link", value: clean, href });
    if (tail) out.push({ type: "text", value: tail });

    last = start + raw.length;
  }

  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}
