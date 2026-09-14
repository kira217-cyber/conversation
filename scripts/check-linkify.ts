import { tokenize } from "../src/lib/linkify";

/**
 * `npm run check:linkify`
 * The risk is not missing a link — it is turning ordinary writing into one.
 */

type Case = { text: string; links: string[] };

const cases: Case[] = [
  // should link
  { text: "https://youtube.com/watch?v=abc123", links: ["https://youtube.com/watch?v=abc123"] },
  { text: "look at www.google.com ok", links: ["www.google.com"] },
  { text: "github.com/kira217-cyber", links: ["github.com/kira217-cyber"] },
  { text: "mail me at raihan@697gmail.com", links: ["raihan@697gmail.com"] },
  { text: "call 01712345678", links: ["01712345678"] },
  { text: "Check https://example.com. Then rest.", links: ["https://example.com"] },
  { text: "(see https://example.com/a)", links: ["https://example.com/a"] },
  { text: "two https://a.com and https://b.org", links: ["https://a.com", "https://b.org"] },
  { text: "conversation-02.vercel.app works", links: ["conversation-02.vercel.app"] },

  // should NOT link
  { text: "ok.thanks", links: [] },
  { text: "hello.world how are you", links: [] },
  { text: "i love you...", links: [] },
  { text: "the price is 1.5 taka", links: [] },
  { text: "শুভ জন্মদিন 💜", links: [] },
  { text: "no.way that happened", links: [] },
  { text: "Wait. Really?", links: [] },
  { text: "<script>alert(1)</script>", links: [] },
];

let failed = 0;
console.log("");

for (const c of cases) {
  const found = tokenize(c.text)
    .filter((t) => t.type === "link")
    .map((t) => t.value);

  const ok =
    found.length === c.links.length && found.every((f, i) => f === c.links[i]);

  // Text must survive untouched, whatever happens
  const rebuilt = tokenize(c.text)
    .map((t) => t.value)
    .join("");
  const lossless = rebuilt === c.text;

  if (!ok || !lossless) {
    failed++;
    console.log(`  ❌ ${JSON.stringify(c.text)}`);
    if (!ok) console.log(`       expected [${c.links}] but got [${found}]`);
    if (!lossless) console.log(`       text changed: ${JSON.stringify(rebuilt)}`);
  } else {
    console.log(`  ✅ ${JSON.stringify(c.text)}${found.length ? `  →  ${found.join(", ")}` : ""}`);
  }
}

console.log("");
if (failed) {
  console.log(`${failed} of ${cases.length} failed\n`);
  process.exit(1);
}
console.log(`All ${cases.length} passed\n`);
