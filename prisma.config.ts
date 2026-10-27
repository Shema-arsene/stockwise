import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The CLI (migrate, studio) uses the direct, non-pooled connection.
// The app itself connects through the pooled DATABASE_URL (see src/lib/db/prisma.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
