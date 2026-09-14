# 🔐 Security Specification

এই ফাইলটাই আপনার প্রজেক্টের সবচেয়ে গুরুত্বপূর্ণ অংশ। আপনার চারটা দাবি:

1. শুধু Admin account বানাবে, কেউ নিজে register করতে পারবে না
2. একটা device-এ login থাকলে অন্য সব device auto logout
3. Browser tab বন্ধ করলে auto logout
4. ৩০ মিনিট inactive থাকলে auto logout

নিচে প্রতিটার exact mechanism।

---

## 🎫 Token Strategy

| Token | কোথায় থাকবে | মেয়াদ | কাজ |
|---|---|---|---|
| **Access token** | httpOnly cookie `__Host-at` | **১০ মিনিট** | প্রতিটা API call authorize করে |
| **Refresh token** | httpOnly cookie `__Host-rt` | **৩০ মিনিট sliding** | নতুন access token আনে |
| **CSRF token** | JS-readable cookie + `X-CSRF-Token` header | session | double-submit CSRF protection |

### Cookie flags (সবগুলো লাগবে)

```ts
res.cookie("__Host-rt", refreshToken, {
  httpOnly: true,      // JS পড়তে পারবে না → XSS-এ টোকেন চুরি হবে না
  secure: true,        // শুধু HTTPS
  sameSite: "strict",  // CSRF + অন্য সাইট থেকে পাঠানো যাবে না
  path: "/",
  // ⚠️ maxAge / expires দেওয়া হবে না  →  এটাই "session cookie"
  //    ব্রাউজার পুরোপুরি বন্ধ করলেই cookie মুছে যাবে
});
```

> **`__Host-` prefix কেন?** এই prefix থাকলে ব্রাউজার বাধ্যতামূলকভাবে `Secure` + `Path=/` + কোনো `Domain` না — মানে subdomain থেকে cookie inject করা অসম্ভব।

### ⚠️ Cross-domain সমস্যা (আগেভাগে জেনে রাখুন)

Client `app.yourdomain.com` আর API `api.yourdomain.com` — আলাদা origin হলে `SameSite=Strict` cookie যাবে না।

**দুইটা সমাধান:**

| উপায় | কীভাবে |
|---|---|
| ⭐ **একই parent domain** | Client `chat.yourdomain.com`, API `api.yourdomain.com`, cookie `Domain=.yourdomain.com` + `SameSite=Lax`. (তখন `__Host-` prefix বাদ দিয়ে `__Secure-` ব্যবহার করুন) |
| **Next.js rewrite (সবচেয়ে সহজ)** | Client-এর `next.config.js`-এ `/api/:path*` → Express server-এ rewrite। ব্রাউজারের কাছে সব same-origin, `SameSite=Strict` নির্ভয়ে চলবে |

👉 **সুপারিশ: Next.js rewrite।** একটাই domain, কোনো CORS ঝামেলা নেই, cookie-ও strict রাখা যায়।

```js
// client/next.config.js
async rewrites() {
  return [{ source: "/api/:path*", destination: `${process.env.API_ORIGIN}/api/:path*` }];
}
```

---

## 1️⃣ No Self-Registration

- `POST /auth/register` route কোডেই নেই
- `POST /admin/users` শুধু `role === "ADMIN"` middleware-এর পেছনে
- Account তৈরির দুইটা পথ:
  - **Seed script** — `prisma/seed.ts`, `pnpm seed` দিয়ে একবার চালাবেন
  - **Admin panel** — `/admin` route, শুধু আপনার account ঢুকতে পারবে
- নতুন account-এ `mustChangePw = true` → প্রথম লগইনে বাধ্যতামূলক পাসওয়ার্ড বদল
- Frontend-এর কোথাও "Sign up" লিংক থাকবে না

```ts
// prisma/seed.ts (সারাংশ)
await prisma.user.createMany({ data: [
  { email: "you@ours.app",  displayName: "তোমার নাম",  passwordHash: await hash(process.env.SEED_A_PASSWORD!), role: "PARTNER" },
  { email: "her@ours.app",  displayName: "তার নাম",     passwordHash: await hash(process.env.SEED_B_PASSWORD!), role: "PARTNER" },
  { email: "admin@ours.app",displayName: "Admin",       passwordHash: await hash(process.env.SEED_ADMIN_PASSWORD!), role: "ADMIN" },
]});
await prisma.conversation.create({ data: { title: "Us 💜", anniversary: new Date("2024-02-14") } });
```

---

## 2️⃣ Single-Device Login (নতুন device-এ ঢুকলে পুরোনোটা বেরিয়ে যাবে)

### Login-এর সময় (transaction-এর ভেতরে)

```ts
await prisma.$transaction(async (tx) => {
  // ক. এই user-এর যত active session আছে, সব revoke
  const killed = await tx.session.updateMany({
    where: { userId, revokedAt: null },
    data:  { revokedAt: new Date(), revokedReason: "NEW_DEVICE_LOGIN" },
  });

  // খ. নতুন session তৈরি
  const session = await tx.session.create({
    data: {
      userId,
      refreshTokenHash: sha256(refreshToken),   // ⚠️ raw token কখনো DB-তে না
      deviceId, deviceLabel, ipAddress, userAgent,
      expiresAt: addMinutes(new Date(), 30),
    },
  });

  return { session, killed };
});

// গ. পুরোনো device-কে সাথে সাথে জানিয়ে দাও
if (killed.count > 0) {
  await pusher.trigger(`private-user-${userId}`, "session:force-logout", {
    reason: "NEW_DEVICE_LOGIN",
  });
}
```

### দুই স্তরের নিরাপত্তা

| স্তর | কাজ | কত দ্রুত |
|---|---|---|
| **Realtime (Pusher)** | পুরোনো ট্যাব event পেয়ে সাথে সাথে state clear করে `/login`-এ চলে যায় | সাথে সাথে (< ১ সেকেন্ড) |
| **Server-side (হার্ড গ্যারান্টি)** | পুরোনো টোকেন দিয়ে API কল করলে session `revokedAt != null` → `401` | পরের যেকোনো request-এ |

👉 Realtime টা UX-এর জন্য, DB check টাই আসল নিরাপত্তা। ট্যাব ব্যাকগ্রাউন্ডে থাকলে বা নেট কেটে গেলেও দ্বিতীয় স্তর কাজ করবে।

### Client-side listener

```ts
// hooks/usePusher.ts
userChannel.bind("session:force-logout", ({ reason }) => {
  authStore.clear();
  queryClient.clear();
  router.replace(`/login?reason=${reason}`);
  toast.error("অন্য একটি ডিভাইসে লগইন হয়েছে");
});
```

---

## 3️⃣ Tab বন্ধ করলে Logout

তিন স্তরে করা হবে (একটা fail করলে পরেরটা ধরবে):

### স্তর ক — Session cookie (ব্রাউজার বন্ধ)

Cookie-তে `maxAge` না দেওয়ায় ব্রাউজার **পুরোপুরি** বন্ধ করলে cookie মুছে যায়। কিন্তু শুধু ট্যাব বন্ধ করলে ব্রাউজার এটা মুছে না — তাই পরের স্তর লাগবে।

### স্তর খ — `sessionStorage` marker (per-tab)

`sessionStorage` প্রতিটা ট্যাবের নিজস্ব, ট্যাব বন্ধ হলেই মুছে যায়।

```ts
// লগইনের সময়
sessionStorage.setItem("tabSession", sessionId);

// অ্যাপ চালু হলে (protected layout)
const tabSession = sessionStorage.getItem("tabSession");
if (!tabSession) {
  await api.post("/auth/logout");   // cookie আছে কিন্তু tab marker নেই → নতুন ট্যাব
  router.replace("/login");
}
```

**মানে:** ট্যাব বন্ধ করে আবার খুললে `sessionStorage` খালি → জোর করে logout। এটাই আপনার চাওয়া behaviour.

### স্তর গ — `pagehide` + `sendBeacon` (তাৎক্ষণিক server cleanup)

```ts
// hooks/useTabCloseLogout.ts
useEffect(() => {
  const onPageHide = (e: PageTransitionEvent) => {
    if (e.persisted) return;              // bfcache — সত্যিকারের বন্ধ নয়
    navigator.sendBeacon("/api/v1/auth/logout", new Blob([], { type: "text/plain" }));
  };
  window.addEventListener("pagehide", onPageHide);
  return () => window.removeEventListener("pagehide", onPageHide);
}, []);
```

> 🔍 **সৎ কথা:** `pagehide` + `sendBeacon` **best-effort** — ব্রাউজার ক্র্যাশ করলে, ফোর্স-কিল করলে বা ব্যাটারি শেষ হলে এটা চলবে না। তাই এটার উপর ভরসা করা যাবে না। **আসল গ্যারান্টিটা আসে ৩০ মিনিটের সার্ভার-সাইড idle expiry থেকে** — কোনো session ৩০ মিনিটের বেশি বাঁচবেই না। স্তর খ + গ শুধু জিনিসটা তাৎক্ষণিক করে।
>
> ⚠️ `beforeunload` ব্যবহার করবেন না — মোবাইল Safari/Chrome-এ এটা প্রায়ই fire করে না। `pagehide` ব্যবহার করুন।

---

## 4️⃣ ৩০ মিনিট Idle হলে Logout

### সার্ভার সাইড — আসল প্রয়োগ (auth middleware)

```ts
const IDLE_LIMIT_MS = 30 * 60 * 1000;

export const auth = catchAsync(async (req, res, next) => {
  const payload = verifyAccessToken(req.cookies["__Host-at"]);

  const session = await prisma.session.findUnique({ where: { id: payload.sid } });

  if (!session || session.revokedAt)
    throw new ApiError(401, "Session revoked", "SESSION_REVOKED");

  const idleFor = Date.now() - session.lastActiveAt.getTime();
  if (idleFor > IDLE_LIMIT_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: "IDLE_TIMEOUT" },
    });
    await audit("IDLE_LOGOUT", session.userId);
    throw new ApiError(401, "Session expired due to inactivity", "SESSION_IDLE");
  }

  // sliding window — প্রতি request-এ ঘড়ি রিসেট
  // 🔧 optimization: প্রতিবার DB লিখবেন না, ৬০ সেকেন্ডের বেশি পুরোনো হলে লিখুন
  if (idleFor > 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });
  }

  req.user = payload;
  next();
});
```

### ক্লায়েন্ট সাইড — UX

```ts
// hooks/useIdleLogout.ts
const IDLE_MS  = 30 * 60 * 1000;
const WARN_MS  = 28 * 60 * 1000;   // ২ মিনিট আগে সতর্কতা
const EVENTS   = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "visibilitychange"];

// - activity হলে timer reset (throttle ৫ সেকেন্ড)
// - ২৮ মিনিটে modal: "আর ২ মিনিটে লগআউট হয়ে যাবে — এখানে আছো?"
// - ৩০ মিনিটে POST /auth/logout + /login?reason=idle
// - প্রতি ৬০ সেকেন্ডে POST /auth/heartbeat (ট্যাব visible থাকলে) → lastActiveAt সতেজ থাকে
```

> ⚠️ শুধু heartbeat চালিয়ে দিলে session কখনো expire করবে না। তাই heartbeat পাঠাবেন **শুধু তখনই যখন সত্যিকারের user activity হয়েছে** — `document.visibilityState === "visible"` **এবং** শেষ ৬০ সেকেন্ডে কোনো input/mouse/touch event হয়েছে।

### Cleanup cron (ঐচ্ছিক কিন্তু ভালো)

Vercel Cron দিয়ে প্রতি ঘণ্টায় পুরোনো session মুছে ফেলুন:

```json
// server/vercel.json
{ "crons": [{ "path": "/api/v1/internal/cleanup-sessions", "schedule": "0 * * * *" }] }
```

এই route টা `CRON_SECRET` header দিয়ে protect করবেন।

---

## 🛡️ বাকি নিরাপত্তার স্তর

### Password

- **argon2id** (`@node-rs/argon2`) — memoryCost 19456, timeCost 2, parallelism 1
- ন্যূনতম ১২ অক্ষর, Zod দিয়ে যাচাই
- **Brute-force lock:** ৫ বার ভুল → ১৫ মিনিট `lockedUntil`. প্রতিবার ভুলে `failedLogins++`, সফল হলে ০
- Login response সবসময় একই: `"Invalid email or password"` — কোন ইমেইল আছে সেটা বলে দেবেন না (user enumeration)
- Timing attack ঠেকাতে: user না পেলেও একটা dummy hash verify করুন

### Rate limiting (Upstash Redis)

| Route | সীমা |
|---|---|
| `/auth/login` | ৫ / ১৫ মিনিট per IP **এবং** per email |
| `/messages` (POST) | ৬০ / মিনিট per user |
| `/media/signature` | ২০ / ঘণ্টা per user |
| `/calls` | ১০ / ঘণ্টা per user |
| বাকি সব | ১০০ / মিনিট per user |

### Headers & CORS

```ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "wss://*.pusher.com", "https://*.pusher.com",
                   "https://api.cloudinary.com", "https://*.cloudflare.com"],
      mediaSrc:   ["'self'", "https://res.cloudinary.com", "blob:"],
      imgSrc:     ["'self'", "https://res.cloudinary.com", "data:", "blob:"],
      frameAncestors: ["'none'"],          // clickjacking
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

app.use(cors({
  origin: env.CLIENT_ORIGIN,   // ⚠️ কখনো "*" নয়
  credentials: true,
  methods: ["GET","POST","PATCH","DELETE"],
  allowedHeaders: ["Content-Type","X-CSRF-Token","X-Device-Id"],
}));
```

### Message encryption at rest

```ts
// lib/crypto.ts — AES-256-GCM
export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);   // KEY = 32 bytes from env
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { body: ct.toString("base64"), bodyIv: iv.toString("base64"),
           bodyTag: cipher.getAuthTag().toString("base64") };
}
```

মানে DB dump লিক হলেও মেসেজ পড়া যাবে না — key থাকে Vercel env-এ, DB-তে নয়।

> **True End-to-End Encryption?** আসল E2EE (Signal Protocol / MLS) মানে সার্ভারও পড়তে পারবে না। এটা সম্ভব, কিন্তু key exchange, device key backup, "ফোন হারালে চ্যাট হারাবে" — অনেক জটিলতা আসে। **সুপারিশ: Phase 1–4 এ at-rest encryption দিয়ে করুন।** পরে সময় পেলে libsodium (`crypto_box`) দিয়ে E2EE যোগ করবেন — সেজন্যই `User.publicKey` ফিল্ডটা schema-তে আগে থেকে রেখে দেওয়া হয়েছে।

### Media privacy

Cloudinary-তে ডিফল্ট আপলোড **public URL** — লিংক জানলে যে কেউ দেখতে পাবে। তাই:

- Upload করুন `type: "authenticated"` বা `"private"` mode-এ
- সার্ভার থেকে **signed URL** (১ ঘণ্টার মেয়াদ) জেনারেট করে ক্লায়েন্টকে দিন
- একটা আলাদা folder: `conversation/{convId}/...`

### আরও

- [ ] `X-Device-Id` header প্রতি request-এ — session-এর `deviceId` এর সাথে না মিললে ৪০১
- [ ] Refresh token **rotation** — প্রতিবার refresh-এ নতুন token, পুরোনোটা invalid. পুরোনো token পুনরায় ব্যবহার হলে = চুরি → সব session kill (reuse detection)
- [ ] Zod দিয়ে সব input validate, কোনো raw `req.body` সরাসরি Prisma-তে না
- [ ] `.env` কখনো git-এ না — `.env.example` রাখুন
- [ ] Prisma `select` দিয়ে `passwordHash` কখনো response-এ না
- [ ] Global error handler — production-এ stack trace লুকান
- [ ] সব critical action `AuditLog`-এ

---

## ✅ Security Checklist (deploy করার আগে মিলিয়ে নিন)

- [ ] কোনো register endpoint নেই, frontend-এ signup লিংক নেই
- [ ] Seed password গুলো env থেকে আসছে, কোডে hardcoded নয়
- [ ] দুইটা ব্রাউজারে লগইন করে দেখা — প্রথমটা সাথে সাথে বেরিয়ে যায়?
- [ ] ট্যাব বন্ধ করে আবার খুলে দেখা — login page আসে?
- [ ] ৩০ মিনিট বসিয়ে রেখে দেখা — logout হয়?
- [ ] পুরোনো (revoked) token দিয়ে Postman-এ কল — ৪০১ আসে?
- [ ] ভুল পাসওয়ার্ড ৬ বার — lock হয়?
- [ ] Media URL সরাসরি incognito-তে খুলে দেখা — ব্লক হয়?
- [ ] User A-এর টোকেন দিয়ে admin route — ৪০৩ আসে?
- [ ] HTTPS + HSTS চালু, `Secure` cookie যাচ্ছে?
