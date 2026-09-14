/**
 * `npm run check:redirects -- https://your-host`
 *
 * Walks the redirect chain by hand for the states that matter, and fails
 * if any of them does not settle. The case that bit us is the third one:
 * a cookie that outlived its session, which used to bounce between /chat
 * and /login until the browser gave up.
 */
const HOST = process.argv[2] ?? "https://conversation-02.vercel.app";
const MAX_HOPS = 6;

/** A well-formed but meaningless token — exactly what a dead session leaves */
const STALE =
  "eyJhbGciOiJIUzI1NiJ9." +
  Buffer.from(JSON.stringify({ uid: "gone", sid: "gone", did: "gone", role: "PARTNER" }))
    .toString("base64url") +
  ".not-a-real-signature";

type Result = { hops: string[]; settled: boolean; status: number };

async function follow(path: string, cookie?: string): Promise<Result> {
  const hops: string[] = [];
  let url = new URL(path, HOST).toString();

  for (let i = 0; i < MAX_HOPS; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: cookie ? { cookie } : {},
    });
    hops.push(`${res.status} ${new URL(url).pathname}${new URL(url).search}`);

    if (res.status < 300 || res.status >= 400) {
      return { hops, settled: true, status: res.status };
    }

    const next = res.headers.get("location");
    if (!next) return { hops, settled: true, status: res.status };
    url = new URL(next, HOST).toString();
  }

  return { hops, settled: false, status: 0 };
}

const cases: { name: string; path: string; cookie?: string }[] = [
  { name: "no cookie, visits /", path: "/" },
  { name: "no cookie, visits /chat", path: "/chat" },
  { name: "stale cookie, visits /chat", path: "/chat", cookie: `cv_session=${STALE}` },
  { name: "stale cookie, visits /", path: "/", cookie: `cv_session=${STALE}` },
  { name: "stale cookie, visits /login", path: "/login", cookie: `cv_session=${STALE}` },
];

async function main() {
  let failed = 0;
  console.log(`\nFollowing redirects on ${HOST}\n`);

  for (const c of cases) {
    const r = await follow(c.path, c.cookie);
    if (r.settled && r.status === 200) {
      console.log(`  ✅ ${c.name}`);
      console.log(`       ${r.hops.join("  →  ")}`);
    } else {
      failed++;
      console.log(`  ❌ ${c.name}${r.settled ? ` — ended on ${r.status}` : " — never settled"}`);
      console.log(`       ${r.hops.join("  →  ")}`);
    }
  }

  console.log("");
  if (failed) {
    console.log(`${failed} of ${cases.length} failed\n`);
    process.exit(1);
  }
  console.log(`All ${cases.length} settled on a real page\n`);
}

main();
