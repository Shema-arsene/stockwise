import { createSerwistRoute } from "@serwist/turbopack";
import { APP_ROUTES } from "@/lib/routes";

// Each build gets a new revision so updated pages replace the old precached copies.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/app/sw.ts",
  // Native esbuild on Windows dev machines, esbuild-wasm on Linux/Vercel.
  useNativeEsbuild: process.platform === "win32",
  additionalPrecacheEntries: ["/~offline", "/login", ...APP_ROUTES].map((url) => ({ url, revision })),
});
