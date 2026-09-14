import { PrismaClient } from "@prisma/client";

/**
 * Serverless-এ প্রতি invocation-এ নতুন PrismaClient বানালে
 * Postgres-এর connection শেষ হয়ে যায়। তাই globalThis-এ cache।
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
