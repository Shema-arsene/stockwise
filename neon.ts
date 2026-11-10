import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    realtime: true,
  },
  functions: {
    stockwise: {
      name: "StockWise database probe",
      source: "./src/neon/health.ts",
      env: { STOCKWISE_ORIGIN_SECRET: process.env.STOCKWISE_ORIGIN_SECRET! },
    },
  },
  buckets: {
    uploads: { access: "private" },
  },
});
