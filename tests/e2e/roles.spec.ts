import { expect, test } from "@playwright/test";
import { PASSWORD, addProduct, pickProduct, registerOwner, uniqueEmail, waitForSynced } from "./helpers";

// Owner → adds a branch and invites a manager → manager creates a cashier login (username +
// password) → cashier sells → manager sees it in Activity and downloads the log → StockWise
// super admin suspends the shop → cashier is locked out. Also checks the dark-mode toggle.
// Uses the seeded super admin support@stockwise.app / demo-password.
test("role hierarchy end to end", async ({ browser }) => {
  test.setTimeout(300_000); // several devices against a remote database
  const shopName = `Roles Test ${Date.now()}`;
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await registerOwner(owner, uniqueEmail("rowner"), shopName);
  await addProduct(owner, { name: "Bread loaf", cost: "15", sell: "19", stock: "40" });
  await waitForSynced(owner);

  // Dark mode toggle in the top bar
  await owner.getByRole("button", { name: "Switch light / dark mode" }).first().click();
  await expect(owner.locator("html")).toHaveClass(/dark/);
  await owner.getByRole("button", { name: "Switch light / dark mode" }).first().click();
  await expect(owner.locator("html")).not.toHaveClass(/dark/);

  // Owner adds a second branch from the Shops page
  await owner.goto("/app/business");
  await owner.getByRole("button", { name: "Add branch" }).first().click();
  await owner.getByLabel("Branch name").fill("Second branch");
  await owner.getByRole("dialog").getByRole("button", { name: "Add branch" }).click();
  await expect(owner.getByText("Second branch")).toBeVisible();

  // Owner invites a manager by link
  await owner.goto("/app/staff");
  await owner.getByRole("button", { name: /Add person/ }).click();
  await owner.getByRole("button", { name: "Invite by link (has email)" }).click();
  await owner.getByRole("button", { name: /^Manager/ }).click();
  await owner.getByRole("button", { name: "Create invite link" }).click();
  const link = await owner.locator("p.font-mono").innerText();
  expect(link).toContain("/invite?token=");

  // Manager signs up through the link and joins
  const managerCtx = await browser.newContext();
  const manager = await managerCtx.newPage();
  const token = new URL(link).searchParams.get("token")!;
  await manager.goto(`/register?next=${encodeURIComponent(`/invite?token=${token}`)}`);
  await manager.getByLabel("Your name").fill("Mo Manager");
  await manager.getByLabel("Email").fill(uniqueEmail("rmanager"));
  await manager.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await manager.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
  await manager.getByRole("button", { name: "Create account" }).click();
  await manager.getByRole("button", { name: "Join shop" }).click();
  await expect(manager).toHaveURL(/\/app$/);

  // Manager manages cashiers only, and creates a cashier login with a password
  await manager.goto("/app/staff");
  await expect(manager.getByText("Cashiers in the branches you run")).toBeVisible();
  await manager.getByRole("button", { name: /Add cashier/ }).click();
  await expect(manager.getByRole("dialog").getByRole("button", { name: /^Manager/ })).toHaveCount(0);
  const username = `cash${Date.now()}`.slice(0, 20);
  await manager.getByLabel("Full name").fill("Cathy Cashier");
  await manager.getByLabel("Username").fill(username);
  const password = "till-pass-1";
  await manager.getByLabel("Password (at least 6 characters)").fill(password);
  await manager.getByRole("button", { name: "Create login" }).click();
  await expect(manager.getByText("Login created")).toBeVisible();
  await manager.getByRole("button", { name: "Close" }).last().click();

  // Cashier signs in with username + password and records a sale
  const cashierCtx = await browser.newContext();
  const cashier = await cashierCtx.newPage();
  await cashier.goto("/login");
  await cashier.getByRole("tab", { name: "Username" }).click();
  await cashier.getByLabel("Username").fill(username);
  await cashier.getByLabel("Password", { exact: true }).fill(password);
  await cashier.getByRole("button", { name: "Sign in" }).click();
  await expect(cashier).toHaveURL(/\/app$/);
  await waitForSynced(cashier);
  await expect(cashier.getByRole("link", { name: "Reports" })).toHaveCount(0);
  await cashier.goto("/app/sales/new");
  await pickProduct(cashier, "Bread loaf");
  await cashier.getByRole("button", { name: /Record sale/ }).click();
  await expect(cashier).toHaveURL(/\/app\/sales\/view/);
  await waitForSynced(cashier);

  // Manager sees the sale and the new login in Activity, and downloads the log
  await manager.goto("/app/activity");
  await expect(manager.getByText(/Recorded sale/).first()).toBeVisible();
  await expect(manager.getByText(/Created a login for Cathy Cashier/)).toBeVisible();
  await manager.getByRole("button", { name: "Download" }).click();
  await manager.getByRole("button", { name: "Entire history" }).click();
  const [download] = await Promise.all([manager.waitForEvent("download"), manager.getByRole("button", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toBe("stockwise-activity_entire-history.csv");
  const csv = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString("utf8"));
  expect(csv).toContain("Username / email");
  expect(csv).toContain(username);
  expect(csv).toMatch(/Recorded sale/);

  // StockWise super admin finds the shop and suspends it
  const supportCtx = await browser.newContext();
  const support = await supportCtx.newPage();
  await support.goto("/login");
  await support.getByLabel("Email").fill("support@stockwise.app");
  await support.getByLabel("Password", { exact: true }).fill("demo-password");
  await support.getByRole("button", { name: "Sign in" }).click();
  await expect(support).toHaveURL(/\/platform$/);
  await support.getByPlaceholder("Search shops or owners").fill(shopName);
  await support.getByRole("link", { name: new RegExp(shopName) }).click();
  await expect(support.getByText(/cannot change a shop's sales/).first()).toBeVisible();
  await support.getByRole("button", { name: "Suspend" }).click();
  await support.getByRole("alertdialog").getByRole("button", { name: "Suspend" }).click();
  await expect(support.getByRole("button", { name: "Reactivate" })).toBeVisible();

  // The cashier is signed out and cannot get back in to sync
  await cashier.goto("/app");
  await expect(cashier).toHaveURL(/\/login/, { timeout: 30_000 });

  // Clean up: reactivate
  await support.getByRole("button", { name: "Reactivate" }).click();
  await expect(support.getByRole("button", { name: "Suspend" })).toBeVisible();

  for (const c of [ownerCtx, managerCtx, cashierCtx, supportCtx]) await c.close();
});
