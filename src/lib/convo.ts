import { prisma } from "./prisma";

/**
 * কথোপকথন একটাই, আর সেটা কখনো মোছে না।
 * তাই তার id একবার জেনে নিয়ে function instance এর মধ্যে ধরে রাখি —
 * প্রতিটা request এ আর একটা করে DB round trip খরচ হয় না।
 */
const cache = globalThis as unknown as { __convoId?: string };

export async function getConversationId(): Promise<string> {
  if (cache.__convoId) return cache.__convoId;

  const existing = await prisma.conversation.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (existing) {
    cache.__convoId = existing.id;
    return existing.id;
  }

  const anniversary = process.env.NEXT_PUBLIC_ANNIVERSARY_DATE;
  const created = await prisma.conversation.create({
    data: {
      title: "Us 💜",
      anniversary: anniversary ? new Date(anniversary) : null,
    },
    select: { id: true },
  });

  cache.__convoId = created.id;
  return created.id;
}

/** পুরো object দরকার হলে (চ্যাট পেজ লোডের সময়) */
export async function getConversation() {
  const id = await getConversationId();
  const convo = await prisma.conversation.findUnique({ where: { id } });
  if (convo) return convo;

  // কেউ DB থেকে মুছে ফেললে cache বাসি হয়ে যায় — আবার বানিয়ে নিই
  cache.__convoId = undefined;
  const freshId = await getConversationId();
  return prisma.conversation.findUniqueOrThrow({ where: { id: freshId } });
}

/** দুইজনের চ্যাট — তাই "অন্যজন" মানে আমি ছাড়া বাকি PARTNER */
export async function getPartner(myId: string) {
  const partner = await prisma.user.findFirst({
    where: { id: { not: myId }, role: "PARTNER", isActive: true },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      about: true,
      lastSeenAt: true,
    },
  });

  if (!partner) return null;
  // ক্লায়েন্ট কম্পোনেন্টে Date পাঠানো যায় না — ISO স্ট্রিং করে দিই
  return { ...partner, lastSeenAt: partner.lastSeenAt?.toISOString() ?? null };
}
