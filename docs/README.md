# 💜 Conversation — Documentation Index

একটি প্রাইভেট, দুইজনের জন্য বানানো WhatsApp-স্টাইল মেসেজিং অ্যাপ।

| # | ফাইল | কী আছে |
|---|---|---|
| 01 | [01-project-plan.md](./01-project-plan.md) | Architecture সিদ্ধান্ত, tech stack, folder structure, Prisma schema, feature list |
| 02 | [02-api-and-realtime.md](./02-api-and-realtime.md) | ৩৮টা API endpoint, Pusher channel/event, WebRTC call flow, push notification |
| 03 | [03-security-spec.md](./03-security-spec.md) | 🔐 Single-device login, tab-close logout, 30-min idle, encryption, checklist |
| 04 | [04-env-variables.md](./04-env-variables.md) | ⚙️ সব env var, কোথা থেকে পাবেন, Vercel deploy setup |
| 05 | [05-timeline.md](./05-timeline.md) | ১৪ দিনের কাজের ভাগ + সময় কম থাকলে কী কাটবেন |

---

## ⚡ TL;DR

```
Client  : Next.js 15 + TS + Tailwind + shadcn        → Vercel
Server  : Express 5 + TS + Prisma 6                  → Vercel (serverless)
DB      : PostgreSQL (Neon, pooled connection)
Realtime: Pusher Channels  ← Vercel-এ WebSocket চলে না বলে
Calls   : WebRTC + Cloudflare TURN
Media   : Cloudinary (signed direct upload)
Cache   : Upstash Redis (rate limit)
Auth    : Custom JWT + httpOnly session cookie, single device, 30-min idle
```

## 🚦 শুরু করার ক্রম

1. `01` পড়ুন → architecture মেনে নিচ্ছেন কিনা ঠিক করুন
2. `04` ধরে সব account খুলে env রেডি করুন
3. `05`-এর Day 1 শুরু করুন
4. `03` টা প্রতিদিন হাতের কাছে রাখুন — নিরাপত্তাই এখানে মূল চ্যালেঞ্জ
