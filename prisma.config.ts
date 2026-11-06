import "dotenv/config";
import { defineConfig } from "prisma/config";

const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED;

// The CLI (migrate, studio) uses the direct, non-pooled connection.
// The app itself connects through the pooled DATABASE_URL (see src/lib/db/prisma.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Client generation does not need a database connection. Keep the datasource
  // optional so a clean install can run `prisma generate` before `.env` exists;
  // migrate, seed, and studio still require DIRECT_URL at execution time.
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
