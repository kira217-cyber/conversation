# 🔌 API, Realtime Events & WebRTC Flow

Base URL: `https://api.yourdomain.com/api/v1`
সব response একই shape-এ:

```jsonc
// success
{ "success": true, "message": "Message sent", "data": { }, "meta": { } }
// error
{ "success": false, "message": "Invalid credentials", "errorCode": "AUTH_INVALID", "errors": [] }
```

---

## 1️⃣ Auth (`/auth`)

| Method | Endpoint | Auth | কাজ |
|---|---|---|---|
| `POST` | `/auth/login` | ❌ | email+password+deviceId → access+refresh cookie সেট, **অন্য সব session revoke** |
| `POST` | `/auth/refresh` | 🍪 refresh | নতুন access token, `lastActiveAt` আপডেট |
| `POST` | `/auth/logout` | 🍪 | current session revoke + cookie clear (`sendBeacon` থেকেও কল হবে) |
| `POST` | `/auth/heartbeat` | ✅ | every 60s — `lastActiveAt` touch, idle হলে 440 রিটার্ন |
| `GET`  | `/auth/session` | ✅ | current user + session info (idle কত বাকি) |
| `POST` | `/auth/change-password` | ✅ | পুরোনো+নতুন পাসওয়ার্ড, সব session revoke করে re-login |

> ⚠️ `POST /auth/register` **নেই**। ইচ্ছে করেই নেই।

## 2️⃣ User (`/users`)

| Method | Endpoint | Auth | কাজ |
|---|---|---|---|
| `GET`   | `/users/me` | ✅ | নিজের profile |
| `PATCH` | `/users/me` | ✅ | displayName, avatarUrl, about |
| `GET`   | `/users/partner` | ✅ PARTNER | সঙ্গীর profile + online + lastSeen |

## 3️⃣ Conversation (`/conversation`)

| Method | Endpoint | Auth | কাজ |
|---|---|---|---|
| `GET`   | `/conversation` | ✅ | একমাত্র thread-এর meta (title, wallpaper, anniversary, pinned) |
| `PATCH` | `/conversation` | ✅ | wallpaper, themeColor, anniversary, disappearAfter |
| `PATCH` | `/conversation/pin` | ✅ | pinned message সেট/সরানো |
| `GET`   | `/conversation/stats` | ✅ | মোট মেসেজ, কে বেশি পাঠিয়েছে, প্রথম মেসেজের তারিখ 💜 |

## 4️⃣ Message (`/messages`)

| Method | Endpoint | Auth | কাজ |
|---|---|---|---|
| `POST`   | `/messages` | ✅ | নতুন মেসেজ (text / attachment ref / voice) — `clientMsgId` দিয়ে idempotent |
| `GET`    | `/messages` | ✅ | **cursor pagination** `?cursor=<id>&limit=30&direction=older` |
| `GET`    | `/messages/search` | ✅ | `?q=keyword&type=IMAGE&from=2026-01-01&page=1&limit=20` |
| `GET`    | `/messages/media` | ✅ | media gallery — `?type=IMAGE|VIDEO|FILE|VOICE` |
| `GET`    | `/messages/starred` | ✅ | star করা মেসেজ |
| `PATCH`  | `/messages/:id` | ✅ owner | edit (১৫ মিনিটের মধ্যে, WhatsApp rule) |
| `DELETE` | `/messages/:id?scope=me\|all` | ✅ | soft delete / delete-for-everyone |
| `POST`   | `/messages/:id/react` | ✅ | emoji reaction toggle |
| `PATCH`  | `/messages/:id/star` | ✅ | star toggle |
| `POST`   | `/messages/read` | ✅ | `{ upToMessageId }` → সব receipt READ, blue tick trigger |
| `POST`   | `/messages/delivered` | ✅ | client connect হলে pending গুলো DELIVERED |

**Cursor pagination কেন?** Chat-এ `?page=2` কাজ করে না — নতুন মেসেজ এলে page shift হয়ে duplicate/miss হয়। তাই `createdAt + id` cursor.

## 5️⃣ Media (`/media`)

| Method | Endpoint | Auth | কাজ |
|---|---|---|---|
| `POST`   | `/media/signature` | ✅ | Cloudinary **signed upload params** দেয় → ব্রাউজার সরাসরি Cloudinary-তে আপলোড করে |
| `POST`   | `/media/confirm` | ✅ | আপলোড শেষে publicId/url/meta সেভ + message তৈরি |
| `DELETE` | `/media/:attachmentId` | ✅ owner | Cloudinary + DB থেকে মুছে ফেলা |

> **কেন direct upload?** Vercel serverless-এ request body limit ~4.5MB এবং execution time কম। ভিডিও/বড় ফাইল সার্ভার দিয়ে পাঠালে fail করবে। Signed direct upload-এ ফাইল সার্ভারে আসেই না — শুধু signature আসে।

## 6️⃣ Call (`/calls`)

| Method | Endpoint | Auth | কাজ |
|---|---|---|---|
| `POST`  | `/calls` | ✅ | call শুরু → `Call` row (RINGING) + সঙ্গীকে push |
| `POST`  | `/calls/:id/answer` | ✅ | ONGOING + `answeredAt` |
| `POST`  | `/calls/:id/reject` | ✅ | REJECTED |
| `POST`  | `/calls/:id/end` | ✅ | ENDED + duration হিসাব + chat-এ SYSTEM message |
| `GET`   | `/calls` | ✅ | call history (pagination) |
| `GET`   | `/calls/ice-servers` | ✅ | **short-lived TURN credentials** (Cloudflare API থেকে generate) |

> ⚠️ TURN credential কখনো client-এ hardcode করবেন না। সার্ভার থেকে ৬০ মিনিটের temporary credential ইস্যু করুন।

## 7️⃣ Presence (`/presence`)

| Method | Endpoint | Auth | কাজ |
|---|---|---|---|
| `POST` | `/presence/typing` | ✅ | `{ isTyping: true }` → সঙ্গীর কাছে event (DB hit নেই, শুধু Pusher) |
| `POST` | `/presence/online` | ✅ | online/offline + `lastSeenAt` |
| `POST` | `/pusher/auth` | ✅ | Pusher private/presence channel authorize endpoint |

## 8️⃣ Admin (`/admin`) — role: ADMIN

| Method | Endpoint | কাজ |
|---|---|---|
| `POST`   | `/admin/users` | নতুন partner account তৈরি (email + temp password) |
| `GET`    | `/admin/users` | সব user list |
| `PATCH`  | `/admin/users/:id/reset-password` | পাসওয়ার্ড রিসেট, `mustChangePw = true` |
| `PATCH`  | `/admin/users/:id/status` | activate / deactivate |
| `GET`    | `/admin/sessions` | সব active session (device, ip, last active) |
| `DELETE` | `/admin/sessions/:id` | জোর করে logout করানো |
| `GET`    | `/admin/audit-logs` | `?action=LOGIN_FAILED&page=1` |
| `GET`    | `/admin/stats` | মোট মেসেজ, কল, স্টোরেজ ব্যবহার |

**মোট ≈ 38 endpoint** — কোর্সের ২০টার requirement-ও পার হয়ে যাবে।

---

## 📡 Realtime Channels & Events (Pusher)

### Channels

| Channel | ধরন | কে subscribe করবে |
|---|---|---|
| `private-user-{userId}` | private | শুধু ঐ user — force-logout, personal event |
| `presence-conversation-{convId}` | presence | দুই partner — online list automatic |

> `private-` আর `presence-` চ্যানেলে subscribe করতে হলে Pusher ক্লায়েন্ট আগে আপনার সার্ভারের `/pusher/auth`-এ কল করে। ওখানেই JWT যাচাই করে permission দেবেন — এটাই আপনার নিরাপত্তার দেয়াল।

### Events

| Event | Channel | Payload |
|---|---|---|
| `message:new` | presence-conversation | সম্পূর্ণ message object |
| `message:edited` | presence-conversation | `{ id, body, editedAt }` |
| `message:deleted` | presence-conversation | `{ id, scope }` |
| `message:reaction` | presence-conversation | `{ messageId, userId, emoji \| null }` |
| `message:delivered` | presence-conversation | `{ messageIds[], userId }` |
| `message:read` | presence-conversation | `{ upToMessageId, userId, readAt }` |
| `typing:start` / `typing:stop` | presence-conversation | `{ userId }` |
| `pusher:member_added` / `removed` | presence-conversation | (built-in) online/offline |
| `call:incoming` | private-user | `{ callId, type, caller }` |
| `call:accepted` / `call:rejected` / `call:ended` | private-user | `{ callId, reason? }` |
| `webrtc:offer` / `webrtc:answer` / `webrtc:ice` | private-user | SDP / ICE candidate |
| `session:force-logout` | private-user | `{ reason: "NEW_DEVICE_LOGIN" }` ← ⭐ |
| `conversation:updated` | presence-conversation | wallpaper/theme বদলালে |

### Optimistic UI flow (WhatsApp-এর মতো instant feel)

```
1. User Send চাপল
2. UI-তে সাথে সাথে bubble বসে গেল — status: "sending" (ঘড়ি আইকন)
   → clientMsgId = uuid() (locally generated)
3. POST /messages  { clientMsgId, body }
4. 200 এলে → bubble-এর id সোয়াপ, status: SENT (✓)
5. সঙ্গীর ট্যাব খোলা থাকলে তার ক্লায়েন্ট auto POST /messages/delivered
   → আপনার কাছে `message:delivered` → ✓✓
6. সঙ্গী চ্যাট স্ক্রিনে তাকালে POST /messages/read
   → `message:read` → ✓✓ নীল
```

`clientMsgId` এর কারণে নেটওয়ার্ক খারাপ হয়ে retry হলেও ডবল মেসেজ যাবে না (idempotency)।

---

## 📞 WebRTC Call Flow (audio + video)

```
  A (caller)                সার্ভার/Pusher                 B (callee)
      │                                                       │
      │ 1. POST /calls {type:"AUDIO"}                          │
      │──────────────────────────────────────▶                 │
      │                    2. call:incoming ───────────────────▶│  🔔 ringtone + modal
      │                                                        │
      │ 3. getUserMedia({audio:true, video:type==="VIDEO"})     │
      │ 4. GET /calls/ice-servers  (TURN creds)                 │
      │ 5. createOffer → setLocalDescription                    │
      │    POST → webrtc:offer ────────────────────────────────▶│
      │                                                        │
      │                        6. B "Accept" চাপল               │
      │                           POST /calls/:id/answer         │
      │◀─────────────────── call:accepted                       │
      │                           getUserMedia + setRemoteDesc   │
      │◀─────────────────── webrtc:answer                       │
      │                                                        │
      │ 7. ◀── webrtc:ice ──▶  (দুই দিক থেকেই, trickle ICE)      │
      │                                                        │
      │ 8. ✅ P2P media stream — সার্ভার দিয়ে যায় না             │
      │                                                        │
      │ 9. POST /calls/:id/end → call:ended → দুই দিকেই cleanup  │
```

### কেন TURN লাগবেই

দুইজন আলাদা মোবাইল নেটওয়ার্কে (GP/Robi CGNAT) থাকলে STUN দিয়ে সরাসরি connect হবে না — প্রায় ২০–৩০% ক্ষেত্রে relay লাগে। TURN ছাড়া কল "connecting..." এ আটকে থাকবে।

| Provider | খরচ |
|---|---|
| **Cloudflare Realtime TURN** ⭐ | প্রথম 1000 GB free, তারপর $0.05/GB |
| Metered.ca | free tier ছোট, Growth $99/mo |
| নিজের coturn (VPS) | ~$5/mo + maintenance |

👉 Cloudflare নিন। ২ জনের অডিও কলে মাসে ১ GB-ও লাগবে না।

### Audio-only বনাম Video

একই `useWebRTC` hook, শুধু constraint পাল্টান:

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: callType === "VIDEO" ? { width: 1280, height: 720, facingMode: "user" } : false,
});
```

তাই **দুইটাই রাখুন** — আলাদা খরচ বা আলাদা কাজ প্রায় নেই।

---

## 🔔 Web Push (tab বন্ধ থাকলেও notification)

1. Service worker রেজিস্টার → `pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC })`
2. Subscription সার্ভারে সেভ (`PushSubscription` model)
3. মেসেজ এলে সার্ভার `web-push` দিয়ে notification পাঠাবে
4. ⚠️ iOS Safari-তে Web Push কাজ করে **শুধু যদি PWA হিসেবে Home Screen-এ add করা থাকে** — তাই PWA manifest লাগবেই

> Notification-এ মেসেজের টেক্সট না দেখিয়ে শুধু "নতুন মেসেজ 💜" দেখালে lock screen-এও প্রাইভেসি থাকে।
