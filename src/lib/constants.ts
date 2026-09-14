/**
 * middleware.ts Edge runtime-এ চলে — সেখানে Prisma/Node crypto import করা যায় না।
 * তাই cookie-র নামটা আলাদা, নির্ভরতাহীন ফাইলে রাখা হলো।
 */
export const SESSION_COOKIE = "cv_session";
