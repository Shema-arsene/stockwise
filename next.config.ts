import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PDF/Excel libraries read font and template files from disk at run time; keep them unbundled.
  serverExternalPackages: ["pdfkit", "exceljs"],
  // Cache Components is off: app screens are static shells that read data from the device
  // database, and the Serwist route needs classic segment config (force-static).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // The service worker must never be served stale, or updates would not reach devices.
        source: "/serwist/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default withSerwist(nextConfig);
