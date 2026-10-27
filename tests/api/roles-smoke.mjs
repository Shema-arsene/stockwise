// End-to-end API checks for roles, accounts and logs, run against a running server:
//   node tests/api/roles-smoke.mjs http://localhost:3100
// Needs the seeded super admin (support@stockwise.app / demo-password) and auth rate limiting off
// (dev mode, or DISABLE_AUTH_RATE_LIMIT=1). Creates throwaway accounts named *@e2e.test.

import { randomUUID } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3100";
const stamp = Date.now();
let failures = 0;

for (let i = 0; i < 90; i++) {
  try {
    await fetch(BASE + "/login");
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function client() {
  let cookie = "";
  return async (path, { method = "GET", body, shop, raw = false } = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        "content-type": "application/json",
        origin: BASE,
        ...(cookie ? { cookie } : {}),
        ...(shop ? { "x-shop-id": shop } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    if (raw) return { status: res.status, text: await res.text(), headers: res.headers };
    let data = null;
    try {
      data = await res.json();
    } catch {}
    return { status: res.status, data };
  };
}

const ok = (cond, msg) => {
  console.log((cond ? "PASS " : "FAIL ") + msg);
  if (!cond) failures++;
};
const id = () => randomUUID();
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const sale = (number, at) => ({
  table: "sales",
  row: { id: id(), number, customerId: null, paymentType: "CASH", subtotal: 1000, vatAmount: 0, total: 1000, amountPaid: 1000, costTotal: 0, note: null, userId: "x", soldAt: at, voidedAt: null, createdAt: at, updatedAt: at, deletedAt: null },
});
const signUp = async (c, name, email) => c("/api/auth/sign-up/email", { method: "POST", body: { name, email, password: "password123" } });
const findPerson = (staff, pred) => staff.people?.find(pred);

// ── Owner: one shop with two branches, plus a second separate shop ─────
const owner = client();
await signUp(owner, "Olivia Owner", `owner${stamp}@e2e.test`);
let r = await owner("/api/shops", { method: "POST", body: { name: "Branch A", shopName: "Olivia General" } });
const branchA = r.data?.id;
const shop1 = r.data?.businessId;
r = await owner("/api/shops", { method: "POST", body: { name: "Branch B", businessId: shop1 } });
const branchB = r.data?.id;
r = await owner("/api/shops", { method: "POST", body: { name: "Olivia Hardware" } });
const branchH = r.data?.id;
const shop2 = r.data?.businessId;
ok(branchA && branchB && branchH && shop2 && shop2 !== shop1, "owner opens two separate shops, the first with two branches");
r = await owner("/api/shops");
ok(r.data?.shops?.length === 2 && r.data.shops[0].branches.length === 2, "owner's shop list shows both shops and their branches");

// ── Branch manager (email) and shop-wide manager (username login) ───────
const manager = client();
await signUp(manager, "Mo Manager", `manager${stamp}@e2e.test`);
r = await owner("/api/invitations", { method: "POST", shop: branchA, body: { role: "MANAGER", shopId: branchA } });
r = await manager("/api/invitations", { method: "PUT", body: { token: r.data?.token } });
ok(r.data?.role === "MANAGER", "manager joins branch A through an invite");

const areaUser = `area${stamp}`.slice(0, 20);
r = await owner("/api/staff/account", { method: "POST", shop: branchA, body: { shopId: "all", name: "Ada Area", username: areaUser, password: "area-pass-1", role: "MANAGER" } });
ok(r.status === 201, `owner creates a shop-wide manager with a username login (${r.status})`);
const area = client();
r = await area("/api/auth/sign-in/username", { method: "POST", body: { username: areaUser, password: "area-pass-1" } });
ok(r.status === 200, "username + ordinary password sign-in works");
r = await area("/api/sync/pull?since=0", { shop: branchB });
ok(r.status === 200 && r.data?.role === "MANAGER", "shop-wide manager reaches branch B");
r = await area("/api/sync/pull?since=0", { shop: branchH });
ok(r.status === 403, `shop-wide manager cannot reach the owner's other shop (${r.status})`);

// ── Branch manager: cashiers in their branch only ──────────────────────
const cashUser = `cash${stamp}`.slice(0, 20);
r = await manager("/api/staff/account", { method: "POST", shop: branchA, body: { shopId: branchA, name: "Cathy Cashier", username: cashUser, password: "till-2026" } });
ok(r.status === 201, `manager creates a cashier with a password (${r.status})`);
r = await manager("/api/staff/account", { method: "POST", shop: branchA, body: { shopId: branchA, name: "Evil", username: `${cashUser}x`, password: "whatever1", role: "MANAGER" } });
ok(r.status === 403, `manager cannot create managers (${r.status})`);
r = await manager("/api/staff/account", { method: "POST", shop: branchA, body: { shopId: branchB, name: "Elsewhere", username: `${cashUser}y`, password: "whatever1" } });
ok(r.status === 403, `branch manager cannot add people to branch B (${r.status})`);
r = await manager("/api/staff/account", { method: "POST", shop: branchA, body: { shopId: "all", name: "All", username: `${cashUser}z`, password: "whatever1" } });
ok(r.status === 403, `branch manager cannot create shop-wide staff (${r.status})`);
r = await manager("/api/sync/pull?since=0", { shop: branchB });
ok(r.status === 403, `branch manager cannot read branch B (${r.status})`);

r = await manager("/api/staff", { shop: branchA });
const cashier = findPerson(r.data, (p) => p.username === cashUser);
ok(r.data?.people?.every((p) => p.assignments.every((a) => a.role === "CASHIER")), "manager's staff list shows only cashiers");
const ownerView = (await owner("/api/staff", { shop: branchA })).data;
const mgr = findPerson(ownerView, (p) => p.name === "Mo Manager");
const areaPerson = findPerson(ownerView, (p) => p.username === areaUser);
ok(areaPerson?.assignments?.[0]?.kind === "shop" && areaPerson.assignments[0].shopId === null, "owner sees the shop-wide manager as 'all branches'");
r = await manager("/api/staff", { method: "PATCH", shop: branchA, body: { kind: "branch", id: mgr?.assignments[0].id, role: "CASHIER" } });
ok(r.status === 403 && r.data?.error === "cannot_change_self", `manager cannot change their own role (${r.status} ${r.data?.error})`);
r = await manager("/api/staff", { method: "PATCH", shop: branchA, body: { kind: "branch", id: cashier?.assignments[0].id, role: "MANAGER" } });
ok(r.status === 403, `manager cannot promote a cashier (${r.status})`);
r = await area("/api/staff", { method: "PATCH", shop: branchA, body: { kind: "branch", id: mgr?.assignments[0].id, disabled: true } });
ok(r.status === 403, `a manager cannot manage another manager (${r.status})`);
r = await owner("/api/staff/assign", { method: "POST", shop: branchA, body: { userId: mgr?.userId, shopId: branchB, role: "MANAGER" } });
ok(r.status === 200, "owner allocates the manager to branch B as well");
r = await manager("/api/sync/pull?since=0", { shop: branchB });
ok(r.status === 200, `manager now reaches branch B (${r.status})`);

// ── Cashier: password login, lockout, sales, no logs ────────────────────
const cash = client();
r = await cash("/api/auth/sign-in/username", { method: "POST", body: { username: cashUser, password: "till-2026" } });
ok(r.status === 200, "cashier signs in with username + password");
r = await cash("/api/sync/push", { method: "POST", shop: branchA, body: { deviceId: "c1", mutations: [sale("C-1", iso())] } });
ok(r.data?.applied === 1, "cashier records a sale");
r = await cash("/api/logs", { shop: branchA });
ok(r.status === 403, `cashier cannot read the activity log (${r.status})`);
r = await cash("/api/logs/export", { shop: branchA, raw: true });
ok(r.status === 403, `cashier cannot download the activity log (${r.status})`);

// ── Buying on credit and paying a supplier in instalments ──────────────
const supplierId = id();
const creditPurchaseId = id();
const legacyPurchaseId = id();
const t0 = iso();
const purchase = (pid, extra) => ({ table: "purchases", row: { id: pid, supplierId, total: 50000, note: null, userId: "x", purchasedAt: t0, voidedAt: null, createdAt: t0, updatedAt: t0, deletedAt: null, ...extra } });
r = await owner("/api/sync/push", {
  method: "POST",
  shop: branchA,
  body: {
    deviceId: "o1",
    mutations: [
      { table: "suppliers", row: { id: supplierId, name: "Kafue Millers", phone: "0977123456", address: "Industrial Area, Kafue", createdAt: t0, updatedAt: t0, deletedAt: null } },
      purchase(creditPurchaseId, { amountPaid: 10000, paid: false }),
      // An older app version sends only `paid`.
      purchase(legacyPurchaseId, { paid: false }),
      { table: "supplierPayments", row: { id: id(), supplierId, amount: 15000, method: "MOBILE_MONEY", note: null, userId: "x", paidAt: t0, voidedAt: null, createdAt: t0, updatedAt: t0, deletedAt: null } },
    ],
  },
});
ok(r.data?.applied === 4 && r.data?.rejected?.length === 0, `owner buys on credit and pays an instalment (${JSON.stringify(r.data)})`);
r = await owner("/api/sync/pull?since=0", { shop: branchA });
const pulledPurchases = Object.fromEntries((r.data?.changes?.purchases ?? []).map((p) => [p.id, p]));
ok(pulledPurchases[creditPurchaseId]?.amountPaid === 10000, "credit purchase keeps the amount paid up front");
ok(pulledPurchases[legacyPurchaseId]?.amountPaid === 0, "purchase from an older app (paid: false) counts as fully on credit");
ok(r.data?.changes?.supplierPayments?.[0]?.amount === 15000, "owner sees the supplier payment");
ok(r.data?.changes?.suppliers?.find((s) => s.id === supplierId)?.address === "Industrial Area, Kafue", "supplier address syncs");
r = await cash("/api/sync/push", {
  method: "POST",
  shop: branchA,
  body: { deviceId: "c1", mutations: [{ table: "supplierPayments", row: { id: id(), supplierId, amount: 100, method: "CASH", note: null, userId: "x", paidAt: t0, voidedAt: null, createdAt: t0, updatedAt: t0, deletedAt: null } }] },
});
ok(r.data?.rejected?.[0]?.reason === "forbidden", "cashier cannot pay suppliers");
r = await cash("/api/sync/pull?since=0", { shop: branchA });
ok(
  (r.data?.changes?.purchases ?? []).every((p) => p.amountPaid === 0 && p.total === 0) && (r.data?.changes?.supplierPayments ?? []).every((p) => p.amount === 0),
  "cashier never receives purchase or supplier payment amounts",
);
r = await owner("/api/logs?action=purchase", { shop: branchA });
const purchaseLog = (r.data?.entries ?? r.data?.items ?? []).map((e) => e.action);
ok(purchaseLog.includes("purchase.create_credit") && purchaseLog.includes("purchase.pay_supplier"), `credit purchase and supplier payment are logged (${purchaseLog.join(",")})`);
const stranger = client();
for (let i = 0; i < 5; i++) await stranger("/api/auth/sign-in/username", { method: "POST", body: { username: cashUser, password: "wrong-pass" } });
r = await stranger("/api/auth/sign-in/username", { method: "POST", body: { username: cashUser, password: "till-2026" } });
ok(r.status === 403 && r.data?.code === "ACCOUNT_LOCKED", `locked after 5 wrong passwords (${r.status} ${r.data?.code})`);
r = await manager("/api/staff/reset-password", { method: "POST", shop: branchA, body: { kind: "branch", id: cashier?.assignments[0].id, password: "new-till-1" } });
ok(r.status === 200, "manager resets the cashier's password (also unlocks)");
r = await cash("/api/auth/sign-in/username", { method: "POST", body: { username: cashUser, password: "new-till-1" } });
ok(r.status === 200, "cashier signs in with the new password");

// ── Logs: managers see the whole shop; detailed CSV export ──────────────
r = await manager("/api/logs?limit=200", { shop: branchA });
ok(r.status === 200 && r.data.entries.some((e) => e.action === "sale.create") && r.data.entries.some((e) => e.shopId === branchB), "manager sees shop-wide activity, including branch B");
r = await owner("/api/logs/export?locale=en&tz=Africa%2FLusaka", { shop: branchA, raw: true });
const lines = r.text.replace(/^﻿/, "").split("\r\n");
ok(r.status === 200 && lines[0].startsWith("Time (Africa/Lusaka),Recorded on device,Person,Username / email,Role,Shop,Branch,Action,Details"), "export has the detailed header");
const saleLine = lines.find((l) => l.includes("sale.create"));
ok(!!saleLine && saleLine.includes(cashUser) && saleLine.includes("Cashier") && saleLine.includes("Olivia General") && saleLine.includes("Branch A") && saleLine.includes("Recorded sale C-1"), `export row has username, role, shop, branch and plain-words action (${saleLine})`);
r = await owner(`/api/logs/export?from=${encodeURIComponent(iso(Date.now() + 86_400_000))}`, { shop: branchA, raw: true });
ok(r.status === 200 && r.text.replace(/^﻿/, "").split("\r\n").filter(Boolean).length === 1, "a future period exports only the header");
r = await owner("/api/logs?action=logs.export", { shop: branchA });
ok(r.data?.entries?.length >= 1, "downloading the log is itself logged");

// ── Removed cashier: offline work before removal still syncs ────────────
const beforeRemoval = iso(Date.now() - 60_000);
r = await manager(`/api/staff?kind=branch&id=${cashier?.assignments[0].id}`, { method: "DELETE", shop: branchA });
ok(r.status === 200, "manager removes the cashier from branch A");
r = await cash("/api/sync/push", { method: "POST", shop: branchA, body: { deviceId: "c1", mutations: [sale("C-2", beforeRemoval), sale("C-3", iso(Date.now() + 1000))] } });
ok(r.data?.applied === 1 && r.data?.rejected?.[0]?.reason === "removed", "offline sale from before removal accepted, later one refused");

// ── Founder / super admin: manage all accounts, never shop data ─────────
const support = client();
r = await support("/api/auth/sign-in/email", { method: "POST", body: { email: "support@stockwise.app", password: "demo-password" } });
ok(r.status === 200, "super admin signs in");
r = await support("/api/sync/push", { method: "POST", shop: branchA, body: { deviceId: "s", mutations: [sale("S-1", iso())] } });
ok(r.status === 403, `super admin cannot write shop data (${r.status})`);
r = await support(`/api/platform/accounts?q=${areaUser}`);
const areaAccount = r.data?.accounts?.find((a) => a.username === areaUser);
ok(areaAccount?.roles?.[0]?.role === "MANAGER" && areaAccount.roles[0].branch === null, "super admin finds any account and sees its roles");
r = await support("/api/platform/accounts", { method: "POST", body: { userId: areaAccount?.id, action: "deactivate" } });
ok(r.status === 200, "super admin deactivates an account");
r = await area("/api/sync/pull?since=0", { shop: branchA });
ok(r.status === 401, `deactivated account is signed out (${r.status})`);
r = await area("/api/auth/sign-in/username", { method: "POST", body: { username: areaUser, password: "area-pass-1" } });
ok(r.status === 403 && r.data?.code === "ACCOUNT_DEACTIVATED", `deactivated account cannot sign in (${r.data?.code})`);
r = await support("/api/platform/accounts", { method: "POST", body: { userId: areaAccount?.id, action: "reactivate" } });
r = await area("/api/auth/sign-in/username", { method: "POST", body: { username: areaUser, password: "area-pass-1" } });
ok(r.status === 200, "reactivated account signs in again");

const ownerId = ownerView.owner.userId;
r = await support("/api/platform/accounts", { method: "POST", body: { userId: ownerId, action: "reset_password" } });
ok(r.status === 200 && typeof r.data?.temporaryPassword === "string", "super admin resets an owner's password");
const supportId = (await support("/api/me")).data.user.id;
r = await support("/api/platform/accounts", { method: "POST", body: { userId: supportId, action: "deactivate" } });
ok(r.status === 403, `super admin cannot act on their own account (${r.status})`);
r = await support("/api/platform/assignments", { method: "PATCH", body: { kind: "branch", id: mgr?.assignments[0].id, role: "CASHIER" } });
ok(r.status === 200, "super admin changes a role in any shop");
r = await support("/api/platform/assignments", { method: "PATCH", body: { kind: "branch", id: mgr?.assignments[0].id, role: "MANAGER" } });
r = await support("/api/platform/assignments", { method: "POST", body: { businessId: shop1, userId: mgr?.userId } });
ok(r.status === 200, "super admin makes the manager the owner");
r = await manager("/api/me");
ok(r.data?.shops?.filter((s) => s.businessId === shop1).every((s) => s.role === "OWNER"), "the manager is now OWNER of every branch");
r = await owner("/api/auth/sign-in/email", { method: "POST", body: { email: `owner${stamp}@e2e.test`, password: "password123" } });
ok(r.status !== 200, "old owner password no longer works after the reset");

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exitCode = failures ? 1 : 0;
