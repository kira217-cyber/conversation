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
    console.error("❌ .env.local এ নেই:");
    if (!keyId) console.error("   • CLOUDFLARE_TURN_KEY_ID");
    if (!token) console.error("   • CLOUDFLARE_TURN_API_TOKEN");
    console.error("\nএগুলো ছাড়াও অ্যাপ চলবে, কিন্তু কল শুধু একই WiFi তে কাজ করবে।\n");
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
    console.error(`❌ TURN credential পাওয়া গেল না (HTTP ${res.status})`);
    console.error(`   ${text.slice(0, 300)}\n`);
    console.error("👉 Key ID আর API Token উল্টে যায়নি তো? দুটোই আলাদা মান।\n");
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

  console.log("✅ TURN credential ইস্যু হয়েছে");
  if (username) console.log(`   username: ${username.slice(0, 14)}…  (১ ঘণ্টার মেয়াদ)`);
  console.log("   servers:");
  for (const u of list) console.log(`     • ${u}`);

  const hasRelay = list.some((u) => u.startsWith("turn:") || u.startsWith("turns:"));
  if (!hasRelay) {
    console.error("\n⚠️  শুধু STUN পাওয়া গেল, TURN relay নেই — আলাদা নেটওয়ার্কে কল আটকাতে পারে\n");
    process.exit(1);
  }

  console.log("\n🎉 কল আলাদা নেটওয়ার্ক থেকেও কাজ করবে\n");
}

main().catch((err) => {
  console.error("\n❌ Cloudflare এ পৌঁছানো গেল না:\n", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});
