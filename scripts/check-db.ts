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

  console.log("\n✅ Database connection is fine\n");
  console.log("Tables:");
  for (const t of tables) console.log("   •", t.table_name);

  const [users, messages, convos] = await Promise.all([
    prisma.user.count(),
    prisma.message.count(),
    prisma.conversation.count(),
  ]);

  console.log(`\nUsers: ${users}   Conversations: ${convos}   Messages: ${messages}`);
  if (users === 0) console.log("\n👉 Run `npm run db:seed` next to create the accounts.");
  console.log("");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("\n❌ Could not reach the database:\n", err instanceof Error ? err.message : err, "\n");
  process.exit(1);
});
