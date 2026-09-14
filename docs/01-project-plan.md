# 💜 Project Plan — "Conversation" (Private Couple Chat)

> একটি প্রাইভেট, ইনভাইট-অনলি, WhatsApp-স্টাইল মেসেজিং অ্যাপ — শুধুমাত্র দুইজন মানুষের জন্য।
> Admin ছাড়া কেউ account বানাতে পারবে না। Sign-up page বলে কিছু থাকবে না।

---

## 🎯 Core Concept

| বিষয় | সিদ্ধান্ত |
|---|---|
| **User সংখ্যা** | ঠিক ৩ জন — `PARTNER_A`, `PARTNER_B`, `ADMIN` (আপনি) |
| **Registration** | ❌ নেই। Admin seed script / admin panel দিয়ে account তৈরি হবে |
| **Conversation** | ১টাই — দুইজনের মধ্যে fixed thread। Group নেই, contact list নেই |
| **Landing page** | ❌ নেই। Domain-এ ঢুকলেই সরাসরি `/login` |
| **Privacy** | মেসেজ শুধু ঐ দুইজনের। DB-তে encrypted হয়ে থাকবে |

---

## 🏗️ Architecture Decision (সবচেয়ে গুরুত্বপূর্ণ অংশ)

### ⚠️ সমস্যা: Vercel-এ persistent WebSocket চলে না

Vercel Functions-এ native WebSocket আছে (June 2026, public beta) — কিন্তু:

- Connection টা function-এর **max duration** পার হলেই বন্ধ হয়ে যায়
- পরের reconnect আরেকটা function instance-এ যেতে পারে → in-memory state হারায়
- মানে chat বা call-এর মাঝখানে বারবার drop হবে

তাই `socket.io` সার্ভার Vercel-এ বসানোর প্ল্যান বাদ।

### ✅ সমাধান: Realtime layer আলাদা managed service

```
┌──────────────────────────┐
│  Next.js 15 (Client)     │  ← Vercel
│  App Router + TS         │
└────┬─────────────┬───────┘
     │ REST        │ WebSocket
     │ (https)     │ (wss)
     ▼             ▼
┌──────────────┐  ┌─────────────────────┐
│ Express API  │  │  Pusher Channels    │
│ + Prisma +TS │─▶│  managed realtime   │
│  ← Vercel    │  │  private + presence │
└──────┬───────┘  └─────────────────────┘
       │                    ▲
       ▼                    │ WebRTC signaling
┌──────────────┐            │
│ Neon Postgres│     ┌──────┴──────────────┐
└──────────────┘     │ Cloudflare TURN/STUN│
                     │ (audio/video call)  │
┌──────────────┐     └─────────────────────┘
│  Cloudinary  │ ← images / voice notes / files
└──────────────┘
┌──────────────┐
│Upstash Redis │ ← rate limit + session cache
└──────────────┘
```

**কেন Pusher?** সার্ভারকে (Vercel serverless) শুধু একটা HTTP POST করে event trigger করতে হয় — কোনো persistent connection রাখতে হয় না। এটাই serverless-এর জন্য perfect fit. Free tier: 200k messages/day, 100 concurrent connections. আপনার ২ জন ইউজারে দিনে হয়তো ২–৫ হাজার message লাগবে। অনেক বেশি জায়গা আছে।

**বিকল্প (যদি Pusher-এ না যেতে চান):**

| Option | সুবিধা | অসুবিধা |
|---|---|---|
| **Supabase Realtime** | DB + realtime + storage একসাথে, free tier ভালো | Postgres-কে Supabase-এ নিতে হবে |
| **Ably** | Pusher-এর মতোই, free tier বড় | একই রকম |
| **Socket.IO on Render free** | পুরো control আপনার হাতে | Free tier ১৫ মিনিট idle-এ ঘুমায় → couple chat-এ খারাপ |
| **Socket.IO on Railway/Fly.io** | পুরো control + ঘুমায় না | মাসে ~$5 লাগবে |

👉 **সুপারিশ: Pusher Channels** দিয়ে শুরু করুন। Interface টা এমনভাবে লিখবেন (`lib/realtime.ts`) যাতে পরে চাইলে Ably/Socket.IO-তে সুইচ করা যায়।

---

## 🛠️ Tech Stack

### Client (`/client` → Vercel)

| Category | Technology |
|---|---|
| Framework | **Next.js 15** (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Server state | TanStack Query (React Query) |
| Client state | Zustand (auth, chat draft, call state) |
| Forms | React Hook Form + Zod |
| Realtime client | `pusher-js` |
| Calls | Native **WebRTC** (`RTCPeerConnection`) |
| Voice record | `MediaRecorder` API (webm/opus) |
| Animation | Framer Motion (bubble entry, typing dots, heart burst) |
| Icons | lucide-react |
| Date | date-fns |
| Notification | Web Push API + Service Worker (PWA) |

### Server (`/server` → Vercel Serverless)

| Category | Technology |
|---|---|
| Runtime | Node.js 20 + **TypeScript** |
| Framework | **Express.js 5** |
| ORM | **Prisma 6** |
| Database | **PostgreSQL — Neon** (serverless-friendly, free tier) |
| Validation | **Zod** |
| Auth | Custom JWT (`jose`) + httpOnly cookies |
| Password hash | **argon2id** (`@node-rs/argon2`) |
| Realtime trigger | `pusher` server SDK |
| File upload | Cloudinary signed direct upload (browser → Cloudinary) |
| Rate limit + cache | **Upstash Redis** (REST API — serverless safe) |
| Security | helmet, strict CORS, CSRF double-submit token |
| Encryption at rest | Node `crypto` — AES-256-GCM |
| Docs | Postman Collection |
| Lint | ESLint + Prettier |

> **Prisma + Vercel টিপ:** serverless-এ প্রতি invocation-এ নতুন `PrismaClient` বানালে connection শেষ হয়ে যাবে। তাই singleton pattern + Neon-এর **pooled connection string** (`-pooler` suffix) ব্যবহার করতে হবে। Migration চালানোর সময় direct (unpooled) URL লাগবে — তাই দুইটা env var (`DATABASE_URL` + `DIRECT_URL`)।

---

## 📦 Folder Structure

### `/server`

```
server/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                  # ← ২ জন partner + admin এখানে তৈরি হবে
├── src/
│   ├── app.ts                   # express app (no listen)
│   ├── server.ts                # local dev listen
│   ├── config/
│   │   ├── env.ts               # Zod-validated env loader
│   │   └── prisma.ts            # PrismaClient singleton (serverless-safe)
│   ├── modules/
│   │   ├── auth/                # login, refresh, logout, heartbeat, sessions
│   │   ├── user/                # me, update profile, avatar, change password
│   │   ├── conversation/        # the single thread, settings, wallpaper
│   │   ├── message/             # send, list(cursor), edit, delete, react, star, search
│   │   ├── media/               # upload signature, attach, delete
│   │   ├── call/                # start/accept/reject/end, history, ICE creds
│   │   ├── presence/            # online, typing, last-seen
│   │   └── admin/               # create user, reset password, audit logs, revoke session
│   ├── middlewares/
│   │   ├── auth.ts              # JWT verify + session validity + idle check
│   │   ├── role.ts              # ADMIN / PARTNER guard
│   │   ├── validateRequest.ts   # Zod
│   │   ├── rateLimit.ts         # Upstash
│   │   ├── csrf.ts
│   │   └── globalErrorHandler.ts
│   ├── lib/
│   │   ├── jwt.ts
│   │   ├── crypto.ts            # AES-256-GCM encrypt/decrypt
│   │   ├── realtime.ts          # Pusher wrapper (swappable)
│   │   ├── cloudinary.ts
│   │   ├── redis.ts
│   │   └── audit.ts
│   ├── utils/                   # ApiError, sendResponse, catchAsync, pick
│   └── routes/index.ts          # /api/v1 router
├── api/index.ts                 # ← Vercel serverless entry
├── vercel.json
└── .env.example
```

### `/client`

```
client/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # → redirect to /chat বা /login
│   │   ├── login/page.tsx
│   │   ├── (protected)/
│   │   │   ├── layout.tsx            # session guard + idle timer + force-logout listener
│   │   │   ├── chat/page.tsx         # main WhatsApp-like UI
│   │   │   └── settings/page.tsx
│   │   └── admin/                    # admin-only panel
│   ├── components/
│   │   ├── chat/    # MessageList, Bubble, Composer, VoiceRecorder,
│   │   │            # TypingIndicator, ReplyPreview, MediaViewer, DateDivider
│   │   ├── call/    # CallOverlay, IncomingCallModal, CallControls
│   │   └── ui/      # shadcn
│   ├── hooks/
│   │   ├── usePusher.ts
│   │   ├── useIdleLogout.ts
│   │   ├── useTabCloseLogout.ts
│   │   ├── useWebRTC.ts
│   │   ├── useVoiceRecorder.ts
│   │   └── useTyping.ts
│   ├── lib/      # api client (refresh interceptor), pusher client, webrtc helpers
│   ├── store/    # auth, chat, call — zustand
│   └── types/
├── public/       # sw.js, icons, wallpapers, ringtone.mp3
├── middleware.ts # protect routes at edge
└── .env.example
```

---

## 🗄️ Database Schema (Prisma draft)

```prisma
enum Role          { ADMIN PARTNER }
enum MessageType   { TEXT IMAGE VIDEO AUDIO VOICE FILE STICKER SYSTEM }
enum MessageStatus { SENT DELIVERED READ }
enum CallType      { AUDIO VIDEO }
enum CallStatus    { RINGING ONGOING ENDED MISSED REJECTED FAILED }

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  displayName   String
  avatarUrl     String?
  role          Role      @default(PARTNER)
  isActive      Boolean   @default(true)
  mustChangePw  Boolean   @default(true)   // admin-created → প্রথম লগইনে পাসওয়ার্ড বদলাবে
  failedLogins  Int       @default(0)
  lockedUntil   DateTime?
  lastSeenAt    DateTime?
  isOnline      Boolean   @default(false)
  publicKey     String?                    // Phase-2 E2EE এর জন্য
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  sessions      Session[]
  messages      Message[]        @relation("Sender")
  receipts      MessageReceipt[]
  reactions     Reaction[]
  callsStarted  Call[]           @relation("Caller")
  auditLogs     AuditLog[]

  @@index([email])
}

// 🔐 একটাই active session per user — single-device enforce
model Session {
  id               String    @id @default(uuid())
  userId           String
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshTokenHash String    @unique
  deviceId         String                      // client-generated stable id
  deviceLabel      String?                     // "Chrome on Windows"
  ipAddress        String?
  userAgent        String?
  lastActiveAt     DateTime  @default(now())   // ← 30 min idle check এর ভিত্তি
  expiresAt        DateTime
  revokedAt        DateTime?
  revokedReason    String?                     // NEW_DEVICE_LOGIN | IDLE_TIMEOUT | TAB_CLOSED | MANUAL | ADMIN
  createdAt        DateTime  @default(now())

  @@index([userId, revokedAt])
  @@index([lastActiveAt])
}

model Conversation {
  id             String    @id @default(uuid())
  title          String?              // "Us 💜"
  wallpaperUrl   String?
  themeColor     String?
  anniversary    DateTime?            // "কতদিন একসাথে" counter
  disappearAfter Int?                 // seconds; null = off
  pinnedMsgId    String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  messages       Message[]
  calls          Call[]
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  senderId       String
  sender         User         @relation("Sender", fields: [senderId], references: [id])
  type           MessageType  @default(TEXT)

  body           String?      // AES-256-GCM ciphertext (at-rest encrypted)
  bodyIv         String?
  bodyTag        String?

  replyToId      String?
  replyTo        Message?     @relation("Reply", fields: [replyToId], references: [id])
  replies        Message[]    @relation("Reply")

  isEdited       Boolean      @default(false)
  editedAt       DateTime?
  isStarred      Boolean      @default(false)
  deletedForAll  Boolean      @default(false)
  deletedForIds  String[]     @default([])   // "delete for me"
  expiresAt      DateTime?                   // disappearing message

  createdAt      DateTime     @default(now())
  deletedAt      DateTime?                   // soft delete

  attachments    Attachment[]
  receipts       MessageReceipt[]
  reactions      Reaction[]

  @@index([conversationId, createdAt])       // cursor pagination
  @@index([senderId])
}

model Attachment {
  id           String   @id @default(uuid())
  messageId    String
  message      Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  url          String
  publicId     String                  // cloudinary public_id (delete এর জন্য)
  mimeType     String
  sizeBytes    Int
  fileName     String?
  width        Int?
  height       Int?
  durationSec  Float?                  // voice note / video
  waveform     Float[]  @default([])   // voice note visualizer
  thumbnailUrl String?
  createdAt    DateTime @default(now())
}

// ✓ sent   ✓✓ delivered   ✓✓ (blue) read
model MessageReceipt {
  id          String        @id @default(uuid())
  messageId   String
  message     Message       @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId      String
  user        User          @relation(fields: [userId], references: [id])
  status      MessageStatus @default(SENT)
  deliveredAt DateTime?
  readAt      DateTime?

  @@unique([messageId, userId])
  @@index([userId, status])
}

model Reaction {
  id        String   @id @default(uuid())
  messageId String
  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  emoji     String
  createdAt DateTime @default(now())

  @@unique([messageId, userId])   // একজন একটাই reaction (WhatsApp behaviour)
}

model Call {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  callerId       String
  caller         User         @relation("Caller", fields: [callerId], references: [id])
  type           CallType
  status         CallStatus   @default(RINGING)
  startedAt      DateTime     @default(now())
  answeredAt     DateTime?
  endedAt        DateTime?
  durationSec    Int?
  endReason      String?

  @@index([conversationId, startedAt])
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id])
  action    String   // LOGIN_SUCCESS | LOGIN_FAILED | FORCE_LOGOUT | IDLE_LOGOUT | ADMIN_CREATE_USER ...
  entity    String?
  entityId  String?
  ipAddress String?
  userAgent String?
  meta      Json?
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
  @@index([action])
}
```

---

## ✨ Feature List (WhatsApp parity)

### 🟢 Phase 1 — MVP (birthday-এ যা অবশ্যই লাগবে)

- [ ] Login page (email + password), কোথাও signup নেই
- [ ] Admin seed → ২টা account তৈরি
- [ ] WhatsApp-like chat UI (bubble left/right, date divider, tail, wallpaper)
- [ ] Realtime text message (Pusher private channel)
- [ ] Delivery ticks: ✓ sent / ✓✓ delivered / ✓✓ blue read
- [ ] Typing indicator + online / last seen (presence channel)
- [ ] Cursor-based infinite scroll history
- [ ] Single-device login enforcement
- [ ] Tab close → logout, 30 min idle → logout
- [ ] Mobile responsive + PWA installable

### 🔵 Phase 2 — Rich media

- [ ] Image / video send (Cloudinary), inline preview + lightbox
- [ ] **Voice note** — hold-to-record, waveform, playback speed
- [ ] Document / file send with icon + size
- [ ] Reply-to (swipe to reply), emoji reaction, star, copy
- [ ] Delete for me / delete for everyone
- [ ] Message search
- [ ] Web Push notification (tab বন্ধ থাকলেও নতুন মেসেজের notification)

### 🟠 Phase 3 — Calls

- [ ] **Audio call** (WebRTC + Cloudflare TURN)
- [ ] **Video call** (একই কোড, শুধু video track যোগ)
- [ ] Incoming call ringtone + accept/reject overlay
- [ ] Mute / speaker / camera flip / call timer
- [ ] Call history + missed call entry in chat

> Video আর audio call-এর কোড প্রায় একই (`getUserMedia`-তে `video: true/false`)। তাই audio হলে video-ও প্রায় free-তে পাওয়া যায় — আলাদা করে বাদ দেওয়ার দরকার নেই।

### 💜 Phase 4 — Couple touches (gift value 🎁)

- [ ] "কতদিন একসাথে" anniversary counter chat header-এ
- [ ] Custom chat wallpaper + theme color picker
- [ ] Pinned message ("our first message")
- [ ] Disappearing messages toggle
- [ ] Heart-burst animation on ❤️ reaction
- [ ] "On this day" — এক বছর আগের মেসেজ মনে করানো
- [ ] Birthday surprise screen (প্রথম লগইনে confetti + আপনার লেখা চিঠি)

---

## 🧭 Next Files

- `02-api-and-realtime.md` — সব API endpoint + Pusher event + WebRTC flow
- `03-security-spec.md` — auth/session/logout এর exact rule
- `04-env-variables.md` — ⭐ যেসব env লাগবে
- `05-timeline.md` — দিন ধরে ধরে কাজের ভাগ
