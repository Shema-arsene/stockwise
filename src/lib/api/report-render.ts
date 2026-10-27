import "server-only";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import type { ReportData } from "./report-data";

// Renders a ReportData as a branded PDF or an Excel workbook. Labels come from the caller's
// translator ("reportDoc" namespace) so both formats follow the user's language.

export type Label = (key: string, values?: Record<string, string | number>) => string;

interface Fmt {
  money: (ngwee: number) => string;
  number: (v: number) => string;
  percent: (v: number) => string;
  date: (d: Date) => string;
  dateTime: (d: Date) => string;
  day: (isoDay: string) => string;
}

export function formatters(locale: "en" | "fr", tz: string): Fmt {
  const tag = locale === "fr" ? "fr-FR" : "en-ZM";
  const money = new Intl.NumberFormat(tag, { style: "currency", currency: "ZMW", minimumFractionDigits: 2 });
  const num = new Intl.NumberFormat(tag, { maximumFractionDigits: 3 });
  const pct = new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: tz });
  const dateTime = new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone: tz });
  const day = new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return {
    money: (v) => money.format(v / 100),
    number: (v) => num.format(v),
    percent: (v) => pct.format(v),
    date: (d) => date.format(d),
    dateTime: (d) => dateTime.format(d),
    day: (iso) => day.format(new Date(iso + "T00:00:00Z")),
  };
}

export function periodLabel(r: ReportData, t: Label, f: Fmt) {
  if (!r.from && !r.to) return t("entireHistory");
  const end = r.to ? new Date(r.to.getTime() - 1) : new Date();
  return `${r.from ? f.date(r.from) : "…"} – ${f.date(end)}`;
}

/** Built-in PDF fonts only know Latin-1: swap the special spaces Intl uses for plain spaces. */
const pdfText = (s: string) => s.replace(/[   ]/g, " ").replace(/−/g, "-");

// ───────────────────────────── PDF ─────────────────────────────

const BRAND = "#0f9f74";
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const ZEBRA = "#f6f7f9";

export async function renderPdf(r: ReportData, t: Label, f: Fmt): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 48, bottom: 56, left: 44, right: 44 }, bufferPages: true, info: { Title: pdfText(`${t("title")} — ${r.title}`), Author: "StockWise" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  // Header band
  doc.rect(0, 0, doc.page.width, 110).fill(BRAND);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(11).text("StockWise", left, 30);
  doc.font("Helvetica-Bold").fontSize(20).text(pdfText(t("title")), left, 48);
  doc.font("Helvetica").fontSize(11).text(pdfText(r.title), left, 74, { width });
  doc.fillColor(INK);
  doc.y = 128;
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  doc.text(pdfText(`${t("period")}: ${periodLabel(r, t, f)}`), left);
  doc.text(pdfText(`${t("generated")}: ${f.dateTime(r.generatedAt)} · ${t("by")} ${r.generatedBy}`), left);
  doc.moveDown(1);

  const heading = (text: string) => {
    // Room for the heading plus the table header and a couple of rows, so a heading never sits alone at the foot of a page.
    ensure(110);
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(pdfText(text), left);
    doc.moveTo(left, doc.y + 3).lineTo(left + width, doc.y + 3).lineWidth(1.2).strokeColor(BRAND).stroke();
    doc.moveDown(0.7);
  };

  /** Simple table: text columns (the first `textCols`, default 1) left-aligned, numbers right-aligned. Repeats the header on page breaks. */
  const table = (headers: string[], rows: string[][], widths: number[], opts?: { boldLast?: boolean; textCols?: number }) => {
    const total = widths.reduce((a, b) => a + b, 0);
    const textCols = opts?.textCols ?? 1;
    const cols = widths.map((w) => (w / total) * width);
    const rowH = 18;
    const headH = 26; // room for two-line column titles
    const drawRow = (cells: string[], y: number, style: "head" | "body" | "foot", zebra: boolean) => {
      const h = style === "head" ? headH : rowH;
      if (style === "head") doc.rect(left, y, width, h).fill("#eef7f3");
      else if (zebra) doc.rect(left, y, width, h).fill(ZEBRA);
      doc.font(style === "body" ? "Helvetica" : "Helvetica-Bold").fontSize(style === "head" ? 7.5 : 8.5).fillColor(style === "head" ? "#065f46" : INK);
      let x = left;
      cells.forEach((c, i) => {
        const opts = { width: cols[i] - 12, align: (i < textCols ? "left" : "right") as "left" | "right" };
        if (style === "head") {
          // Bottom-align titles so one- and two-line headers line up with the numbers below.
          const textH = doc.heightOfString(pdfText(c), opts);
          doc.text(pdfText(c), x + 6, y + h - 5 - Math.min(textH, h - 6), { ...opts, height: h - 6 });
        } else {
          // A fixed one-line height makes pdfkit truncate long names with "…" instead of wrapping.
          doc.text(pdfText(c), x + 6, y + 5, { ...opts, height: rowH - 8, ellipsis: true });
        }
        x += cols[i];
      });
    };
    ensure(headH + rowH);
    let y = doc.y;
    drawRow(headers, y, "head", false);
    y += headH;
    rows.forEach((cells, i) => {
      if (y + rowH > bottom()) {
        doc.addPage();
        y = doc.y;
        drawRow(headers, y, "head", false);
        y += headH;
      }
      drawRow(cells, y, opts?.boldLast && i === rows.length - 1 ? "foot" : "body", i % 2 === 1);
      y += rowH;
    });
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.y = y + 8;
    doc.x = left;
  };

  // Key figures: a 3-column grid of cards
  const s = r.summary;
  const cards: [string, string][] = [
    [t("revenue"), f.money(s.revenue)],
    [t("grossProfit"), f.money(s.grossProfit)],
    [t("margin"), f.percent(s.margin)],
    [t("salesCount"), f.number(s.count)],
    [t("netSales"), f.money(s.netSales)],
    [t("cogs"), f.money(s.cogs)],
    [t("vat"), f.money(s.vat)],
    [t("purchases"), f.money(s.purchases)],
    [t("stockValue"), f.money(s.stockValue)],
    [t("creditGiven"), f.money(s.creditGiven)],
    [t("debtCollected"), f.money(s.debtCollected)],
    [t("debtOutstanding"), f.money(s.debtOutstanding)],
    [t("boughtOnCredit"), f.money(s.boughtOnCredit)],
    [t("suppliersPaid"), f.money(s.suppliersPaid)],
    [t("payableOutstanding"), f.money(s.payableOutstanding)],
  ];
  heading(t("summary"));
  const cardW = (width - 16) / 3;
  const cardH = 44;
  cards.forEach(([label, value], i) => {
    const col = i % 3;
    if (col === 0) ensure(cardH + 8);
    const x = left + col * (cardW + 8);
    const y = doc.y;
    doc.roundedRect(x, y, cardW, cardH, 6).lineWidth(0.6).strokeColor(LINE).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(pdfText(label), x + 10, y + 8, { width: cardW - 20, lineBreak: false, ellipsis: true });
    doc.font("Helvetica-Bold").fontSize(13).fillColor(i < 3 ? BRAND : INK).text(pdfText(value), x + 10, y + 21, { width: cardW - 20, lineBreak: false });
    if (col === 2 || i === cards.length - 1) doc.y = y + cardH + 8;
    else doc.y = y;
  });
  if (s.voided) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(pdfText(t("voidedNote", { count: s.voided })), left);
  }

  heading(t("byPayment"));
  table(
    [t("paymentType"), t("revenue"), t("share")],
    (["CASH", "MOBILE_MONEY", "CREDIT"] as const).map((p) => [t(`payment.${p}`), f.money(r.byPayment[p]), s.revenue ? f.percent(r.byPayment[p] / s.revenue) : "—"]),
    [3, 2, 1.2],
  );

  if (r.units.length > 1) {
    heading(r.unitKind === "shop" ? t("byShop") : t("byBranch"));
    const rows = r.units.map((u) => [r.unitKind === "shop" && u.owner ? `${u.name} (${u.owner})` : u.name, f.number(u.count), f.money(u.revenue), f.money(u.profit), f.money(u.debtOutstanding), f.money(u.stockValue)]);
    rows.push([t("total"), f.number(s.count), f.money(s.revenue), f.money(s.grossProfit), f.money(s.debtOutstanding), f.money(s.stockValue)]);
    table([r.unitKind === "shop" ? t("shop") : t("branch"), t("salesCount"), t("revenue"), t("grossProfit"), t("debtOutstanding"), t("stockValue")], rows, [3, 1.1, 1.8, 1.8, 1.8, 1.8], { boldLast: true });
  }

  if (r.daily.length) {
    heading(t("daily"));
    table([t("day"), t("salesCount"), t("revenue"), t("grossProfit")], r.daily.map((d) => [f.day(d.day), f.number(d.count), f.money(d.revenue), f.money(d.profit)]), [2.2, 1, 1.8, 1.8]);
  }

  if (r.topProducts.length) {
    heading(t("topProducts"));
    table(
      [t("product"), ...(r.units.length > 1 ? [t("branch")] : []), t("qty"), t("revenueExVat"), t("grossProfit")],
      r.topProducts.map((p) => [p.name, ...(r.units.length > 1 ? [p.branch] : []), f.number(p.qty), f.money(p.revenue), f.money(p.profit)]),
      r.units.length > 1 ? [3, 2, 1, 1.8, 1.8] : [3.5, 1, 1.8, 1.8],
      { textCols: r.units.length > 1 ? 2 : 1 },
    );
  }

  if (r.debtors.length) {
    heading(t("debtors"));
    table(
      [t("customer"), ...(r.units.length > 1 ? [t("branch")] : []), t("phone"), t("address"), t("owes")],
      r.debtors.map((d) => [d.name, ...(r.units.length > 1 ? [d.branch] : []), d.phone ?? "—", d.address ?? "—", f.money(d.owed)]),
      r.units.length > 1 ? [2.6, 1.8, 1.7, 2.4, 1.6] : [3, 1.8, 2.8, 1.6],
      { textCols: r.units.length > 1 ? 4 : 3 },
    );
  }

  if (r.creditors.length) {
    heading(t("creditors"));
    table(
      [t("supplier"), ...(r.units.length > 1 ? [t("branch")] : []), t("phone"), t("youOwe")],
      r.creditors.map((d) => [d.name, ...(r.units.length > 1 ? [d.branch] : []), d.phone ?? "—", f.money(d.owed)]),
      r.units.length > 1 ? [3, 2, 2, 1.8] : [3.5, 2, 1.8],
      { textCols: r.units.length > 1 ? 3 : 2 },
    );
  }

  if (r.lowStock.length) {
    heading(t("lowStock"));
    table(
      [t("product"), ...(r.units.length > 1 ? [t("branch")] : []), t("inStock"), t("reorderAt")],
      r.lowStock.map((p) => [p.name, ...(r.units.length > 1 ? [p.branch] : []), f.number(p.stock), f.number(p.reorderLevel)]),
      r.units.length > 1 ? [3, 2, 1.2, 1.2] : [4, 1.2, 1.2],
      { textCols: r.units.length > 1 ? 2 : 1 },
    );
  }

  // Footer with page numbers on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise make pdfkit start a new page.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 36;
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    doc.text(pdfText(`StockWise · ${r.title}`), left, y, { width: width / 2, lineBreak: false, ellipsis: true });
    doc.text(pdfText(t("page", { page: i + 1, pages: range.count })), left + width / 2, y, { width: width / 2, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}

// ───────────────────────────── Excel ─────────────────────────────

export async function renderXlsx(r: ReportData, t: Label, f: Fmt): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StockWise";
  wb.created = r.generatedAt;
  const MONEY = '"K" #,##0.00';
  const money = (v: number) => Math.round(v) / 100;

  const sheet = (name: string, columns: { header: string; width: number; money?: boolean; pct?: boolean }[], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c.header, width: c.width, style: c.money ? { numFmt: MONEY } : c.pct ? { numFmt: "0.0%" } : {} }));
    ws.getRow(1).font = { bold: true, color: { argb: "FF065F46" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF7F3" } };
    rows.forEach((row) => ws.addRow(row));
    return ws;
  };

  const s = r.summary;
  const summary = sheet(t("summary"), [{ header: t("figure"), width: 34 }, { header: t("value"), width: 22 }], [
    [t("report"), r.title],
    [t("period"), periodLabel(r, t, f)],
    [t("generated"), `${f.dateTime(r.generatedAt)} · ${r.generatedBy}`],
    [],
    [t("salesCount"), s.count],
    [t("revenue"), money(s.revenue)],
    [t("vat"), money(s.vat)],
    [t("netSales"), money(s.netSales)],
    [t("cogs"), money(s.cogs)],
    [t("grossProfit"), money(s.grossProfit)],
    [t("margin"), s.margin],
    [t("purchases"), money(s.purchases)],
    [t("creditGiven"), money(s.creditGiven)],
    [t("debtCollected"), money(s.debtCollected)],
    [t("debtOutstanding"), money(s.debtOutstanding)],
    [t("stockValue"), money(s.stockValue)],
    [t("boughtOnCredit"), money(s.boughtOnCredit)],
    [t("suppliersPaid"), money(s.suppliersPaid)],
    [t("payableOutstanding"), money(s.payableOutstanding)],
    [t("voided"), s.voided],
  ]);
  // Per-row number formats in the two-column summary sheet (row 1 is the header).
  [7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20].forEach((row) => (summary.getCell(`B${row}`).numFmt = MONEY));
  summary.getCell("B12").numFmt = "0.0%";
  summary.getColumn(2).alignment = { horizontal: "right" };

  sheet(t("byPayment"), [{ header: t("paymentType"), width: 22 }, { header: t("revenue"), width: 18, money: true }, { header: t("share"), width: 12, pct: true }],
    (["CASH", "MOBILE_MONEY", "CREDIT"] as const).map((p) => [t(`payment.${p}`), money(r.byPayment[p]), s.revenue ? r.byPayment[p] / s.revenue : 0]),
  );

  sheet(r.unitKind === "shop" ? t("byShop") : t("byBranch"), [
    { header: r.unitKind === "shop" ? t("shop") : t("branch"), width: 30 },
    ...(r.unitKind === "shop" ? [{ header: t("owner"), width: 24 }] : []),
    { header: t("salesCount"), width: 12 },
    { header: t("revenue"), width: 16, money: true },
    { header: t("grossProfit"), width: 16, money: true },
    { header: t("creditGiven"), width: 16, money: true },
    { header: t("debtOutstanding"), width: 18, money: true },
    { header: t("stockValue"), width: 16, money: true },
  ], r.units.map((u) => [u.name, ...(r.unitKind === "shop" ? [u.owner ?? ""] : []), u.count, money(u.revenue), money(u.profit), money(u.creditGiven), money(u.debtOutstanding), money(u.stockValue)]));

  sheet(t("daily"), [{ header: t("day"), width: 14 }, { header: t("salesCount"), width: 12 }, { header: t("revenue"), width: 16, money: true }, { header: t("grossProfit"), width: 16, money: true }],
    r.daily.map((d) => [d.day, d.count, money(d.revenue), money(d.profit)]),
  );

  if (r.topProducts.length || r.debtors.length || r.creditors.length || r.lowStock.length) {
    sheet(t("topProducts"), [{ header: t("product"), width: 32 }, { header: t("branch"), width: 22 }, { header: t("qty"), width: 10 }, { header: t("revenueExVat"), width: 18, money: true }, { header: t("grossProfit"), width: 16, money: true }],
      r.topProducts.map((p) => [p.name, p.branch, p.qty, money(p.revenue), money(p.profit)]),
    );
    sheet(t("debtors"), [{ header: t("customer"), width: 28 }, { header: t("branch"), width: 22 }, { header: t("phone"), width: 18 }, { header: t("address"), width: 30 }, { header: t("owes"), width: 16, money: true }],
      r.debtors.map((d) => [d.name, d.branch, d.phone ?? "", d.address ?? "", money(d.owed)]),
    );
    sheet(t("creditors"), [{ header: t("supplier"), width: 28 }, { header: t("branch"), width: 22 }, { header: t("phone"), width: 18 }, { header: t("address"), width: 30 }, { header: t("youOwe"), width: 16, money: true }],
      r.creditors.map((d) => [d.name, d.branch, d.phone ?? "", d.address ?? "", money(d.owed)]),
    );
    sheet(t("lowStock"), [{ header: t("product"), width: 32 }, { header: t("branch"), width: 22 }, { header: t("inStock"), width: 12 }, { header: t("reorderAt"), width: 12 }],
      r.lowStock.map((p) => [p.name, p.branch, p.stock, p.reorderLevel]),
    );
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
