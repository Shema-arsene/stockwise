import { ImageResponse } from "next/og";

export const alt = "StockWise — bookkeeping & stock control for your shop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link preview shown when the site is shared (WhatsApp, Facebook, X…). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #0f9f74 0%, #0b7a59 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0f9f74" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
          </div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>StockWise</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, maxWidth: 900 }}>Bookkeeping and stock control for your shop</div>
          <div style={{ fontSize: 30, opacity: 0.9 }}>Sales · Stock · Customer debts · Works offline</div>
        </div>
        <div style={{ fontSize: 26, opacity: 0.85 }}>Free while in early access</div>
      </div>
    ),
    size,
  );
}
