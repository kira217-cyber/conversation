import Pusher from "pusher";

/**
 * `npm run check:pusher`
 * Pusher credential ঠিক আছে কিনা — সত্যিকারের একটা event পাঠিয়ে দেখে।
 */
async function main() {
  const need = ["PUSHER_APP_ID", "PUSHER_KEY", "PUSHER_SECRET", "PUSHER_CLUSTER"];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`\n❌ Missing from .env.local: ${missing.join(", ")}\n`);
    process.exit(1);
  }

  const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.PUSHER_CLUSTER!,
    useTLS: true,
  });

  await pusher.trigger("test-channel", "test-event", { hello: "💜" });
  console.log("\n✅ Pusher works — test event delivered");

  // ব্রাউজার যে key দিয়ে connect করবে সেটা সার্ভারের key এর সমান কিনা
  if (process.env.NEXT_PUBLIC_PUSHER_KEY !== process.env.PUSHER_KEY) {
    console.error("⚠️  NEXT_PUBLIC_PUSHER_KEY does not match PUSHER_KEY — realtime will not work");
    process.exit(1);
  }
  if (process.env.NEXT_PUBLIC_PUSHER_CLUSTER !== process.env.PUSHER_CLUSTER) {
    console.error("⚠️  The two cluster values differ — realtime will not work");
    process.exit(1);
  }
  console.log("✅ NEXT_PUBLIC_ values match too\n");
}

main().catch((err) => {
  console.error("\n❌ Could not reach Pusher:\n", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});
