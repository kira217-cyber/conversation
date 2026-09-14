/**
 * `npm run check:turn`
 * Cloudflare TURN credential সত্যিই ইস্যু হয় কিনা দেখে।
 * এটা কাজ না করলে আলাদা নেটওয়ার্কে (একজন WiFi, একজন মোবাইল ডেটা) কল হবে না।
 */
async function main() {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;

  console.log("");
  if (!keyId || !token) {
    console.error("❌ Missing from .env.local:");
    if (!keyId) console.error("   • CLOUDFLARE_TURN_KEY_ID");
    if (!token) console.error("   • CLOUDFLARE_TURN_API_TOKEN");
    console.error("\nThe app still runs without these, but calls will only work on the same network.\n");
    process.exit(1);
  }

  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 3600 }),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ Could not get TURN credentials (HTTP ${res.status})`);
    console.error(`   ${text.slice(0, 300)}\n`);
    console.error("👉 Check the Key ID and API Token are not swapped — they are different values.\n");
    process.exit(1);
  }

  // Cloudflare iceServers কে অ্যারে হিসেবে ফেরত দেয়
  type IceServer = { urls?: string | string[]; username?: string };
  const data = JSON.parse(text) as { iceServers?: IceServer | IceServer[] };

  const servers: IceServer[] = Array.isArray(data.iceServers)
    ? data.iceServers
    : data.iceServers
      ? [data.iceServers]
      : [];

  const list = servers.flatMap((s) =>
    Array.isArray(s.urls) ? s.urls : s.urls ? [s.urls] : [],
  );
  const username = servers.find((s) => s.username)?.username;

  console.log("✅ TURN credentials issued");
  if (username) console.log(`   username: ${username.slice(0, 14)}…  (valid for 1 hour)`);
  console.log("   servers:");
  for (const u of list) console.log(`     • ${u}`);

  const hasRelay = list.some((u) => u.startsWith("turn:") || u.startsWith("turns:"));
  if (!hasRelay) {
    console.error("\n⚠️  Only STUN returned, no TURN relay — calls may fail across networks\n");
    process.exit(1);
  }

  console.log("\n🎉 Calls will work across different networks\n");
}

main().catch((err) => {
  console.error("\n❌ Could not reach Cloudflare:\n", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});

export {};
