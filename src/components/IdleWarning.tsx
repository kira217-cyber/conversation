"use client";

import { Clock } from "lucide-react";

/** ৩০ মিনিট নিষ্ক্রিয়তার শেষ ২ মিনিটে দেখা যায়। নড়াচড়া করলেই মিলিয়ে যাবে। */
export default function IdleWarning({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4">
      <div className="flex items-center gap-2.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs text-amber-100 shadow-lg backdrop-blur">
        <Clock className="h-3.5 w-3.5" />
        <span>
          আর {m > 0 ? `${m} মিনিট ` : ""}
          {String(s).padStart(2, "0")} সেকেন্ড পর লগআউট হয়ে যাবে — কিছু একটা করো
        </span>
      </div>
    </div>
  );
}
