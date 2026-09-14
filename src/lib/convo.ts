import { prisma } from "./prisma";

/** এই অ্যাপে কথোপকথন একটাই। না থাকলে বানিয়ে নেয়। */
export async function getConversation() {
  const existing = await prisma.conversation.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  const anniversary = process.env.NEXT_PUBLIC_ANNIVERSARY_DATE;
  return prisma.conversation.create({
    data: {
      title: "Us 💜",
      anniversary: anniversary ? new Date(anniversary) : null,
    },
  });
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
