// Captures real app screenshots from the seeded demo shop for the landing page.
//   npm run build && npx next start --port 3200      (production: no dev overlay)
//   npm run screenshots -- http://localhost:3200
// Writes public/screenshots/{light,dark}/{dashboard,reports}.jpg (laptop) and
// {sale,products,debts}.jpg (phone). Re-run whenever the app's look changes.

import { mkdir } from "node:fs/promises";
import { chromium, devices } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = new URL("../public/screenshots/", import.meta.url);
const browser = await chromium.launch();

async function session(theme, device) {
  const ctx = await browser.newContext({ ...device, colorScheme: theme, locale: "en-US" });
  // Remember the theme the way the app does, so it applies before first paint.
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  const page = await ctx.newPage();
  await page.goto(BASE + "/login");
  await page.getByLabel("Email").fill("demo@stockwise.app");
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app$/, { timeout: 60_000 });
  await page.getByText("Downloading your shop data").waitFor({ state: "detached", timeout: 180_000 }).catch(() => {});
  await page.getByRole("button", { name: "All changes saved" }).first().waitFor({ timeout: 180_000 });
  return { ctx, page };
}

async function shot(page, path, name, ready) {
  await page.goto(BASE + path);
  if (ready) await ready(page);
  await page.waitForTimeout(800); // let charts finish drawing
  await page.screenshot({ path: new URL(name, OUT).pathname.replace(/^\/([A-Z]:)/, "$1"), type: "jpeg", quality: 82 });
}

for (const theme of ["light", "dark"]) {
  await mkdir(new URL(`${theme}/`, OUT), { recursive: true });

  const laptop = await session(theme, { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  await shot(laptop.page, "/app", `${theme}/dashboard.jpg`, (p) => p.getByText("Best sellers this month").waitFor());
  await shot(laptop.page, "/app/reports", `${theme}/reports.jpg`, (p) => p.getByText("Daily sales and profit").waitFor());
  await laptop.ctx.close();

  const phone = await session(theme, devices["Pixel 7"]);
  await shot(phone.page, "/app/products", `${theme}/products.jpg`, (p) => p.getByRole("link", { name: /Sugar 2kg/ }).waitFor());
  await shot(phone.page, "/app/customers", `${theme}/debts.jpg`, (p) => p.getByText("Total owed to you").waitFor());
  await shot(phone.page, "/app/sales/new", `${theme}/sale.jpg`, async (p) => {
    for (const product of ["Mealie meal 25kg", "Cooking oil 2L", "Sugar 2kg"]) {
      await p.getByRole("button", { name: "Add product" }).first().click();
      await p.getByPlaceholder("Search products…").fill(product);
      await p.getByRole("option", { name: new RegExp(product) }).first().click();
    }
    await p.getByRole("button", { name: "+1" }).first().click();
    await p.evaluate(() => window.scrollTo(0, 0));
  });
  await phone.ctx.close();
  console.log(`captured ${theme}`);
}

await browser.close();
