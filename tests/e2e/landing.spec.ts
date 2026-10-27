import { expect, test } from "@playwright/test";

test("landing page: nav, FAQ, footer and call to action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Bookkeeping and stock control for your shop" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  // Real screenshots load (alt text comes from translations)
  await expect(page.getByAltText(/StockWise dashboard/).first()).toBeVisible();

  // Phone menu links jump to sections (Pixel 7 project → mobile nav)
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "FAQ" }).click();
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeInViewport();

  // FAQ answers open and close
  const q = page.getByRole("button", { name: "Can my cashier see my profit?" });
  await q.click();
  await expect(page.getByText(/never see cost prices, profit or stock value/)).toBeVisible();
  await q.click();
  await expect(page.getByText(/never see cost prices, profit or stock value/)).toBeHidden();

  // WhatsApp is configured in src/lib/site.ts
  await expect(page.getByRole("link", { name: "Chat on WhatsApp" }).first()).toHaveAttribute("href", /wa\.me\/250781782250/);

  // Pricing: three plans, the middle one chosen by default
  const plans = page.getByRole("radiogroup").first().getByRole("radio");
  await expect(plans).toHaveCount(3);
  await expect(plans.nth(1)).toHaveAttribute("aria-checked", "true");

  // Footer and primary call to action
  await expect(page.getByRole("contentinfo").getByText(/StockWise\. All rights reserved\./)).toBeVisible();
  await page.getByRole("link", { name: "Create your shop" }).click();
  await expect(page).toHaveURL(/\/register$/);
});
