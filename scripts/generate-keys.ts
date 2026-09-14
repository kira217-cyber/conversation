import crypto from "node:crypto";

/**
 * `npm run keys`
 * .env.local এর জন্য secret দুটো বানিয়ে দেয়।
 */
const jwt = crypto.randomBytes(48).toString("base64url");
const msgKey = crypto.randomBytes(32).toString("base64");

console.log(`
Copy these two lines into .env.local:
──────────────────────────────────────────────
JWT_SECRET="${jwt}"
MESSAGE_ENCRYPTION_KEY="${msgKey}"
──────────────────────────────────────────────

⚠️  Never change MESSAGE_ENCRYPTION_KEY once it is set.
    Changing it makes every existing message unreadable.
`);
