# 🚀 চালু করার নিয়ম — ধাপে ধাপে

সময় লাগবে আনুমানিক **৪০–৫০ মিনিট** (বেশিরভাগই অ্যাকাউন্ট খোলা)।
কোড পুরো লেখা আছে — আপনার কাজ শুধু credential বসানো।

---

## ধাপ ১ — সিক্রেট দুটো বানান (৩০ সেকেন্ড)

```bash
npm run keys
```

আউটপুটের দুই লাইন পরে `.env.local` এ বসাবেন।

> ⚠️ `MESSAGE_ENCRYPTION_KEY` একবার সেট করার পর **আর কখনো বদলাবেন না** —
> বদলালে আগের সব মেসেজ পড়া যাবে না।

---

## ধাপ ২ — অ্যাকাউন্টগুলো খুলুন (~৩০ মিনিট)

সবগুলো ফ্রি, কার্ড লাগে না।

### ক. Database — [neon.tech](https://neon.tech) · ৫ মিনিট

1. Sign up → **Create project**, নাম `conversation`
2. Region: **Singapore (ap-southeast-1)** — বাংলাদেশ থেকে সবচেয়ে কাছে
3. Connection string-এ দুটো টগল আছে:
   - **Pooled connection** → `DATABASE_URL`
   - **Direct connection** → `DIRECT_URL`

### খ. Realtime — [pusher.com](https://pusher.com) · ৫ মিনিট

1. Sign up → **Channels** → Create app
2. Cluster: **ap2 (Asia Pacific — Singapore)**
3. **App Keys** ট্যাব থেকে চারটা মান নিন
4. `PUSHER_KEY` এর মানটাই `NEXT_PUBLIC_PUSHER_KEY` এ আবার বসান
   (⚠️ `PUSHER_SECRET` কখনো `NEXT_PUBLIC_` এ নয়)

### গ. ছবি ও ভয়েস — [cloudinary.com](https://cloudinary.com) · ৫ মিনিট

1. Sign up → Dashboard-এ **Cloud name / API Key / API Secret** পাবেন
2. `CLOUDINARY_CLOUD_NAME` এর মানটাই `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` এ বসান
3. আলাদা কোনো preset বানাতে হবে না — signed upload কোডেই আছে

### ঘ. ভয়েস কল (TURN) — [dash.cloudflare.com](https://dash.cloudflare.com) · ১০ মিনিট

1. Cloudflare account → **Realtime** → **TURN**
2. **Create TURN key** → `Key ID` আর `API Token` নিন

> **এটা বাদ দিলে কী হবে?** কল শুধু তখনই কাজ করবে যখন দুজন একই WiFi-তে আছে।
> আলাদা মোবাইল নেটওয়ার্কে (GP/Robi) কল "connecting..." এ আটকে থাকবে।
> **তাই এটা বাদ দেবেন না।**

---

## ধাপ ৩ — `.env.local` বানান (৫ মিনিট)

```bash
cp .env.example .env.local
```

তারপর সব ভ্যালু বসান। নিচের চারটা নিজের মতো করে দিন:

```bash
SEED_A_EMAIL="tomar@ours.app"       # আপনার লগইন
SEED_A_PASSWORD="..."               # কমপক্ষে ১২ অক্ষর
SEED_A_NAME="তোমার নাম"

SEED_B_EMAIL="tar@ours.app"         # তার লগইন
SEED_B_PASSWORD="..."
SEED_B_NAME="তার নাম"

NEXT_PUBLIC_ANNIVERSARY_DATE="2024-02-14"   # সম্পর্কের শুরুর তারিখ
```

---

## ধাপ ৪ — ডেটাবেস তৈরি ও অ্যাকাউন্ট বসানো (২ মিনিট)

```bash
npm run db:push     # টেবিল তৈরি
npm run db:seed     # দুটো অ্যাকাউন্ট + conversation তৈরি
```

`db:seed` বারবার চালানো নিরাপদ — পাসওয়ার্ড বদলাতে চাইলে `.env.local` এ
নতুন পাসওয়ার্ড দিয়ে আবার চালালেই হবে।

---

## ধাপ ৫ — লোকালি চালিয়ে দেখুন (২ মিনিট)

```bash
npm run dev
```

তারপর **দুটো আলাদা ব্রাউজারে** (Chrome + Firefox, অথবা একটা normal + একটা incognito)
`http://localhost:3000` খুলে দুজনের অ্যাকাউন্ট দিয়ে লগইন করুন।

### যা যা পরীক্ষা করবেন

| পরীক্ষা | যা হওয়া উচিত |
|---|---|
| মেসেজ পাঠান | ১ সেকেন্ডের কমে অন্য ব্রাউজারে পৌঁছাবে |
| টিক দেখুন | ✓ → ✓✓ → ✓✓ নীল |
| টাইপ করুন | অন্যদিকে "লিখছে..." |
| ছবি পাঠান | প্রিভিউ আসবে, ক্লিক করলে বড় হবে |
| মাইক বাটন চেপে কথা বলুন | waveform সহ ভয়েস নোট যাবে |
| ফোন আইকনে চাপুন | অন্যদিকে কল আসবে, ধরলে কথা শোনা যাবে |
| **তৃতীয় ব্রাউজারে একই অ্যাকাউন্টে লগইন** | প্রথমটা সাথে সাথে লগআউট হবে ⭐ |
| **ট্যাব বন্ধ করে আবার খুলুন** | লগইন পেজ আসবে ⭐ |
| ৩০ মিনিট কিছু না করে বসে থাকুন | ২৮ মিনিটে সতর্কবার্তা, ৩০-এ লগআউট ⭐ |

> 🎤 **মাইক/ক্যামেরা `localhost` এ কাজ করবে**, কিন্তু লোকাল নেটওয়ার্কের IP
> (যেমন `192.168.0.5:3000`) দিয়ে খুললে ব্রাউজার অনুমতি দেবে না — HTTPS লাগে।
> ফোনে টেস্ট করতে হলে আগে Vercel-এ deploy করে নিন।

---

## ধাপ ৬ — Vercel-এ deploy (১০ মিনিট)

```bash
git init
git add .
git commit -m "Conversation — private couple chat"
```

GitHub-এ **private** repo বানিয়ে push করুন, তারপর:

1. [vercel.com](https://vercel.com) → **Add New Project** → repo সিলেক্ট
2. Framework: Next.js (নিজেই ধরে ফেলবে), Root Directory: `./`
3. **Environment Variables** — `.env.local` এর সব লাইন কপি-পেস্ট করুন
   (Vercel-এ একসাথে পুরো `.env` পেস্ট করা যায়)
4. Deploy

### Deploy-এর পর

```bash
# production DB-তে টেবিল তৈরি (একবার)
npm run db:push
npm run db:seed
```

> লোকাল `.env.local` এ যদি production Neon URL-ই থাকে, তাহলে ধাপ ৪-এই কাজটা
> হয়ে গেছে — আবার করার দরকার নেই।

### ডোমেইন

Vercel → Project → **Settings → Domains** → নিজের ডোমেইন যোগ করুন।
HTTPS নিজে থেকেই হয়ে যাবে (মাইক আর ক্যামেরার জন্য এটা বাধ্যতামূলক)।

---

## ধাপ ৭ — ফোনে ইনস্টল

ডোমেইন খুলে:

- **Android (Chrome):** মেনু → "Add to Home screen"
- **iPhone (Safari):** Share → "Add to Home Screen"

এরপর অ্যাপের মতোই খুলবে, address bar থাকবে না।

---

## 🔐 নিরাপত্তা — কী কী আছে

| সুরক্ষা | কোথায় |
|---|---|
| register page নেই, অ্যাকাউন্ট শুধু seed থেকে | `prisma/seed.ts` |
| পাসওয়ার্ড bcrypt (cost 12) | `prisma/seed.ts`, `api/auth/login` |
| ৫ বার ভুল → ১৫ মিনিট লক | `api/auth/login/route.ts` |
| এক ডিভাইস — নতুন লগইনে পুরোনোটা kill | `lib/auth.ts` → `createSession()` |
| ট্যাব বন্ধ → logout | `hooks/useSessionGuard.ts` |
| ৩০ মিনিট idle → logout | `lib/auth.ts` → `getAuth()` |
| মেসেজ DB-তে AES-256-GCM encrypted | `lib/crypto.ts` |
| ছবি/ভয়েস signed URL ছাড়া দেখা যায় না | `lib/cloudinary.ts` |
| realtime চ্যানেলে অনুমতি যাচাই | `api/pusher/auth/route.ts` |
| security headers (CSP-lite, HSTS, no-iframe) | `next.config.ts` |

---

## ⚠️ যে সমস্যাগুলো হতে পারে

| সমস্যা | সমাধান |
|---|---|
| `Environment variable সমস্যা` | বার্তাটা পড়ুন — কোন ভ্যারিয়েবল ভুল লেখা আছে |
| `MESSAGE_ENCRYPTION_KEY ঠিক ৩২ বাইট...` | `npm run keys` থেকে পাওয়া মানটাই বসান |
| মেসেজ যাচ্ছে কিন্তু realtime আসছে না | `NEXT_PUBLIC_PUSHER_KEY` আর cluster মিলছে কিনা দেখুন |
| ছবি আপলোড fail | Cloudinary-র তিনটা মান ঠিক আছে কিনা |
| কল "connecting..." এ আটকে | TURN সেট করা নেই — ধাপ ২(ঘ) |
| মাইক কাজ করছে না | HTTPS বা localhost লাগবে, IP দিয়ে হবে না |

---

## 🎁 সময় থাকলে যোগ করা যায়

- Web Push notification (ট্যাব বন্ধ থাকলেও মেসেজের নোটিফিকেশন)
- জন্মদিনের সারপ্রাইজ স্ক্রিন (প্রথম লগইনে confetti + চিঠি)
- মেসেজ সার্চ
- চ্যাট ওয়ালপেপার বদলানোর অপশন
