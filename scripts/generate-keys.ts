import crypto from "node:crypto";

/**
 * `npm run keys`
 * .env.local এর জন্য secret দুটো বানিয়ে দেয়।
 */
const jwt = crypto.randomBytes(48).toString("base64url");
const msgKey = crypto.randomBytes(32).toString("base64");

console.log(`
নিচের দুই লাইন .env.local এ কপি করুন:
──────────────────────────────────────────────
JWT_SECRET="${jwt}"
MESSAGE_ENCRYPTION_KEY="${msgKey}"
──────────────────────────────────────────────

⚠️  MESSAGE_ENCRYPTION_KEY একবার সেট করার পর আর বদলাবেন না।
    বদলালে আগের সব মেসেজ আর পড়া যাবে না।
`);
