# 📅 Timeline Breakdown — 14 Days

> ⏱️ **প্রস্তাবিত workload:** দিনে ৫–৭ ঘণ্টা।
> রেফারেন্স রিপোর ৫ দিনের প্ল্যান শুধু backend-এর জন্য ছিল। আপনার এখানে **Next.js frontend + realtime + WebRTC call** আছে — তাই বাস্তবসম্মত সময় ১৪ দিন।

---

## 🗓️ High-Level Overview

| Day | Focus | Output |
|:---:|:---|:---|
| **1** | Planning, Schema, Setup | ERD, Prisma schema, দুই project scaffold, প্রথম deploy |
| **2** | Auth core | Login, JWT, session, seed, RBAC middleware |
| **3** | Session security 🔐 | Single-device, tab-close, 30-min idle — তিনটাই |
| **4** | Message API | CRUD, cursor pagination, encryption, receipts |
| **5** | Realtime wiring | Pusher auth, channels, events, presence |
| **6** | Chat UI (1) | Layout, bubble, composer, message list |
| **7** | Chat UI (2) | Ticks, typing, online, infinite scroll, optimistic send |
| **8** | 🎯 **MVP DEPLOY** | পুরো text chat live, দুই ফোনে টেস্ট |
| **9** | Media | Cloudinary signed upload, image/video/file |
| **10** | Voice note | Record, waveform, playback |
| **11** | Message actions | Reply, react, delete, edit, star, search |
| **12** | Audio call 📞 | WebRTC + TURN + signaling + UI |
| **13** | Video call 📹 | Video track, call history, ringtone, push notification |
| **14** | Polish & Gift 💜 | Couple features, PWA, QA, final deploy |

---

## 🟢 Day 1 — Planning, Database & Setup

**লক্ষ্য:** ভিত শক্ত করা। Schema ভুল হলে পরে অনেক ভুগবেন।

- [ ] এই `docs/` ফোল্ডারের প্ল্যান পড়ে চূড়ান্ত করা (feature কাটছাঁট করলে এখনই)
- [ ] ERD আঁকা (dbdiagram.io বা Excalidraw)
- [ ] Neon DB বানানো, connection string নেওয়া
- [ ] `server/` — `pnpm init`, TypeScript, Express 5, ESLint, Prettier setup
- [ ] `prisma/schema.prisma` লেখা (`01-project-plan.md` থেকে কপি) → `migrate dev`
- [ ] `src/config/env.ts` — Zod দিয়ে env validate (missing env হলে boot-এই crash করবে)
- [ ] `src/utils/` — `ApiError`, `catchAsync`, `sendResponse`
- [ ] `globalErrorHandler` + `/health` route
- [ ] `client/` — `create-next-app` (TS, Tailwind, App Router), shadcn init
- [ ] Git init + প্রথম commit
- [ ] **দুইটাই Vercel-এ deploy করে দেখা — আজই।** প্রতিদিন deploy করবেন, শেষদিনে নয়

## 🔵 Day 2 — Authentication Core

- [ ] `prisma/seed.ts` — ২ partner + ১ admin + ১ conversation
- [ ] `lib/jwt.ts` — access/refresh sign + verify
- [ ] argon2id দিয়ে password hash + verify
- [ ] `POST /auth/login` — session তৈরি, cookie সেট
- [ ] `POST /auth/refresh` — token rotation সহ
- [ ] `POST /auth/logout`
- [ ] `middlewares/auth.ts` + `middlewares/role.ts`
- [ ] `GET /users/me`, `PATCH /users/me`
- [ ] `POST /auth/change-password` (`mustChangePw` flow)
- [ ] Admin: `POST /admin/users`, `GET /admin/users`
- [ ] Postman collection শুরু + auto-save token script

## 🔴 Day 3 — Session Security (সবচেয়ে গুরুত্বপূর্ণ দিন)

**লক্ষ্য:** আপনার চারটা নিরাপত্তার দাবি সত্যি করা। বিস্তারিত `03-security-spec.md`-এ।

- [ ] **Single-device:** login-এ সব পুরোনো session revoke (transaction)
- [ ] auth middleware-এ `revokedAt` check → 401
- [ ] **30-min idle:** `lastActiveAt` sliding check + throttled DB write
- [ ] `POST /auth/heartbeat`
- [ ] **Tab close:** session cookie (no maxAge) + `sessionStorage` marker + `pagehide` beacon
- [ ] Rate limit (Upstash) — login-এ ৫/১৫মিনিট
- [ ] Account lockout (৫ বার ভুল → ১৫ মিনিট)
- [ ] helmet + CSP + strict CORS + CSRF double-submit
- [ ] `AuditLog` — সব auth event
- [ ] Cleanup cron route + `CRON_SECRET`
- [ ] **টেস্ট:** `03-security-spec.md`-এর checklist ধরে Postman + দুই ব্রাউজারে

## 🟡 Day 4 — Message API

- [ ] `lib/crypto.ts` — AES-256-GCM encrypt/decrypt
- [ ] `POST /messages` — `clientMsgId` idempotency সহ
- [ ] `GET /messages` — cursor pagination (নতুন → পুরোনো)
- [ ] `MessageReceipt` auto-create (transaction-এ)
- [ ] `POST /messages/read` + `/delivered`
- [ ] `PATCH /messages/:id` (edit, ১৫ মিনিট window)
- [ ] `DELETE /messages/:id?scope=me|all`
- [ ] `GET /conversation` + `PATCH /conversation`
- [ ] সব route-এ Zod validation
- [ ] Index যাচাই — `EXPLAIN ANALYZE` দিয়ে দেখুন seq scan হচ্ছে কিনা

## 🟣 Day 5 — Realtime Layer

- [ ] Pusher app বানানো (cluster `ap2`)
- [ ] `lib/realtime.ts` — swappable wrapper
- [ ] `POST /pusher/auth` — JWT verify করে private/presence authorize
- [ ] Message create/edit/delete/read → event trigger
- [ ] `POST /presence/typing` → event (DB hit ছাড়া)
- [ ] `session:force-logout` event trigger
- [ ] ক্লায়েন্টে `usePusher` hook + reconnect handling
- [ ] দুই ব্রাউজার খুলে raw event console-এ দেখা

## 🟠 Day 6 — Chat UI (Part 1)

- [ ] Login page — WhatsApp-এর মতো clean, no signup link
- [ ] Auth store (Zustand) + API client (refresh interceptor সহ)
- [ ] Protected layout + `middleware.ts` route guard
- [ ] Chat shell: header (avatar, name, online, call buttons) + wallpaper
- [ ] `MessageBubble` — left/right, tail, time, tick, long text wrap
- [ ] `DateDivider` ("আজ", "গতকাল", তারিখ)
- [ ] `Composer` — auto-grow textarea, emoji picker, attach, send/mic toggle
- [ ] Mobile-first responsive (৩৬০px থেকে দেখুন)

## 🟠 Day 7 — Chat UI (Part 2)

- [ ] Optimistic send (clock → ✓ → ✓✓ → ✓✓ blue)
- [ ] Reverse infinite scroll + scroll position ধরে রাখা
- [ ] `TypingIndicator` (তিনটা bouncing dot)
- [ ] Online / "last seen 5 min ago" header-এ
- [ ] Auto-scroll to bottom + "↓ নতুন মেসেজ" pill
- [ ] Unread divider ("এখান থেকে না পড়া")
- [ ] Message send/receive sound
- [ ] Dark mode
- [ ] Reconnect banner ("connecting...")

## 🎯 Day 8 — MVP Deploy & Real Test

- [ ] Production env সব বসানো (`04-env-variables.md`)
- [ ] `prisma migrate deploy` production DB-তে
- [ ] Production seed (আসল account দুইটা)
- [ ] Custom domain + HTTPS
- [ ] **আসল ফোনে টেস্ট** — আপনার আর তার ফোনে
- [ ] নেটওয়ার্ক খারাপ করে (DevTools throttle) দেখা
- [ ] Security checklist আবার চালানো
- [ ] 🎉 এখন হাতে একটা কাজ করা chat app আছে — বাকি সব bonus

## 🔵 Day 9 — Media Sharing

- [ ] Cloudinary signed upload preset
- [ ] `POST /media/signature` + `/media/confirm`
- [ ] ক্লায়েন্টে direct upload + progress bar
- [ ] Image bubble + blurhash placeholder + lightbox (pinch zoom)
- [ ] Video bubble + inline player + thumbnail
- [ ] File bubble (icon, নাম, সাইজ, download)
- [ ] Drag-drop + clipboard paste upload
- [ ] Signed URL (১ ঘণ্টা) দিয়ে private access
- [ ] Media gallery page

## 🔵 Day 10 — Voice Notes

- [ ] `useVoiceRecorder` — `MediaRecorder`, webm/opus
- [ ] Hold-to-record + slide-to-cancel (WhatsApp gesture)
- [ ] Live waveform + timer রেকর্ডিং-এর সময়
- [ ] Web Audio API দিয়ে waveform peaks বের করে সেভ
- [ ] Playback bubble — waveform seek, 1x/1.5x/2x speed
- [ ] Play হলে "শোনা হয়েছে" state
- [ ] iOS Safari-তে টেস্ট (codec আলাদা — `audio/mp4` fallback লাগতে পারে)

## 🟢 Day 11 — Message Actions

- [ ] Reply — swipe gesture + quoted preview + tap করে jump
- [ ] Emoji reaction — long-press → picker → heart burst animation
- [ ] Context menu (copy, star, delete, edit, info)
- [ ] Delete for me / for everyone ("এই মেসেজটি মুছে ফেলা হয়েছে")
- [ ] Edit + "edited" label
- [ ] Search — `GET /messages/search` + highlight + jump
- [ ] Starred messages page
- [ ] Message info (delivered/read সময়)

## 📞 Day 12 — Audio Call

- [ ] Cloudflare TURN key + `GET /calls/ice-servers` (short-lived creds)
- [ ] `useWebRTC` hook — offer/answer/ICE, connection state
- [ ] Signaling events Pusher দিয়ে (`webrtc:offer/answer/ice`)
- [ ] `POST /calls` + accept/reject/end
- [ ] Incoming call modal + ringtone + vibrate
- [ ] In-call UI — avatar, timer, mute, speaker, end
- [ ] Reconnect handling + "connection poor" indicator
- [ ] **আলাদা নেটওয়ার্কে টেস্ট** (একজন WiFi, একজন মোবাইল ডেটা) ← এখানেই TURN কাজে লাগবে

## 📹 Day 13 — Video Call & Notifications

- [ ] Video track যোগ (`video: true`), PiP local preview
- [ ] Camera on/off, front/back switch
- [ ] Call-এর মধ্যে audio ↔ video স্যুইচ
- [ ] Call history page + chat-এ missed call entry
- [ ] Web Push — VAPID, service worker, subscription সেভ
- [ ] নতুন মেসেজ + missed call-এ notification
- [ ] Notification click → সরাসরি chat
- [ ] Badge count

## 💜 Day 14 — Polish, Gift Touches & Final Deploy

- [ ] Anniversary counter header-এ ("আমরা একসাথে ৭৪২ দিন")
- [ ] Wallpaper picker + theme color
- [ ] Pinned message
- [ ] Disappearing messages toggle
- [ ] **Birthday surprise:** প্রথম লগইনে confetti + আপনার লেখা চিঠি 🎂
- [ ] PWA — manifest, icon, install prompt, offline shell
- [ ] Lighthouse — performance/a11y ঠিক করা
- [ ] Loading skeleton + error boundary সব জায়গায়
- [ ] সব security test আবার চালানো
- [ ] Final production deploy + দুই ফোনে শেষবার যাচাই
- [ ] 🎁 তাকে লিংক আর পাসওয়ার্ড দেওয়া

---

## ⚡ যদি সময় কম থাকে — Priority Cut

জন্মদিন কাছে হলে এই ক্রমে কাটুন:

| রাখতেই হবে | কাটা যায় |
|---|---|
| Login + security (Day 1–3) | Video call → শুধু audio রাখুন |
| Text chat + realtime (Day 4–7) | Message edit, search, starred |
| Deploy (Day 8) | Disappearing messages |
| Image send (Day 9) | Media gallery page |
| Voice note (Day 10) — couple app-এ এটা অনেক দামি ❤️ | Web push (পরে যোগ করা যায়) |
| Anniversary counter + birthday screen (Day 14) | Dark mode |

**৭ দিনের সংক্ষিপ্ত রূপ:** Day 1+2 একসাথে → 3 → 4+5 একসাথে → 6 → 7 → 9+10 → 14.
Call টা জন্মদিনের পরে "surprise update" হিসেবে দিন 😄

---

## 🧪 প্রতিদিনের নিয়ম

> [!IMPORTANT]
> - প্রতিদিন অন্তত ২–৩টা meaningful commit
> - প্রতিদিন শেষে Vercel-এ deploy করে **আসল ফোনে** খুলে দেখা
> - নতুন feature-এর আগে আগের feature-এর security টেস্ট আবার চালানো
> - `.env` ভুলেও commit করবেন না

## ✅ শেষ করার আগে Definition of Done

- [ ] `chat.yourdomain.com`-এ গেলে সরাসরি login page
- [ ] শুধু ঐ দুইটা account দিয়ে ঢোকা যায়, আর কোনোভাবে না
- [ ] দুইজন একসাথে চ্যাট করলে ১ সেকেন্ডের কমে মেসেজ পৌঁছায়
- [ ] দ্বিতীয় ডিভাইসে লগইন → প্রথমটা সাথে সাথে বেরিয়ে যায়
- [ ] ট্যাব বন্ধ → আবার খুললে login page
- [ ] ৩০ মিনিট চুপ → auto logout
- [ ] ছবি, ভয়েস নোট, ফাইল পাঠানো যায়
- [ ] অডিও (ও ভিডিও) কল দুই আলাদা নেটওয়ার্ক থেকে কাজ করে
- [ ] ফোনে PWA হিসেবে install করা যায়
- [ ] সে খুশি হয় 💜
