// Promotes an existing account to Founder (the single top platform account).
//   npm run platform:founder -- you@example.com
// Refuses if a founder already exists; the database also enforces a single founder.

import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { v7 as uuid } from "uuid";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run platform:founder -- you@example.com");

  const existing = await prisma.user.findFirst({ where: { platformRole: "FOUNDER" } });
  if (existing) throw new Error(`A founder already exists (${existing.email}).`);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account with email ${email}. Sign up in the app first.`);

  await prisma.user.update({ where: { id: user.id }, data: { platformRole: "FOUNDER" } });
  await prisma.activityLog.create({
    data: { id: uuid(), actorId: user.id, actorName: user.name, actorRole: "FOUNDER", action: "platform.founder_set", entity: "user", entityId: user.id, summary: { email } },
  });
  console.log(`${user.name} <${email}> is now the Founder. Sign out and in again to see the Platform console.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
