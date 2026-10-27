import { expect, test } from "@playwright/test";
import { addProduct, pickProduct, registerOwner, signIn, stockOf, uniqueEmail, waitForServiceWorker, waitForSynced } from "./helpers";

test("owner runs a day: product → purchase → credit sale → debt payment", async ({ page }) => {
  await registerOwner(page, uniqueEmail("owner"), "Mwila General Dealers");

  // 1. Product with opening stock 20
  await addProduct(page, { name: "Sugar 2kg", cost: "40", sell: "50", stock: "20", reorder: "5" });
  const productUrl = page.url();
  expect(await stockOf(page, productUrl)).toBe(20);

  // 2. Receive 10 more from a supplier
  await page.goto("/app/purchases/new");
  await pickProduct(page, "Sugar 2kg");
  await page.getByLabel("Qty").fill("10");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByText("Stock received")).toBeVisible();
  expect(await stockOf(page, productUrl)).toBe(30);

  // 3. Sell 3 on credit to a new customer who pays K50 now
  await page.goto("/app/sales/new");
  await pickProduct(page, "Sugar 2kg");
  await page.getByRole("button", { name: "+1" }).click();
  await page.getByRole("button", { name: "+1" }).click();
  await page.getByRole("button", { name: "Credit" }).click();
  await page.getByRole("combobox").click();
  await page.getByPlaceholder("Search customers").fill("Bwalya Phiri");
  await page.getByRole("option", { name: /New customer/ }).click();
  await page.getByLabel("Address").fill("House 14, Kamwala South");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByLabel("Paid now").fill("50");
  await expect(page.getByText(/Customer will owe K\s?100\.00/)).toBeVisible();
  await page.getByRole("button", { name: /Record sale/ }).click();
  await expect(page).toHaveURL(/\/app\/sales\/view/);
  await expect(page.getByText("Balance due")).toBeVisible();
  expect(await stockOf(page, productUrl)).toBe(27);

  // 4. Debt shows on the debts page; record a K40 payment
  await page.goto("/app/customers");
  await expect(page.getByText("Total customers owe you")).toBeVisible();
  await page.getByRole("link", { name: /Bwalya Phiri/ }).click();
  await expect(page.getByText("House 14, Kamwala South")).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel("Amount received").fill("40");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
  await expect(page.locator("section").first()).toContainText(/K\s?60\.00/);

  // 5. Dashboard reflects today's sale and the debt
  await page.goto("/app");
  await expect(page.getByText("Today's sales")).toBeVisible();
  await expect(page.getByRole("link", { name: /Owed to you/ })).toContainText(/K\s?60\.00/);

  await waitForSynced(page);
});

test("sales recorded offline sync later, and two offline devices merge stock correctly", async ({ browser }) => {
  test.setTimeout(300_000); // several devices against a remote database
  const email = uniqueEmail("offline");

  // Device A: set up the shop and a product with 20 in stock
  const a = await browser.newContext();
  const pageA = await a.newPage();
  await registerOwner(pageA, email, "Offline Test Shop");
  await addProduct(pageA, { name: "Cooking oil 2L", cost: "80", sell: "100", stock: "20" });
  const productUrl = new URL(pageA.url()).pathname + new URL(pageA.url()).search;
  await waitForSynced(pageA);

  // Device B: same owner signs in on another phone and downloads the shop
  const b = await browser.newContext();
  const pageB = await b.newPage();
  await signIn(pageB, email);
  await waitForSynced(pageB);
  expect(await stockOf(pageB, productUrl)).toBe(20);

  // Both devices get the app installed (service worker) and visit the sale screen once
  for (const page of [pageA, pageB]) {
    await page.goto("/app/sales/new");
    await waitForServiceWorker(page);
  }

  // Both go offline and each sells 2 bottles
  await a.setOffline(true);
  await b.setOffline(true);
  for (const page of [pageA, pageB]) {
    await page.goto("/app/sales/new"); // served by the service worker
    await pickProduct(page, "Cooking oil 2L");
    await page.getByRole("button", { name: "+1" }).click();
    await page.getByRole("button", { name: /Record sale/ }).click();
    await expect(page).toHaveURL(/\/app\/sales\/view/);
    await expect(page.getByRole("button", { name: /Offline|waiting to sync/ }).first()).toBeVisible();
    expect(await stockOf(page, productUrl)).toBe(18); // each device only knows its own sale
  }

  // Back online: both push their sale, then pull the other's
  await a.setOffline(false);
  await b.setOffline(false);
  for (const page of [pageA, pageB]) {
    await page.goto("/app");
    await page.getByRole("button", { name: /Offline|waiting to sync|All changes saved|Syncing/ }).first().click();
    await page.getByRole("button", { name: "Sync now" }).click();
  }
  // A pulls again so it sees B's sale, which may have been pushed after A's first pull
  for (const page of [pageA, pageB, pageA]) {
    await page.goto("/app");
    await page.getByRole("button", { name: /All changes saved|Syncing|waiting to sync|Offline/ }).first().click();
    await page.getByRole("button", { name: "Sync now" }).click();
    await waitForSynced(page);
  }

  expect(await stockOf(pageA, productUrl)).toBe(16);
  expect(await stockOf(pageB, productUrl)).toBe(16);

  await a.close();
  await b.close();
});
