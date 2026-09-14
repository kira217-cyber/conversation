import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

/**
 * ছবি আর ভয়েস নোট — দুটোই Cloudinary-তে।
 * ব্রাউজার সরাসরি Cloudinary-তে আপলোড করে (signed direct upload),
 * তাই Vercel-এর ৪.৫MB body limit বা function timeout-এর সমস্যা নেই।
 *
 * type: "authenticated" — মানে raw URL দিয়ে কেউ ফাইল দেখতে পারবে না,
 * সার্ভারের signed URL লাগবে।
 */
function configured() {
  const e = env();
  cloudinary.config({
    cloud_name: e.CLOUDINARY_CLOUD_NAME,
    api_key: e.CLOUDINARY_API_KEY,
    api_secret: e.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}

export type UploadKind = "image" | "voice";

export function signUpload(kind: UploadKind) {
  const e = env();
  const c = configured();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `${e.CLOUDINARY_FOLDER}/${kind === "image" ? "photos" : "voice"}`;
  const params = { folder, timestamp, type: "authenticated" };

  const signature = c.utils.api_sign_request(params, e.CLOUDINARY_API_SECRET);

  return {
    ...params,
    signature,
    apiKey: e.CLOUDINARY_API_KEY,
    cloudName: e.CLOUDINARY_CLOUD_NAME,
    // অডিও Cloudinary-তে "video" resource type-এর অধীনে যায়
    resourceType: kind === "image" ? "image" : "video",
    uploadUrl: `https://api.cloudinary.com/v1_1/${e.CLOUDINARY_CLOUD_NAME}/${
      kind === "image" ? "image" : "video"
    }/upload`,
  };
}

/** DB-তে শুধু publicId রাখি; দেখানোর সময় signed URL বানাই */
export function signedUrl(publicId: string, kind: UploadKind) {
  const c = configured();
  return c.url(publicId, {
    type: "authenticated",
    resource_type: kind === "image" ? "image" : "video",
    sign_url: true,
    secure: true,
  });
}

export async function destroyAsset(publicId: string, kind: UploadKind) {
  try {
    await configured().uploader.destroy(publicId, {
      type: "authenticated",
      resource_type: kind === "image" ? "image" : "video",
    });
  } catch (err) {
    console.error("[cloudinary] destroy failed", err);
  }
}
