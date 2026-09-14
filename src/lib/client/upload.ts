"use client";

import { api } from "./api";

type SignedParams = {
  folder: string;
  timestamp: number;
  type: string;
  signature: string;
  apiKey: string;
  cloudName: string;
  resourceType: string;
  uploadUrl: string;
};

export type Uploaded = {
  publicId: string;
  width?: number;
  height?: number;
  bytes: number;
  duration?: number;
  mime: string;
  name: string;
};

/**
 * ফাইল সরাসরি ব্রাউজার থেকে Cloudinary-তে যায়, আমাদের সার্ভার হয়ে নয়।
 * তাই Vercel-এর ৪.৫MB body limit বা ১০ সেকেন্ড timeout বাধা দেয় না।
 */
export async function uploadFile(
  file: Blob,
  kind: "image" | "voice",
  fileName: string,
  onProgress?: (percent: number) => void,
): Promise<Uploaded> {
  const s = await api<SignedParams>("/api/media/sign", { method: "POST", json: { kind } });

  const form = new FormData();
  form.append("file", file, fileName);
  form.append("api_key", s.apiKey);
  form.append("timestamp", String(s.timestamp));
  form.append("folder", s.folder);
  form.append("type", s.type);
  form.append("signature", s.signature);

  const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", s.uploadUrl);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body?.error?.message ?? "আপলোড ব্যর্থ"));
      } catch {
        reject(new Error("আপলোডের উত্তর বোঝা গেল না"));
      }
    };
    xhr.onerror = () => reject(new Error("নেটওয়ার্ক সমস্যা — আপলোড হয়নি"));
    xhr.send(form);
  });

  return {
    publicId: String(result.public_id),
    width: typeof result.width === "number" ? result.width : undefined,
    height: typeof result.height === "number" ? result.height : undefined,
    bytes: typeof result.bytes === "number" ? result.bytes : file.size,
    duration: typeof result.duration === "number" ? result.duration : undefined,
    mime: file.type || "application/octet-stream",
    name: fileName,
  };
}
