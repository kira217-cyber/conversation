import android from "@/lib/android.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Digital Asset Links — how Android decides the APK and this site are
 * the same thing. Without it the app still works, but keeps a browser
 * address bar pinned across the top instead of looking like an app.
 *
 * Values come from src/lib/android.json, which the APK workflow fills in
 * after signing (the fingerprint does not exist until a key has signed
 * the build). Environment variables override it if they are set.
 */
export async function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME || android.packageName;

  const fingerprints = (
    process.env.ANDROID_SHA256_FINGERPRINT
      ? process.env.ANDROID_SHA256_FINGERPRINT.split(",")
      : android.fingerprints
  )
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);

  const body =
    packageName && fingerprints.length
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: packageName,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [];

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      // Android re-checks this, so a long cache would make a fix take hours
      "Cache-Control": "public, max-age=300",
    },
  });
}
