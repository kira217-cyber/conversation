import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

/**
 * `npm run db:seed`
 * এই অ্যাপে register page নেই — অ্যাকাউন্ট শুধু এখান থেকেই তৈরি হয়।
 * বারবার চালানো নিরাপদ: থাকলে আপডেট হয়, না থাকলে তৈরি হয়।
 */
const prisma = new PrismaClient();

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`❌ .env.local এ ${name} সেট করা নেই`);
  }
  return value;
}

async function upsertUser(opts: {
  email: string;
  password: string;
  displayName: string;
  role: "ADMIN" | "PARTNER";
}) {
  const email = opts.email.toLowerCase().trim();
  const passwordHash = await hash(opts.password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, displayName: opts.displayName, role: opts.role, isActive: true },
    create: { email, passwordHash, displayName: opts.displayName, role: opts.role },
  });

  console.log(`  ✓ ${opts.role.padEnd(7)} ${email}`);
  return user;
}

async function main() {
  console.log("\n🌱 Seeding...\n");

  await upsertUser({
    email: required("SEED_A_EMAIL"),
    password: required("SEED_A_PASSWORD"),
    displayName: process.env.SEED_A_NAME ?? "Partner A",
    role: "PARTNER",
  });

  await upsertUser({
    email: required("SEED_B_EMAIL"),
    password: required("SEED_B_PASSWORD"),
    displayName: process.env.SEED_B_NAME ?? "Partner B",
    role: "PARTNER",
  });

  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    await upsertUser({
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
      displayName: "Admin",
      role: "ADMIN",
    });
  }

  const anniversary = process.env.NEXT_PUBLIC_ANNIVERSARY_DATE;
  const existing = await prisma.conversation.findFirst();

  if (existing) {
    await prisma.conversation.update({
      where: { id: existing.id },
      data: { anniversary: anniversary ? new Date(anniversary) : existing.anniversary },
    });
    console.log(`  ✓ conversation (আগেরটাই আছে)`);
  } else {
    await prisma.conversation.create({
      data: {
        title: "Us 💜",
        anniversary: anniversary ? new Date(anniversary) : null,
      },
    });
    console.log(`  ✓ conversation তৈরি হয়েছে`);
  }

  console.log("\n✅ হয়ে গেছে। এখন `npm run dev` চালিয়ে লগইন করুন।\n");
}

main()
  .catch((err) => {
    console.error("\n" + (err instanceof Error ? err.message : err) + "\n");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
