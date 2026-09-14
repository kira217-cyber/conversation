import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** ল্যান্ডিং পেজ নেই — ডোমেইনে ঢুকলেই হয় চ্যাট, নয় লগইন */
export default async function Home() {
  const auth = await getAuth({ touch: false });
  redirect(auth.ok ? "/chat" : "/login");
}
