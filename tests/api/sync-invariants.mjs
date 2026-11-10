// Run only against a disposable, migrated Neon test branch with auth rate limits off.
// Usage: CONFIRM_DISPOSABLE_TEST_DB=1 node tests/api/sync-invariants.mjs http://localhost:3200
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const base = process.argv[2] ?? "http://localhost:3200";
if (process.env.CONFIRM_DISPOSABLE_TEST_DB !== "1") {
  throw new Error("Set CONFIRM_DISPOSABLE_TEST_DB=1 only for an isolated test branch");
}
if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL for the disposable test branch is required");
const sql = neon(process.env.DIRECT_URL);

let cookie = "";
const timings = [];
async function call(path, { method = "GET", body, shop } = {}) {
  const start = performance.now();
  const response = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", origin: base, ...(cookie ? { cookie } : {}), ...(shop ? { "x-shop-id": shop } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  if (path.startsWith("/api/sync/")) timings.push({ route: path.split("?")[0], durationMs: Math.round(performance.now() - start), status: response.status });
  return { status: response.status, requestId: response.headers.get("x-request-id"), body: await response.json() };
}
async function download(path, shop) {
  const start = performance.now();
  const response = await fetch(base + path, { headers: { cookie, "x-shop-id": shop, origin: base } });
  const bytes = new Uint8Array(await response.arrayBuffer());
  timings.push({ route: "/api/reports/export", durationMs: Math.round(performance.now() - start), status: response.status });
  return { status: response.status, requestId: response.headers.get("x-request-id"), bytes, contentType: response.headers.get("content-type") };
}
function check(ok, message) { if (!ok) throw new Error(message); console.log(`PASS ${message}`); }
const at = new Date().toISOString();
const sale = () => ({ table: "sales", row: {
  id: randomUUID(), number: randomUUID().slice(0, 12), customerId: null, paymentType: "CASH",
  subtotal: 100, vatAmount: 0, total: 100, amountPaid: 100, costTotal: 0,
  note: null, userId: "test", soldAt: at, voidedAt: null, createdAt: at, updatedAt: at, deletedAt: null,
} });
const email = `sync-${randomUUID()}@e2e.test`;
let result = await call("/api/shops");
check(result.status === 401 && result.body.error === "unauthorized" && !!result.requestId, "unauthorized error keeps its body and adds request ID");
result = await call("/api/auth/sign-up/email", { method: "POST", body: { name: "Sync Invariants", email, password: "test-password-123" } });
check(result.status === 200 && !!result.requestId, "sign up and correlated response");
result = await call("/api/shops", { method: "POST", body: { name: "Sync test branch" } });
check(result.status === 201, "create isolated shop");
const shop = result.body.id;
const beforeFault = await call("/api/sync/pull?since=0", { shop });
const faultSale = sale();
faultSale.row.number = `fault-${randomUUID().slice(0, 8)}`;
await sql`DROP TRIGGER IF EXISTS stockwise_test_abort_activity ON activity_log`;
await sql`CREATE OR REPLACE FUNCTION stockwise_test_abort_activity() RETURNS trigger AS $$
  BEGIN
    IF NEW.action = 'sale.create' AND NEW.summary->>'number' LIKE 'fault-%' THEN
      RAISE EXCEPTION 'test failure after sale insert';
    END IF;
    RETURN NEW;
  END;
$$ LANGUAGE plpgsql`;
try {
  await sql`CREATE TRIGGER stockwise_test_abort_activity BEFORE INSERT ON activity_log
    FOR EACH ROW EXECUTE FUNCTION stockwise_test_abort_activity()`;
  result = await call("/api/sync/push", { method: "POST", shop, body: { deviceId: "test", mutations: [faultSale] } });
  check(result.status === 500 && result.body.error === "server_error" && !!result.requestId, "injected activity failure returns correlated error");
  const afterFault = await call("/api/sync/pull?since=0", { shop });
  check(afterFault.body.cursor === beforeFault.body.cursor && !(afterFault.body.changes.sales ?? []).some((r) => r.id === faultSale.row.id), "failed transaction leaves sale and cursor unchanged");
  const log = await call("/api/logs?action=sale.create&limit=100", { shop });
  check(!log.body.entries.some((e) => e.entityId === faultSale.row.id), "failed transaction leaves no audit entry");
} finally {
  await sql`DROP TRIGGER IF EXISTS stockwise_test_abort_activity ON activity_log`;
  await sql`DROP FUNCTION IF EXISTS stockwise_test_abort_activity()`;
}
result = await call("/api/sync/push", { method: "POST", shop, body: { deviceId: "test", mutations: [faultSale] } });
check(result.body.applied === 1, "same mutation succeeds after rollback cause is removed");
const original = sale();
result = await call("/api/sync/push", { method: "POST", shop, body: { deviceId: "test", mutations: [original] } });
check(result.body.applied === 1, "first push commits");
result = await call("/api/sync/push", { method: "POST", shop, body: { deviceId: "test", mutations: [original] } });
check(result.body.applied === 0, "retry does not duplicate sale");
result = await call("/api/logs?action=sale.create&limit=100", { shop });
check(result.status === 200 && result.body.entries.filter((e) => e.entityId === original.row.id).length === 1, "retry does not duplicate audit entry");
const pdf = await download("/api/reports/export?scope=branch&format=pdf", shop);
check(pdf.status === 200 && !!pdf.requestId && new TextDecoder().decode(pdf.bytes.slice(0, 4)) === "%PDF", "branch PDF report still downloads");
const xlsx = await download("/api/reports/export?scope=branch&format=xlsx", shop);
check(xlsx.status === 200 && !!xlsx.requestId && xlsx.bytes[0] === 0x50 && xlsx.bytes[1] === 0x4b, "branch XLSX report still downloads");

result = await call("/api/shops", { method: "POST", body: { name: "Other shop" } });
const otherShop = result.body.id;
const customer = { table: "customers", row: { id: randomUUID(), name: "Other customer", phone: null, address: null, note: null, createdAt: at, updatedAt: at, deletedAt: null } };
result = await call("/api/sync/push", { method: "POST", shop: otherShop, body: { deviceId: "test", mutations: [customer] } });
check(result.body.applied === 1, "other shop has a customer");
const crossShop = sale();
crossShop.row.customerId = customer.row.id;
result = await call("/api/sync/push", { method: "POST", shop, body: { deviceId: "test", mutations: [crossShop] } });
check(result.body.applied === 0 && result.body.rejected[0]?.reason === "missing_customerId" && !!result.requestId, "cross-shop reference is rejected and correlated");

const valid = sale();
const invalid = sale();
invalid.row.total = -1;
result = await call("/api/sync/push", { method: "POST", shop, body: { deviceId: "test", mutations: [valid, invalid] } });
check(result.body.applied === 1 && result.body.rejected.some((r) => r.id === invalid.row.id), "partial validation rejects only bad row");

const concurrent = [sale(), sale()];
const pushes = await Promise.all(concurrent.map((row) => call("/api/sync/push", { method: "POST", shop, body: { deviceId: "test", mutations: [row] } })));
check(pushes.every((r) => r.body.applied === 1), "concurrent pushes commit independently");
const acrossShops = await Promise.all([
  call("/api/sync/push", { method: "POST", shop, body: { deviceId: "test", mutations: [sale()] } }),
  call("/api/sync/push", { method: "POST", shop: otherShop, body: { deviceId: "test", mutations: [sale()] } }),
]);
check(acrossShops.every((r) => r.body.applied === 1), "concurrent shops do not block each other");

const batch = Array.from({ length: 200 }, sale);
result = await call("/api/sync/push", { method: "POST", shop, body: { deviceId: "test", mutations: batch } });
check(result.body.applied === 200, "200-row push commits");
for (let i = 0; i < 9; i++) {
  result = await call("/api/sync/push", { method: "POST", shop, body: { deviceId: "test", mutations: Array.from({ length: 200 }, sale) } });
  check(result.body.applied === 200, `page fixture batch ${i + 1} commits`);
}
let cursor = 0;
const all = [];
let pages = 0;
do {
  result = await call(`/api/sync/pull?since=${cursor}`, { shop });
  check(result.status === 200 && result.body.cursor > cursor, `pull page ${pages + 1} advances cursor`);
  cursor = result.body.cursor;
  all.push(...(result.body.changes.sales ?? []));
  pages++;
} while (result.body.hasMore && pages < 10);
check(pages > 1 && !result.body.hasMore, "pull spans the 2,000-sequence page boundary");
check(all.length === 2006 && new Set(all.map((r) => r.id)).size === 2006, "paged pull has each committed sale exactly once");
const isolated = await call("/api/sync/pull?since=0", { shop: otherShop });
check((isolated.body.changes.sales ?? []).length === 1, "other shop pull does not leak main-shop sales");
console.log(JSON.stringify({ event: "sync.integration_timings", timings }));
console.log("Sync invariants passed");
