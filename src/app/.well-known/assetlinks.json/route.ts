export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Digital Asset Links — how Android decides the APK and this site are
 * the same thing. Without it the app still runs, but it shows a browser
 * address bar across the top instead of looking like a real app.
 *
 * Fill ANDROID_PACKAGE_NAME and ANDROID_SHA256_FINGERPRINT after the APK
 * is built; the signing fingerprint only exists once a key has signed it.
 */
export async function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINT ?? "")
    .split(",")
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
      // Android re-checks this; a long cache would make a fix take hours to land
      "Cache-Control": "public, max-age=300",
    },
  });
}
