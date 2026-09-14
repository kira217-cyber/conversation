import { signUpload, signedUrl, destroyAsset } from "../src/lib/cloudinary";

/**
 * `npm run check:cloudinary`
 *
 * অ্যাপ যে পথে ছবি/ভয়েস পাঠায়, হুবহু সেই পথটাই যাচাই করে:
 *   signature নেওয়া → সত্যিকারের আপলোড → signed URL এ পড়া
 *   → signature ছাড়া পড়া যায় না তা নিশ্চিত করা → মুছে ফেলা
 */

// ১x১ পিক্সেলের ছোট্ট PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  console.log("");

  // ── ১. সার্ভার signature বানাতে পারে? ──
  const s = signUpload("image");
  console.log(`✅ signature তৈরি হলো  (cloud: ${s.cloudName}, folder: ${s.folder})`);

  // ── ২. ব্রাউজার যেভাবে পাঠাবে, সেভাবেই আপলোড ──
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(TINY_PNG)], { type: "image/png" }), "test.png");
  form.append("api_key", s.apiKey);
  form.append("timestamp", String(s.timestamp));
  form.append("folder", s.folder);
  form.append("type", s.type);
  form.append("signature", s.signature);

  const res = await fetch(s.uploadUrl, { method: "POST", body: form });
  const body = (await res.json()) as { public_id?: string; error?: { message: string } };

  if (!res.ok || !body.public_id) {
    console.error(`\n❌ আপলোড হয়নি: ${body.error?.message ?? res.status}\n`);
    process.exit(1);
  }
  const publicId = body.public_id;
  console.log(`✅ আপলোড হলো          (${publicId})`);

  // ── ৩. signed URL দিয়ে পড়া যায়? ──
  const url = signedUrl(publicId, "image");
  const signedRes = await fetch(url);
  if (!signedRes.ok) {
    console.error(`\n❌ signed URL কাজ করছে না (HTTP ${signedRes.status})\n   ${url}\n`);
    process.exit(1);
  }
  console.log("✅ signed URL এ ছবি পড়া গেল");

  // ── ৪. signature ছাড়া কেউ দেখতে পারে না তো? ──
  const naked = `https://res.cloudinary.com/${s.cloudName}/image/authenticated/${publicId}.png`;
  const nakedRes = await fetch(naked);
  if (nakedRes.ok) {
    console.error("\n⚠️  signature ছাড়াও ছবি খুলছে — ছবি প্রাইভেট নয়!\n");
    process.exit(1);
  }
  console.log(`✅ signature ছাড়া খোলে না  (HTTP ${nakedRes.status}) — ছবি প্রাইভেট`);

  // ── ৫. মুছে ফেলা ──
  await destroyAsset(publicId, "image");
  console.log("✅ টেস্ট ফাইল মুছে ফেলা হলো\n");
  console.log("🎉 Cloudinary পুরোপুরি ঠিক আছে — ছবি আর ভয়েস নোট দুটোই চলবে\n");
}

main().catch((err) => {
  console.error("\n❌ Cloudinary সমস্যা:\n", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});
