# ⚙️ Environment Variables

আপনি নিজে ম্যানেজ করবেন বলেছেন — নিচে **ঠিক কোনটা কোথা থেকে পাবেন** সব লেখা আছে।
সবগুলো free tier-এ পাওয়া যায়, একটাও card লাগে না (Cloudflare TURN ছাড়া, সেটাতেও free quota আছে)।

---

## 🔑 আগে যেসব account খুলতে হবে

| Service | কীসের জন্য | Free tier | লিংক |
|---|---|---|---|
| **Neon** | PostgreSQL | 0.5 GB storage, always-on | neon.tech |
| **Pusher Channels** | Realtime | 200k msg/day, 100 connections | pusher.com |
| **Cloudinary** | ছবি/ভিডিও/ভয়েস স্টোরেজ | 25 GB storage + 25 GB bandwidth | cloudinary.com |
| **Upstash Redis** | Rate limit + cache | 10k commands/day | upstash.com |
| **Cloudflare** | TURN server (call) | 1000 GB free | dash.cloudflare.com → Realtime |
| **Vercel** | Hosting (client + server) | Hobby free | vercel.com |
| **Resend** *(ঐচ্ছিক)* | পাসওয়ার্ড রিসেট মেইল | 3000 mail/month | resend.com |

---

## 🖥️ SERVER — `server/.env`

```bash
# ───────────── App ─────────────
NODE_ENV=development
PORT=5000
API_VERSION=v1

# ক্লায়েন্টের URL — CORS + cookie domain এর জন্য (শেষে / দেবেন না)
CLIENT_ORIGIN=http://localhost:3000
COOKIE_DOMAIN=localhost                 # production-এ: .yourdomain.com


# ───────────── Database (Neon) ─────────────
# Neon dashboard → Connection string → "Pooled connection" নিন
DATABASE_URL="postgresql://USER:PASS@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/conversation?sslmode=require&pgbouncer=true&connect_timeout=15"
# Migration চালানোর জন্য direct (unpooled) URL — "Direct connection" টগল করে নিন
DIRECT_URL="postgresql://USER:PASS@ep-xxx.ap-southeast-1.aws.neon.tech/conversation?sslmode=require"


# ───────────── JWT ─────────────
# দুইটা আলাদা secret বানান:  openssl rand -base64 48
JWT_ACCESS_SECRET=<৪৮ বাইটের random string>
JWT_REFRESH_SECRET=<আলাদা ৪৮ বাইটের random string>
JWT_ACCESS_EXPIRES_IN=10m
JWT_REFRESH_EXPIRES_IN=30m
JWT_ISSUER=conversation-api
JWT_AUDIENCE=conversation-client


# ───────────── Session rules ─────────────
IDLE_TIMEOUT_MINUTES=30
MAX_SESSIONS_PER_USER=1                 # ← single-device enforce
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_MINUTES=15


# ───────────── Message encryption at rest ─────────────
# ঠিক 32 বাইট → base64:  openssl rand -base64 32
MESSAGE_ENCRYPTION_KEY=<base64, ঠিক 32 বাইট decode হতে হবে>


# ───────────── Pusher (Realtime) ─────────────
# pusher.com → Channels → নতুন app → App Keys
PUSHER_APP_ID=1234567
PUSHER_KEY=abcdef1234567890abcd
PUSHER_SECRET=0987654321fedcba0987
PUSHER_CLUSTER=ap2                      # Asia/Singapore — বাংলাদেশের জন্য সবচেয়ে কাছে
PUSHER_USE_TLS=true


# ───────────── Cloudinary (file/media) ─────────────
# cloudinary.com → Dashboard → Product Environment Credentials
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz12
CLOUDINARY_FOLDER=conversation
CLOUDINARY_UPLOAD_PRESET=conversation_signed   # Settings → Upload → signed preset বানান
MAX_UPLOAD_MB=50


# ───────────── Upstash Redis (rate limit) ─────────────
# upstash.com → Redis DB → REST API সেকশন (⚠️ redis:// নয়, REST নিন)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxxxxxxxxxxxxxxxxx


# ───────────── Cloudflare TURN (audio/video call) ─────────────
# dash.cloudflare.com → Realtime → TURN → নতুন key
CLOUDFLARE_TURN_KEY_ID=xxxxxxxxxxxxxxxx
CLOUDFLARE_TURN_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
TURN_CREDENTIAL_TTL=3600                # সেকেন্ডে — ১ ঘণ্টা


# ───────────── Web Push (ঐচ্ছিক কিন্তু খুব দরকারি) ─────────────
# npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=BN...
VAPID_PRIVATE_KEY=xx...
VAPID_SUBJECT=mailto:you@yourdomain.com


# ───────────── Email (ঐচ্ছিক) ─────────────
RESEND_API_KEY=re_xxxxxxxxxx
MAIL_FROM="Conversation <noreply@yourdomain.com>"


# ───────────── Seed (শুধু লোকালি, একবার চালানোর জন্য) ─────────────
SEED_PARTNER_A_EMAIL=you@ours.app
SEED_PARTNER_A_PASSWORD=<শক্ত পাসওয়ার্ড>
SEED_PARTNER_A_NAME=তোমার নাম

SEED_PARTNER_B_EMAIL=her@ours.app
SEED_PARTNER_B_PASSWORD=<শক্ত পাসওয়ার্ড>
SEED_PARTNER_B_NAME=তার নাম

SEED_ADMIN_EMAIL=admin@ours.app
SEED_ADMIN_PASSWORD=<শক্ত পাসওয়ার্ড>

ANNIVERSARY_DATE=2024-02-14             # "কতদিন একসাথে" counter


# ───────────── Cron protection ─────────────
CRON_SECRET=<random string>
```

---

## 🌐 CLIENT — `client/.env.local`

```bash
# ───────────── API ─────────────
# Next.js rewrite ব্যবহার করলে ক্লায়েন্টে শুধু /api লিখবেন (same-origin)
API_ORIGIN=http://localhost:5000                 # server-side only, rewrite target
NEXT_PUBLIC_API_URL=/api/v1                      # ব্রাউজার এটাই ব্যবহার করবে


# ───────────── Pusher (public key — ব্রাউজারে যাবে) ─────────────
NEXT_PUBLIC_PUSHER_KEY=abcdef1234567890abcd      # ⚠️ শুধু KEY, SECRET কখনো নয়
NEXT_PUBLIC_PUSHER_CLUSTER=ap2
NEXT_PUBLIC_PUSHER_AUTH_ENDPOINT=/api/v1/pusher/auth


# ───────────── Cloudinary (public) ─────────────
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name


# ───────────── Session (UI timer এর জন্য) ─────────────
NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES=30
NEXT_PUBLIC_IDLE_WARNING_MINUTES=28
NEXT_PUBLIC_HEARTBEAT_SECONDS=60


# ───────────── Web Push ─────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BN...


# ───────────── Branding ─────────────
NEXT_PUBLIC_APP_NAME=Conversation
NEXT_PUBLIC_ANNIVERSARY_DATE=2024-02-14
```

> ⚠️ **`NEXT_PUBLIC_` মানে ব্রাউজারে চলে যাবে।** ভুল করেও `PUSHER_SECRET`, `CLOUDINARY_API_SECRET`, `JWT_*_SECRET` বা `DATABASE_URL` এর আগে `NEXT_PUBLIC_` লাগাবেন না।

---

## 🚀 Vercel-এ Production Setup

### Server project (`/server`)

- Root Directory: `server`
- Build Command: `pnpm prisma generate && pnpm build`
- Framework: Other
- Environment Variables: উপরের সার্ভার লিস্টের সবগুলো, কিন্তু এগুলো বদলাবে:

```bash
NODE_ENV=production
CLIENT_ORIGIN=https://chat.yourdomain.com
COOKIE_DOMAIN=.yourdomain.com
```

`server/vercel.json`:

```json
{
  "version": 2,
  "builds": [{ "src": "api/index.ts", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "api/index.ts" }],
  "crons": [{ "path": "/api/v1/internal/cleanup-sessions", "schedule": "0 * * * *" }]
}
```

`server/api/index.ts`:

```ts
import app from "../src/app";
export default app;          // Express app — listen() করবেন না
```

### Client project (`/client`)

- Root Directory: `client`
- Framework: Next.js
- Environment Variables:

```bash
API_ORIGIN=https://api.yourdomain.com
NEXT_PUBLIC_API_URL=/api/v1
# বাকিগুলো একই
```

### ⚠️ Vercel-এ যে ভুলগুলো সবাই করে

| সমস্যা | সমাধান |
|---|---|
| Prisma connection শেষ হয়ে যায় | Neon-এর **pooled** URL (`-pooler`) + `PrismaClient` singleton (`globalThis` cache) |
| `prisma generate` চলে না | `package.json`-এ `"postinstall": "prisma generate"` |
| Migration production-এ চলে না | Vercel build-এ migrate করবেন না। লোকালি `prisma migrate deploy` চালান production `DIRECT_URL` দিয়ে |
| Cookie সেট হয় না | `sameSite: "none"` নয় — Next.js rewrite দিয়ে same-origin করুন (দেখুন `03-security-spec.md`) |
| বড় ফাইল আপলোড fail | সার্ভার দিয়ে পাঠাবেন না — Cloudinary signed direct upload |
| Function timeout | Hobby plan-এ ১০ সেকেন্ড। ভারী কাজ (ভিডিও thumbnail) Cloudinary-কে দিয়ে করান |

### Local dev

```bash
# server
cd server
pnpm install
pnpm prisma migrate dev --name init
pnpm prisma db seed
pnpm dev              # :5000

# client (আলাদা টার্মিনাল)
cd client
pnpm install
pnpm dev              # :3000
```

---

## 📋 Env Setup Checklist

- [ ] Neon DB বানানো, pooled + direct দুইটা URL কপি করা
- [ ] `openssl rand -base64 48` দিয়ে ২টা JWT secret বানানো
- [ ] `openssl rand -base64 32` দিয়ে encryption key বানানো
- [ ] Pusher app বানানো, cluster = `ap2`
- [ ] Cloudinary signed upload preset বানানো
- [ ] Upstash Redis + **REST** URL/token নেওয়া
- [ ] Cloudflare Realtime TURN key বানানো
- [ ] `npx web-push generate-vapid-keys` চালানো
- [ ] `.gitignore`-এ `.env`, `.env.local` আছে কিনা দেখা
- [ ] `.env.example` দুই ফোল্ডারেই আছে (value ছাড়া)
- [ ] Vercel-এ দুইটা project-এই env বসানো (Production + Preview দুইটাতেই)
