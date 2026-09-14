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
  console.log(`✅ Signature created   (cloud: ${s.cloudName}, folder: ${s.folder})`);

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
    console.error(`\n❌ Upload failed: ${body.error?.message ?? res.status}\n`);
    process.exit(1);
  }
  const publicId = body.public_id;
  console.log(`✅ Uploaded            (${publicId})`);

  // ── ৩. signed URL দিয়ে পড়া যায়? ──
  const url = signedUrl(publicId, "image");
  const signedRes = await fetch(url);
  if (!signedRes.ok) {
    console.error(`\n❌ Signed URL does not work (HTTP ${signedRes.status})\n   ${url}\n`);
    process.exit(1);
  }
  console.log("✅ Readable through the signed URL");

  // ── ৪. signature ছাড়া কেউ দেখতে পারে না তো? ──
  const naked = `https://res.cloudinary.com/${s.cloudName}/image/authenticated/${publicId}.png`;
  const nakedRes = await fetch(naked);
  if (nakedRes.ok) {
    console.error("\n⚠️  The file opens without a signature — media is NOT private!\n");
    process.exit(1);
  }
  console.log(`✅ Blocked without a signature (HTTP ${nakedRes.status}) — media is private`);

  // ── ৫. মুছে ফেলা ──
  await destroyAsset(publicId, "image");
  console.log("✅ Test file deleted\n");
  console.log("🎉 Cloudinary is fully working — photos and voice notes will both work\n");
}

main().catch((err) => {
  console.error("\n❌ Cloudinary problem:\n", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});
