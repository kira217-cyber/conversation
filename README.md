<div align="center">

# 💜 Conversation

**A private, invite-only, WhatsApp-style messenger built for exactly two people.**

No sign-up page. No contact list. No groups. Just one conversation that belongs to two people
and nobody else.

Next.js 16 · TypeScript · Prisma · PostgreSQL · WebRTC · Pusher

</div>

---

## Why this exists

Every messenger is built for scale — thousands of chats, contact discovery, groups, feeds.
This one is built for the opposite: **two accounts, one thread, forever.**

That constraint makes things possible that normal chat apps can't do:

- Accounts can only be created by the operator. There is no `/register` route in the codebase.
- A session can live on **one device at a time**. Logging in anywhere else instantly ends the old session.
- Closing the tab logs you out. Thirty minutes of silence logs you out.
- Messages are encrypted at rest; photos and voice notes are unreachable without a server-signed URL.

It was originally built as a birthday gift. It works well as a template for any two-party private channel.

---

## Features

| | |
|---|---|
| 💬 **Messaging** | Real-time text, emoji picker, reply-to, reactions, delete for me / for everyone |
| ✓✓ **Receipts** | Sent → delivered → read, with the familiar single/double/blue ticks |
| ⌨️ **Presence** | Typing indicator, online status, "last seen 5 minutes ago" |
| 📷 **Photos** | Direct-to-CDN upload with progress, inline preview, full-screen viewer, paste-to-send |
| 🎤 **Voice notes** | Record with a live waveform, play back at 1× / 1.5× / 2× with seekable waveform |
| 📞 **Calls** | Peer-to-peer voice **and** video over WebRTC, with ringtone, mute, and call timer |
| 🔐 **Session security** | Single-device enforcement, tab-close logout, 30-minute idle expiry |
| 🔒 **Encryption** | AES-256-GCM on message bodies at rest; signed, private media URLs |
| 🔔 **Notifications** | Web Push — messages reach the phone with the app closed |
| 📱 **Mobile** | Responsive down to 360px, installable as a PWA or a real Android APK |
| 💜 **Personal** | "Days together" counter, custom wallpaper, a thread that starts at your first message |

---

## Architecture

The one non-obvious decision: **the real-time layer does not run on Vercel.**

Vercel Functions do support WebSockets (public beta, June 2026), but a connection is bound to a
function instance and dies when that instance hits its duration limit. For a chat app that means
repeated mid-conversation disconnects. So real-time is delegated to a managed service, and the
server only ever makes short HTTP calls to it — which is exactly what serverless is good at.

```
┌───────────────────────────────┐
│  Next.js 16 (App Router)      │
│  UI + API Route Handlers      │──────────── Vercel
└───┬──────────────────┬────────┘
    │ REST (same-origin)│ WebSocket
    ▼                   ▼
┌─────────────┐   ┌──────────────────────┐
│ Prisma      │   │  Pusher Channels     │
│ PostgreSQL  │   │  private + presence  │
│ (Neon)      │   └──────────┬───────────┘
└─────────────┘              │ SDP / ICE signalling
                             ▼
┌─────────────┐   ┌──────────────────────┐
│ Cloudinary  │   │  Cloudflare TURN     │
│ signed URLs │   │  relay for WebRTC    │
└─────────────┘   └──────────────────────┘
                   media itself is peer-to-peer,
                   it never touches the server
```

**Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Prisma 6 + PostgreSQL,
Zod, jose (JWT), bcrypt, Pusher Channels, Cloudinary, Cloudflare Realtime TURN.

---

## Security model

This is the part worth reading before you reuse any of it.

### Accounts

There is no registration endpoint. Users are created by `prisma/seed.ts`, which reads
credentials from environment variables and hashes passwords with bcrypt (cost 12).
Five failed logins lock an account for fifteen minutes. Failed logins always return the
same message so you can't probe which addresses exist, and a dummy hash is verified for
unknown users so response timing doesn't leak either.

### One device at a time

Login runs inside a transaction that revokes every other live session for that user, then
creates the new one. The displaced device is told over its private channel and redirects
immediately — but the real guarantee is server-side: any request carrying a revoked session
gets a 401, whether or not the notification arrived.

```ts
await prisma.$transaction(async (tx) => {
  await tx.session.updateMany({
    where: { userId, revokedAt: null },
    data:  { revokedAt: new Date(), revokedReason: "NEW_DEVICE_LOGIN" },
  });
  return tx.session.create({ data: { /* … */ } });
});
```

### Closing the tab logs you out

Three layers, because no single one is reliable:

1. The session cookie carries no `Max-Age`, so quitting the browser discards it.
2. A `sessionStorage` marker is written at login. `sessionStorage` is per-tab and dies with
   the tab — so a cookie without a matching marker means "this tab was closed", and the app
   logs out on the spot.
3. `pagehide` fires a `navigator.sendBeacon` to revoke the session server-side.

Layer 3 is best-effort — a crash or a force-quit skips it. The actual guarantee is the idle
expiry below: no session outlives thirty minutes of silence regardless.

### Thirty minutes of inactivity

`Session.lastActiveAt` is checked on every authenticated request and the session is revoked
once it goes stale. The write is throttled to once a minute so the check costs almost nothing.
The client sends a heartbeat **only** when there has been genuine input and the tab is visible —
a heartbeat on a timer alone would mean sessions never expire, which would make the whole rule
decorative.

### Data

Message bodies are sealed with AES-256-GCM before they reach the database; the key lives in the
environment, not in Postgres. Media is uploaded as Cloudinary `authenticated` assets and served
through server-signed URLs — fetching the raw URL returns `401`. Real-time channels are
authorised per-user by `/api/pusher/auth`, so nobody can subscribe to a conversation that isn't
theirs. TURN credentials are minted server-side with a one-hour TTL and never embedded in the client.

---

## Quick start

**Requirements:** Node.js 20+, and free accounts on Neon, Pusher, Cloudinary, and Cloudflare.

```bash
git clone https://github.com/kira217-cyber/conversation.git
cd conversation
npm install

npm run keys                 # generates JWT_SECRET and MESSAGE_ENCRYPTION_KEY
cp .env.example .env.local   # then fill it in — see the table below

npm run db:push              # create the tables
npm run db:seed              # create the two accounts
npm run dev
```

Open <http://localhost:3000> in two different browsers and sign in as each user.

> Microphone and camera need a secure context. `localhost` counts; `192.168.x.x` does not.
> To test on a phone, deploy first.

### Verify your setup

Each external service has a check that exercises the real code path, so a misconfiguration
surfaces immediately instead of failing later inside the UI:

```bash
npm run db:check          # connection + tables + row counts
npm run check:pusher      # sends a real event, verifies the public key matches
npm run check:cloudinary  # uploads, reads via signed URL, confirms the raw URL is 401, deletes
npm run check:turn        # mints real ICE credentials and lists the relay servers
```

---

## Environment variables

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Neon → Connection string → **Pooled** (contains `-pooler`) |
| `DIRECT_URL` | Neon → Connection string → **Direct** (same URL without `-pooler`) |
| `JWT_SECRET` | `npm run keys` |
| `MESSAGE_ENCRYPTION_KEY` | `npm run keys` — 32 bytes, base64. **Never change it**, or existing messages become unreadable |
| `PUSHER_APP_ID` `PUSHER_KEY` `PUSHER_SECRET` `PUSHER_CLUSTER` | Pusher → Channels → your app → **App Keys** |
| `NEXT_PUBLIC_PUSHER_KEY` `NEXT_PUBLIC_PUSHER_CLUSTER` | Same values as above. Never expose the secret |
| `CLOUDINARY_CLOUD_NAME` `CLOUDINARY_API_KEY` `CLOUDINARY_API_SECRET` | Cloudinary → Dashboard → Product Environment Credentials |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Same cloud name |
| `CLOUDFLARE_TURN_KEY_ID` `CLOUDFLARE_TURN_API_TOKEN` | Cloudflare → Realtime → TURN → Create. **Copy both from the dialog** — the token is shown once |
| `SEED_A_*` `SEED_B_*` `SEED_ADMIN_*` | You choose these. They become the login credentials |
| `IDLE_TIMEOUT_MINUTES` | Default `30` |
| `NEXT_PUBLIC_ANNIVERSARY_DATE` | `YYYY-MM-DD` — drives the "days together" counter |

Without TURN the app still runs, but calls only connect when both people are on the same
network. Everything else is required.

`.env.local` is git-ignored. `.env.example` is the committed template and must stay empty.

---

## Deploying to Vercel

1. Push to GitHub, then import the repository on Vercel. The framework is detected automatically.
2. Paste the contents of `.env.local` into **Settings → Environment Variables**.
3. Deploy, then run `npm run db:push && npm run db:seed` against the production database.
4. Add a custom domain. HTTPS is issued automatically, and it is required for microphone and camera.

Notes for serverless: `PrismaClient` is cached on `globalThis`, the pooled Neon URL is used at
runtime and the direct URL only for migrations, and uploads go straight from the browser to
Cloudinary so the 4.5 MB request body limit never applies.

---

## The Android app

`.github/workflows/android-apk.yml` wraps the deployed site in a Trusted Web
Activity and produces a signed APK. Run it from the Actions tab; the APK comes
back as an artifact.

The app is the same site running inside Chrome, which is the point: Web Push
already works there, so notifications arrive under the app's own name with
nothing extra to build. The workflow also reads the signing fingerprint and
commits it to `src/lib/android.json`, which `/.well-known/assetlinks.json`
serves — that is what removes the address bar from the top of the app.

The signing key is the part to be careful with. Android refuses an update
signed by a different key, so the first run creates one, uploads it, and warns
you to save it. Store it as `ANDROID_KEYSTORE_BASE64` and
`ANDROID_KEYSTORE_PASSWORD` repository secrets and later builds will reuse it.
Bump `version_code` on every release.

For notifications to work at all, the VAPID variables must be set in production
— `npx web-push generate-vapid-keys --json` produces them.

No APK is required, though: **Add to Home Screen** in Chrome gives the same
app window and the same notifications.

## Project structure

```
src/
├── app/
│   ├── api/                 # route handlers
│   │   ├── auth/            # login · logout · session + heartbeat
│   │   ├── messages/        # send · history · receipts · delete · react
│   │   ├── media/sign/      # signed direct-upload parameters
│   │   ├── calls/           # start · answer · end · ICE credentials
│   │   ├── rtc/             # WebRTC signalling relay
│   │   ├── presence/typing/
│   │   └── pusher/auth/     # channel authorisation
│   ├── login/               # the only unauthenticated page
│   └── chat/                # the app
├── components/              # ChatApp, MessageList, Composer, CallOverlay, VoicePlayer …
├── hooks/
│   ├── useSessionGuard.ts   # tab-close + idle + heartbeat
│   ├── useWebRTC.ts         # offer/answer/ICE, call lifecycle
│   └── useVoiceRecorder.ts  # MediaRecorder + waveform sampling
├── lib/
│   ├── auth.ts              # sessions, single-device enforcement
│   ├── crypto.ts            # AES-256-GCM seal/open
│   ├── cloudinary.ts        # signed upload + signed delivery
│   └── pusher.ts            # channel and event definitions
└── middleware.ts            # edge-level route guard

prisma/    schema.prisma · seed.ts
scripts/   key generation and the four service checks
docs/      the original design documents
```

---

## Making it yours

- **Rename the app** — `NEXT_PUBLIC_APP_NAME`, and the `<title>` in `src/app/layout.tsx`.
- **Change the colours** — the palette lives in one `@theme` block at the top of `src/app/globals.css`.
- **Change the wallpaper** — `.chat-wallpaper` in the same file.
- **Change the language** — UI strings are Bengali and live inline in the components.
- **Add a third person** — you would need to rework `getPartner()` and the single-conversation
  assumption in `getConversation()`. It is deliberately not built for that.

---

## License

MIT. Use it, fork it, build something for someone you love.

<div align="center">
<sub>Built with 💜</sub>
</div>
