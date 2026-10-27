import { expect, test } from "@playwright/test";
import { addProduct, pickProduct, registerOwner, uniqueEmail, waitForSynced } from "./helpers";

/** Matches a kwacha amount whatever space the formatter puts after "K". */
const K = (amount: string) => new RegExp(String.raw`K\s?` + amount.replace(".", String.raw`\.`));

test("buy stock on credit, pay the supplier in instalments, and filter debts", async ({ page }) => {
  await registerOwner(page, uniqueEmail("credit"), "Kabwe Traders");
  await addProduct(page, { name: "Cooking oil 2L", cost: "100", sell: "120", stock: "0" });

  // 1. Buy 5 × K100 on credit from a new supplier, paying K100 now
  await page.goto("/app/purchases/new");
  await pickProduct(page, "Cooking oil 2L");
  await page.getByLabel("Qty").fill("5");
  await page.getByRole("button", { name: "On credit" }).click();
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByText("Choose the supplier you are buying on credit from").first()).toBeVisible();

  await page.getByRole("button", { name: "New supplier" }).click();
  const supplierDialog = page.getByRole("dialog");
  await supplierDialog.getByLabel("Name").fill("Kafue Millers");
  await supplierDialog.getByLabel("Phone").fill("0977123456");
  await supplierDialog.getByLabel("Address").fill("Industrial Area, Kafue");
  await supplierDialog.getByRole("button", { name: "Save" }).click();
  await page.getByLabel("Amount paid now").fill("100");
  await expect(page.getByText(/You will owe K\s?400\.00/)).toBeVisible();
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/app\/purchases\/view/);
  await expect(page.getByText("Bought on credit")).toBeVisible();

  // 2. The supplier page shows K400 owed
  await page.getByRole("link", { name: "See what you owe this supplier" }).click();
  await expect(page).toHaveURL(/\/app\/suppliers\/view/);
  const balance = page.locator("section").first();
  await expect(balance).toContainText(K("400.00"));
  await expect(balance).toContainText("Industrial Area, Kafue");

  // 3. Pay K150, then the remaining K250
  for (const [amount, left] of [["150", "250.00"], ["250", "0.00"]] as const) {
    await page.getByRole("button", { name: "Pay supplier" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Amount paid", { exact: true }).fill(amount);
    await dialog.getByRole("button", { name: "Pay supplier" }).click();
    await expect(page.getByText("Payment recorded").first()).toBeVisible();
    await expect(balance).toContainText(K(left));
  }
  await expect(page.getByRole("button", { name: "Pay supplier" })).toBeDisabled();

  // 4. Debts → "You owe suppliers": settled now
  await page.goto("/app/customers?tab=suppliers");
  await expect(page.getByText("Nothing matches these filters")).toBeVisible();
  await page.getByRole("button", { name: "Settled" }).click();
  await expect(page.getByRole("link", { name: /Kafue Millers/ })).toBeVisible();

  // 5. Void the last payment: K250 is owed again
  await page.getByRole("link", { name: /Kafue Millers/ }).click();
  await page.getByRole("button", { name: "Void" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Void" }).click();
  await expect(balance).toContainText(K("250.00"));

  // 6. Filters: owing suppliers, search by address, amount range
  await page.goto("/app/customers?tab=suppliers");
  await expect(page.getByText("Total you owe suppliers")).toBeVisible();
  await expect(page.getByRole("link", { name: /Kafue Millers/ })).toContainText(K("250.00"));
  await page.getByLabel("Search by name, phone or address").fill("kafue");
  await expect(page.getByText("1 result")).toBeVisible();
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByLabel("Owed at least").fill("300");
  await expect(page.getByText("Nothing matches these filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("link", { name: /Kafue Millers/ })).toBeVisible();

  // 7. Dashboard shows what is owed to suppliers
  await page.goto("/app");
  await expect(page.getByRole("link", { name: /You owe suppliers/ })).toContainText(K("250.00"));

  await waitForSynced(page);
});
