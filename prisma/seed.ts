// Demo data: an owner with two shops. "Mwila General Dealers" has two branches and 6 weeks of
// history; "Mwila Hardware" has one branch. Run with `npm run db:seed`. Safe to re-run: it
// replaces the demo shops.
//
//   Owner (both shops):              demo@stockwise.app    / demo-password
//   Manager (Kamwala branch):        manager@stockwise.app / demo-password
//   Manager (all branches, General): area@stockwise.app    / demo-password
//   Cashiers (username login):       cashier1 / cashier123 (Kamwala), cashier2 / cashier123 (Chilenje)
//   Super admin (platform):          support@stockwise.app / demo-password
//
// The founder is NOT seeded: exactly one founder may exist, and it should be the real app owner.
// Promote your own account with `npm run platform:founder -- you@example.com`.

import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { hashPassword } from "better-auth/crypto";
import { v7 as uuid } from "uuid";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
const PASSWORD = "demo-password";
const BUSINESS_NAME = "Mwila General Dealers (demo)";
const SECOND_BUSINESS = "Mwila Hardware (demo)";
const CASHIER_PASSWORD = "cashier123";

// Deterministic pseudo-random numbers so every seed looks the same.
let state = 42;
const rand = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];

async function upsertUser(email: string, name: string, extra: Partial<Prisma.UserCreateInput> = {}, password = PASSWORD) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Re-seeding always restores the documented demo password.
    await prisma.account.updateMany({ where: { userId: existing.id, providerId: "credential" }, data: { password: await hashPassword(password) } });
    return prisma.user.update({ where: { id: existing.id }, data: { name, failedLogins: 0, lockedUntil: null, deactivatedAt: null, ...extra } });
  }
  const id = uuid();
  const user = await prisma.user.create({ data: { id, email, name, emailVerified: true, ...extra } });
  await prisma.account.create({
    data: { id: uuid(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password) },
  });
  return user;
}

const PRODUCTS: [name: string, category: string, unit: string, cost: number, sell: number, reorder: number][] = [
  ["Mealie meal 25kg (Breakfast)", "Staples", "bag", 23000, 26500, 5],
  ["Mealie meal 10kg (Roller)", "Staples", "bag", 9000, 10500, 5],
  ["Rice 2kg", "Staples", "pack", 4200, 5000, 6],
  ["Sugar 2kg", "Staples", "pack", 4000, 4800, 8],
  ["Cooking oil 2L", "Staples", "bottle", 8200, 9500, 6],
  ["Salt 1kg", "Staples", "pack", 900, 1200, 5],
  ["Kapenta (dried) 1kg", "Fresh", "kg", 16000, 20000, 3],
  ["Tomatoes", "Fresh", "kg", 1500, 2500, 5],
  ["Onions", "Fresh", "kg", 1200, 2000, 5],
  ["Bread loaf", "Bakery", "pcs", 1500, 1900, 10],
  ["Maheu 500ml", "Drinks", "bottle", 600, 900, 12],
  ["Coca-Cola 500ml", "Drinks", "bottle", 750, 1000, 24],
  ["Mosi lager 375ml", "Drinks", "bottle", 1100, 1500, 24],
  ["Bathing soap", "Household", "pcs", 700, 1000, 10],
  ["Washing powder 1kg", "Household", "pack", 2800, 3500, 6],
  ["Candles (6)", "Household", "pack", 1300, 1800, 5],
  ["Airtel talk-time K20", "Airtime", "pcs", 1900, 2000, 10],
  ["MTN talk-time K20", "Airtime", "pcs", 1900, 2000, 10],
];

const CUSTOMERS: [name: string, phone: string, address: string][] = [
  ["Bwalya Phiri", "0971234567", "House 14, Kamwala South"],
  ["Mutale Banda", "0962345678", "Plot 7, Chilenje market"],
  ["Chanda Mulenga", "0773456789", "Kabwata, near the clinic"],
  ["Ruth Tembo", "0954567890", "Shop 3, Libala stage"],
  ["Joseph Zulu", "0965678901", "Chawama, block C"],
];

async function main() {
  // Replace any previous demo business (cascades to its shops and all their data).
  await prisma.business.deleteMany({ where: { name: { in: [BUSINESS_NAME, SECOND_BUSINESS] } } });
  await prisma.shop.deleteMany({ where: { name: "Mwila General Dealers (demo)" } }); // pre-branches demo

  const businessId = uuid();
  await prisma.business.create({ data: { id: businessId, name: BUSINESS_NAME } });

  const owner = await upsertUser("demo@stockwise.app", "Esther Mwila");
  const admin = await upsertUser("manager@stockwise.app", "Peter Phiri");
  const area = await upsertUser("area@stockwise.app", "Mary Lungu");
  // Earlier demo seeds used these accounts; they are no longer part of the demo.
  await prisma.user.deleteMany({ where: { email: { in: ["admin@stockwise.app", "cashier@stockwise.app"] } } });
  await upsertUser("support@stockwise.app", "StockWise Support", { platformRole: "SUPER_ADMIN" });
  const cashier1 = await upsertUser("cashier1@staff.stockwise.invalid", "John Banda", { username: "cashier1", managedByBusinessId: businessId }, CASHIER_PASSWORD);
  const cashier2 = await upsertUser("cashier2@staff.stockwise.invalid", "Grace Mulenga", { username: "cashier2", managedByBusinessId: businessId }, CASHIER_PASSWORD);

  await prisma.businessMember.createMany({
    data: [
      { id: uuid(), businessId, userId: owner.id, role: "OWNER" },
      // Shop-wide manager: every branch, including ones added later.
      { id: uuid(), businessId, userId: area.id, role: "MANAGER" },
    ],
  });

  const kamwala = await seedShop(businessId, "Kamwala branch", "Kamwala Market, Lusaka", owner.id, admin.id, cashier1.id, 1);
  const chilenje = await seedShop(businessId, "Chilenje branch", "Chilenje, Lusaka", owner.id, null, cashier2.id, 0.6);

  // The same owner's second, separate shop.
  const hardwareId = uuid();
  await prisma.business.create({ data: { id: hardwareId, name: SECOND_BUSINESS } });
  await prisma.businessMember.create({ data: { id: uuid(), businessId: hardwareId, userId: owner.id, role: "OWNER" } });
  const hardware = await seedShop(hardwareId, "Mwila Hardware (demo)", "Cairo Road, Lusaka", owner.id, null, null, 0.3);

  // A little history in the activity log.
  const now = Date.now();
  await prisma.activityLog.createMany({
    data: [
      { id: uuid(), at: new Date(now - 41 * 86_400_000), actorId: owner.id, actorName: owner.name, actorRole: "OWNER", businessId, shopId: kamwala.shopId, action: "business.create", entity: "shop", entityId: kamwala.shopId, summary: { name: "Kamwala branch" } },
      { id: uuid(), at: new Date(now - 30 * 86_400_000), actorId: owner.id, actorName: owner.name, actorRole: "OWNER", businessId, shopId: chilenje.shopId, action: "shop.create", entity: "shop", entityId: chilenje.shopId, summary: { name: "Chilenje branch" } },
      { id: uuid(), at: new Date(now - 29 * 86_400_000), actorId: admin.id, actorName: admin.name, actorRole: "MANAGER", businessId, shopId: kamwala.shopId, action: "staff.join", entity: "user", entityId: admin.id, summary: { role: "MANAGER" } },
      { id: uuid(), at: new Date(now - 28 * 86_400_000), actorId: admin.id, actorName: admin.name, actorRole: "MANAGER", businessId, shopId: kamwala.shopId, action: "staff.create_login", entity: "user", entityId: cashier1.id, summary: { name: cashier1.name, username: "cashier1", role: "CASHIER" } },
      { id: uuid(), at: new Date(now - 28 * 86_400_000), actorId: owner.id, actorName: owner.name, actorRole: "OWNER", businessId, shopId: chilenje.shopId, action: "staff.create_login", entity: "user", entityId: cashier2.id, summary: { name: cashier2.name, username: "cashier2", role: "CASHIER" } },
      { id: uuid(), at: new Date(now - 27 * 86_400_000), actorId: owner.id, actorName: owner.name, actorRole: "OWNER", businessId, action: "staff.assign", entity: "user", entityId: area.id, summary: { name: area.name, role: "MANAGER", allBranches: true } },
      { id: uuid(), at: new Date(now - 20 * 86_400_000), actorId: owner.id, actorName: owner.name, actorRole: "OWNER", businessId: hardwareId, shopId: hardware.shopId, action: "business.create", entity: "shop", entityId: hardware.shopId, summary: { name: SECOND_BUSINESS } },
    ],
  });

  console.log(`Seeded "${BUSINESS_NAME}" (Kamwala ${kamwala.sales} sales, Chilenje ${chilenje.sales}) and "${SECOND_BUSINESS}" (${hardware.sales} sales).`);
  console.log(`Owner demo@stockwise.app · Managers manager@ / area@stockwise.app (password ${PASSWORD}) · Cashiers cashier1, cashier2 / ${CASHIER_PASSWORD} · Super admin support@stockwise.app`);
}

/** One branch with products, customers, 6 weeks of purchases, sales and debt payments. `scale` thins out sales. */
async function seedShop(businessId: string, name: string, address: string, ownerId: string, adminId: string | null, cashierId: string | null, scale: number) {
  const shopId = uuid();
  let seq = 0;
  const next = () => BigInt(++seq);
  const at = (d: Date) => ({ createdAt: d, updatedAt: d });
  const owner = { id: ownerId };
  const cashier = { id: cashierId ?? ownerId };

  await prisma.shop.create({ data: { id: shopId, businessId, name, phone: "+260 97 000 0000", address, currency: "ZMW" } });
  await prisma.membership.createMany({
    data: [
      ...(adminId ? [{ id: uuid(), shopId, userId: adminId, role: "MANAGER" as const, seq: next() }] : []),
      ...(cashierId ? [{ id: uuid(), shopId, userId: cashierId, role: "CASHIER" as const, seq: next() }] : []),
    ],
  });

  const start = new Date();
  start.setDate(start.getDate() - 42);
  start.setHours(8, 0, 0, 0);

  const categories = new Map<string, string>();
  for (const c of new Set(PRODUCTS.map((p) => p[1]))) categories.set(c, uuid());
  await prisma.category.createMany({
    data: [...categories].map(([name, id]) => ({ id, shopId, name, ...at(start), seq: next() })),
  });

  const products = PRODUCTS.map(([name, cat, unit, cost, sell, reorder]) => ({ id: uuid(), name, cat, unit, cost, sell, reorder }));
  await prisma.product.createMany({
    data: products.map((p) => ({
      id: p.id,
      shopId,
      categoryId: categories.get(p.cat)!,
      name: p.name,
      unit: p.unit,
      costPrice: BigInt(p.cost),
      sellPrice: BigInt(p.sell),
      reorderLevel: p.reorder,
      ...at(start),
      seq: next(),
    })),
  });

  const stock = new Map(products.map((p) => [p.id, 0]));
  const movements: Prisma.StockMovementCreateManyInput[] = [];
  for (const p of products) {
    const qty = p.reorder * 4 + Math.floor(rand() * 20);
    stock.set(p.id, qty);
    movements.push({ id: uuid(), shopId, productId: p.id, qty, type: "OPENING", userId: owner.id, ...at(start), seq: next() });
  }

  const customers = CUSTOMERS.map(([name, phone, address]) => ({ id: uuid(), name, phone, address }));
  await prisma.customer.createMany({ data: customers.map((c) => ({ id: c.id, shopId, name: c.name, phone: c.phone, address: c.address, ...at(start), seq: next() })) });
  // One supplier paid on the spot, one who sells to the shop on credit.
  const supplierId = uuid();
  const creditSupplierId = uuid();
  await prisma.supplier.createMany({
    data: [
      { id: supplierId, shopId, name: "Lusaka Wholesale Ltd", phone: "0211 000000", address: "Plot 4, Cairo Road, Lusaka", ...at(start), seq: next() },
      { id: creditSupplierId, shopId, name: "Kafue Millers", phone: "0977 123456", address: "Industrial Area, Kafue", ...at(start), seq: next() },
    ],
  });
  const supplierPayments: Prisma.SupplierPaymentCreateManyInput[] = [];
  let restocks = 0;

  const sales: Prisma.SaleCreateManyInput[] = [];
  const items: Prisma.SaleItemCreateManyInput[] = [];
  const purchases: Prisma.PurchaseCreateManyInput[] = [];
  const purchaseItems: Prisma.PurchaseItemCreateManyInput[] = [];
  const payments: Prisma.DebtPaymentCreateManyInput[] = [];
  let receipt = 0;

  for (let day = 0; day <= 42; day++) {
    const date = new Date(start);
    date.setDate(start.getDate() + day);

    // Weekly restock of anything running low.
    if (day % 7 === 3) {
      const purchaseId = uuid();
      const when = new Date(date.getTime() + 60 * 60 * 1000);
      let total = 0;
      for (const p of products) {
        if ((stock.get(p.id) ?? 0) > p.reorder * 2) continue;
        const qty = p.reorder * 4;
        total += qty * p.cost;
        stock.set(p.id, (stock.get(p.id) ?? 0) + qty);
        purchaseItems.push({ id: uuid(), shopId, purchaseId, productId: p.id, qty, unitCost: BigInt(p.cost), lineTotal: BigInt(qty * p.cost), ...at(when), seq: next() });
        movements.push({ id: uuid(), shopId, productId: p.id, qty, type: "PURCHASE", refId: purchaseId, userId: owner.id, ...at(when), seq: next() });
      }
      if (total > 0) {
        // Every other restock is bought on credit with 30% paid up front, then paid back in instalments.
        const onCredit = restocks++ % 2 === 1;
        const amountPaid = onCredit ? Math.round((total * 0.3) / 100) * 100 : total;
        purchases.push({
          id: purchaseId,
          shopId,
          supplierId: onCredit ? creditSupplierId : supplierId,
          total: BigInt(total),
          amountPaid: BigInt(amountPaid),
          paid: amountPaid >= total,
          userId: owner.id,
          purchasedAt: when,
          ...at(when),
          seq: next(),
        });
        if (onCredit) {
          for (const [days, share] of [[4, 0.4], [10, 0.3]] as const) {
            const paidAt = new Date(when.getTime() + days * 86_400_000);
            if (paidAt > new Date()) continue;
            const amount = Math.round(((total - amountPaid) * share) / 100) * 100;
            supplierPayments.push({ id: uuid(), shopId, supplierId: creditSupplierId, amount: BigInt(amount), method: days === 4 ? "MOBILE_MONEY" : "CASH", userId: owner.id, paidAt, ...at(paidAt), seq: next() });
          }
        }
      }
    }

    const salesToday = Math.round((6 + Math.floor(rand() * 10) + (date.getDay() === 6 ? 6 : 0)) * scale); // busier Saturdays
    for (let n = 0; n < salesToday; n++) {
      // Today's sales fall between opening (08:00) and now, so the demo always has a "today".
      const isToday = day === 42;
      const span = isToday ? Math.max(Date.now() - date.getTime(), 60 * 60 * 1000) : 12 * 60 * 60 * 1000;
      const when = new Date(date.getTime() + (isToday ? rand() * span : (1 + rand() * 11) * 60 * 60 * 1000));
      if (when > new Date()) continue;
      const saleId = uuid();
      const lines = 1 + Math.floor(rand() * 3);
      let subtotal = 0;
      let cost = 0;
      const used = new Set<string>();
      for (let l = 0; l < lines; l++) {
        const p = pick(products);
        if (used.has(p.id) || (stock.get(p.id) ?? 0) < 1) continue;
        used.add(p.id);
        const qty = Math.min(1 + Math.floor(rand() * 3), stock.get(p.id)!);
        stock.set(p.id, stock.get(p.id)! - qty);
        subtotal += qty * p.sell;
        cost += qty * p.cost;
        items.push({ id: uuid(), shopId, saleId, productId: p.id, qty, unitPrice: BigInt(p.sell), unitCost: BigInt(p.cost), lineTotal: BigInt(qty * p.sell), ...at(when), seq: next() });
        movements.push({ id: uuid(), shopId, productId: p.id, qty: -qty, type: "SALE", refId: saleId, userId: cashier.id, ...at(when), seq: next() });
      }
      if (!subtotal) continue;
      const r = rand();
      const credit = r < 0.12;
      const paymentType = credit ? "CREDIT" : r < 0.45 ? "MOBILE_MONEY" : "CASH";
      const customer = credit ? pick(customers) : null;
      sales.push({
        id: saleId,
        shopId,
        number: `DEMO-${String(++receipt).padStart(5, "0")}`,
        customerId: customer?.id ?? null,
        paymentType,
        subtotal: BigInt(subtotal),
        total: BigInt(subtotal),
        amountPaid: BigInt(credit ? 0 : subtotal),
        costTotal: BigInt(cost),
        userId: pick([owner.id, cashier.id]),
        soldAt: when,
        ...at(when),
        seq: next(),
      });
    }

    // Some customers pay back part of their debt each week.
    if (day % 7 === 5) {
      for (const c of customers.slice(0, 3)) {
        const when = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        if (when > new Date()) continue;
        payments.push({ id: uuid(), shopId, customerId: c.id, amount: BigInt(5000 + Math.floor(rand() * 5) * 1000), method: pick(["CASH", "MOBILE_MONEY"] as const), userId: owner.id, paidAt: when, ...at(when), seq: next() });
      }
    }
  }

  await prisma.purchase.createMany({ data: purchases });
  await prisma.purchaseItem.createMany({ data: purchaseItems });
  await prisma.sale.createMany({ data: sales });
  await prisma.saleItem.createMany({ data: items });
  await prisma.stockMovement.createMany({ data: movements });
  await prisma.debtPayment.createMany({ data: payments });
  await prisma.supplierPayment.createMany({ data: supplierPayments });
  await prisma.shop.update({ where: { id: shopId }, data: { seq: BigInt(seq) } });
  return { shopId, sales: sales.length };
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
