// Proves the activity log cannot be altered, even with direct database access:
//   npx tsx scripts/check-log-immutable.ts
// Tries UPDATE, DELETE and TRUNCATE on activity_log; each must be rejected by the trigger.

import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function attempt(label: string, run: () => Promise<unknown>) {
  try {
    await run();
    console.log(`FAIL ${label}: the database allowed it`);
    process.exitCode = 1;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const blocked = msg.includes("append-only");
    console.log(`${blocked ? "PASS" : "FAIL"} ${label} rejected${blocked ? "" : `: ${msg.slice(0, 160)}`}`);
    if (!blocked) process.exitCode = 1;
  }
}

async function main() {
  const before = await prisma.activityLog.count();
  const one = await prisma.activityLog.findFirst();
  if (!one) throw new Error("activity_log is empty; run the seed first");

  await attempt("UPDATE", () => prisma.$executeRaw`UPDATE activity_log SET action = 'tampered' WHERE id = ${one.id}`);
  await attempt("DELETE", () => prisma.$executeRaw`DELETE FROM activity_log WHERE id = ${one.id}`);
  await attempt("TRUNCATE", () => prisma.$executeRawUnsafe(`TRUNCATE activity_log`));
  await attempt("Prisma update()", () => prisma.activityLog.update({ where: { id: one.id }, data: { action: "tampered" } }));
  await attempt("Prisma deleteMany()", () => prisma.activityLog.deleteMany({}));

  const after = await prisma.activityLog.count();
  const still = await prisma.activityLog.findUnique({ where: { id: one.id } });
  const intact = after >= before && still?.action === one.action;
  console.log(`${intact ? "PASS" : "FAIL"} log intact (${before} → ${after} entries, sample action "${still?.action}")`);
  if (!intact) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
