import { expect, type Page } from "@playwright/test";

export const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@e2e.test`;
export const PASSWORD = "e2e-password-123";

export async function registerOwner(page: Page, email: string, shopName: string) {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Esther Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Shop name").fill(shopName);
  await page.getByRole("button", { name: "Create shop" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: /Hello, Esther/ })).toBeVisible();
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

/** Waits until local changes have reached the server. */
export async function waitForSynced(page: Page) {
  await expect(page.getByRole("button", { name: "All changes saved" }).first()).toBeVisible({ timeout: 30_000 });
}

/** Waits for the service worker to take control so pages load offline. */
export async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // A reload puts the page under the worker's control.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
}

export async function addProduct(page: Page, p: { name: string; cost: string; sell: string; stock: string; reorder?: string }) {
  await page.goto("/app/products/edit");
  await page.getByLabel("Product name").fill(p.name);
  await page.getByLabel("Cost price").fill(p.cost);
  await page.getByLabel("Selling price").fill(p.sell);
  await page.getByLabel("Current stock").fill(p.stock);
  if (p.reorder) await page.getByLabel("Low-stock alert at").fill(p.reorder);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/app\/products\/view\?id=/);
  await expect(page.getByRole("heading", { name: p.name })).toBeVisible();
}

/** Adds a product to the open sale/purchase form via the picker. */
export async function pickProduct(page: Page, name: string) {
  await page.getByRole("button", { name: "Add product" }).first().click();
  await page.getByPlaceholder("Search products…").fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).first().click();
}

/** Reads a product's current stock from its detail page ("In stock" card). */
export async function stockOf(page: Page, productUrl: string) {
  await page.goto(productUrl);
  const card = page.locator("div", { has: page.getByText("In stock", { exact: true }) }).first();
  const text = await card.locator("p").nth(1).innerText();
  return Number(text.replace(/[^\d.]/g, ""));
}
