import { PrismaClient } from "@prisma/client";

/**
 * `npm run db:check`
 * ডেটাবেসের সাথে সংযোগ আছে কিনা আর টেবিলগুলো তৈরি হয়েছে কিনা দেখে।
 */
async function main() {
  const prisma = new PrismaClient();

  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`;

  console.log("\n✅ ডেটাবেস সংযোগ ঠিক আছে\n");
  console.log("টেবিল:");
  for (const t of tables) console.log("   •", t.table_name);

  const [users, messages, convos] = await Promise.all([
    prisma.user.count(),
    prisma.message.count(),
    prisma.conversation.count(),
  ]);

  console.log(`\nUser: ${users}   Conversation: ${convos}   Message: ${messages}`);
  if (users === 0) console.log("\n👉 এখন `npm run db:seed` চালান — অ্যাকাউন্ট তৈরি হবে।");
  console.log("");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("\n❌ ডেটাবেসে পৌঁছানো গেল না:\n", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});
