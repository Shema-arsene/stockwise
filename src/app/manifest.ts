import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StockWise — shop bookkeeping",
    short_name: "StockWise",
    description: "Sales, stock and customer debts for your shop. Works offline.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f9f74",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New sale", url: "/app/sales/new" },
      { name: "Products", url: "/app/products" },
      { name: "Debts", url: "/app/customers" },
    ],
  };
}
