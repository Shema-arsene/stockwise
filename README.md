# StockWise

Bookkeeping and inventory for small shops: products and stock, sales and purchases, customers who buy on credit, and reports. Built mobile-first for Zambia (Kwacha, optional 16% VAT, English and French), and it **keeps working with no internet**.

## Stack

Next.js 16 (App Router), React 19, Tailwind 4 + shadcn/ui, next-intl, Prisma 7 on Neon PostgreSQL, Better Auth, Axios, TanStack Query, Recharts, Dexie (IndexedDB), and Serwist (service worker). Tests use Vitest and Playwright.

## Getting started

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # fill in Neon URLs and BETTER_AUTH_SECRET
npm run db:migrate          # create tables
npm run db:seed             # optional demo business, see below
npm run dev                 # http://localhost:3100
```

The service worker (offline mode) only runs in production builds: `npm run build && npm start`.

Demo accounts created by the seed (password `demo-password` unless noted):

| Account | Role |
|---|---|
| `demo@stockwise.app` | Owner of two shops (General Dealers with 2 branches, Hardware with 1) |
| `manager@stockwise.app` | Manager, Kamwala branch |
| `area@stockwise.app` | Manager of all General Dealers branches |
| `cashier1` / `cashier123` | Cashier, Kamwala (Username tab) |
| `cashier2` / `cashier123` | Cashier, Chilenje |
| `support@stockwise.app` | Super admin (Platform console) |

## How it works

### Offline-first

Every screen reads and writes the **on-device database** (IndexedDB, one database per shop) and never waits for the server. Each change is also queued in an **outbox**. The sync engine (`src/lib/local/sync.ts`) runs when the app starts, when the connection returns, after each change and every 30 seconds. It does two things:

1. **Push** sends queued changes to `POST /api/sync/push` in batches. The server is idempotent, so a retried batch is harmless.
2. **Pull** fetches everything with a change number above the device's cursor from `GET /api/sync/pull`.

App pages are static shells, precached by the service worker, so the whole app opens offline after the first visit. Records are addressed with `?id=` query strings for the same reason.

### Conflict-free ledgers

- **Stock is never stored as a number.** It is the sum of `StockMovement` rows (opening, purchase, sale, adjustment, void). Two phones selling offline at the same time merge correctly.
- **Customer debt** is credit sales minus payments.
- Editable records (products, customers, suppliers, categories) use last-write-wins by `updatedAt`.
- Sales, purchases and payments are never edited, only voided.

### Server rules (`src/lib/sync/server.ts`)

- Every row is validated with Zod (`src/lib/sync/tables.ts`) and checked against the user's role.
- Cross-shop references are rejected.
- Writes for a shop are serialised through the shop's change counter, so pulls never miss a change.
- **Cost prices are stamped by the server.** Cashiers never download cost, profit or stock value.

### Roles

Vocabulary: a **shop** is a customer's business (billed). It has one or more **branches**. In code, a shop is `Business` and a branch is `Shop`.

| Role | Who | Can do |
|---|---|---|
| **Founder** | The app owner (exactly one) | Everything a super admin can, plus add and remove super admins |
| **Super admin** | StockWise staff | Manage **every account** below them: reset passwords, unlock, deactivate or reactivate, change roles and branch assignments, make someone a shop's owner. Suspend shops, change plans, read all activity. **Cannot edit any shop's sales, stock or debts.** |
| **Owner** | Owns one or more shops (billed) | Everything in their shops: open shops and branches; allocate managers per branch or to a whole shop; manage everyone in their shops |
| **Manager** | Runs assigned branches (or all branches of a shop) | Products, stock, purchases, voids, reports, branch settings; everything a cashier does; manages **cashiers** in their branches; reads the shop's activity log |
| **Cashier** | Counter staff | Sales, customers, debt payments. No cost prices or profit. |

Rules enforced on the server (`src/lib/permissions.ts`, unit-tested as a full 5×5 matrix):

- **Rank decides.** You can manage only people ranked below you (Founder > Super admin > Owner > Manager > Cashier), and never yourself. Owner is never handed out directly; it moves only by ownership transfer.
- **Managers can be allocated two ways:** to specific branches, or to a whole shop. A shop-wide manager also covers branches added later.
- **Staff logins:** staff without email get a **username and password** (6+ characters) created by their owner or manager, who can later reset it. Email accounts keep control of their own password.
- **Lockout:** an account locks for 15 minutes after 5 wrong attempts.
- **Deactivation, not deletion:** accounts are never deleted. Deactivation signs the person out everywhere and blocks sign-in until reactivated.
- **Removed or disabled staff** can still upload sales they recorded offline *before* losing access. Anything later is refused, and late uploads are flagged in the activity log.

**Founder setup:** sign up normally, then run `npm run platform:founder -- you@example.com`. The founder sees the Platform console at `/platform`.

### Activity log

Every action is recorded: sign-ins and failed attempts, sales, voids, stock changes, purchases, payments, product and customer edits, staff and role changes, account actions, settings, platform actions, and log downloads.

**Download:** Activity → Download gives a detailed CSV for any period or the entire history. It has one row per action with:
- the time in your timezone, plus the device time if the action was recorded offline;
- person, username or email, and role;
- shop and branch;
- the action in plain words, its details, and the action code;
- record ID, device and IP.

- **Owners and managers** see their shop at `/app/activity`.
- **The founder and super admins** see the whole app.

The log is **append-only**: a database trigger rejects every UPDATE, DELETE and TRUNCATE on `activity_log`, so not even someone with database access can change history. Run `npx tsx scripts/check-log-immutable.ts` to verify this.

### Debts both ways: customers and suppliers

- **Customers owe you.** Credit sales minus debt payments, as before. Customers can have a phone number and an address, and both can be added from the sale screen.
- **You owe suppliers.** A purchase can be paid in full or bought **on credit**, with an optional amount paid up front; buying on credit needs a supplier. The rest is owed to that supplier, and you can buy on credit again and again. Pay it back in **instalments** from the supplier's page (`/app/suppliers/view`), with cash or mobile money. A payment can be voided.
  - Data: `purchase.amountPaid`, plus the `supplier_payment` ledger (synced as `supplierPayments`, write mode `voidable`).
  - Older app versions that send only `paid` are still accepted (`normalisePurchase`).
  - Cashiers can't see or record any of it: amounts are zeroed in what they download.
- **Ageing.** Both directions use the same oldest-first rule (`ageBalance` in `src/lib/debt.ts`).
- **The Debts page** has two tabs: *Customers owe you*, and *You owe suppliers* (managers and owners only).
  - Each tab has search (name, phone or address) and status chips (owing, settled, overpaid, all).
  - The **Filters** panel adds: age of the oldest unpaid bill, last activity, and a minimum / maximum amount.
  - Sort by balance, oldest debt, name or recent activity.
  - The age bars double as quick filters.
  - The filter logic is in `src/lib/debt-filter.ts` and is unit tested.

### Rate limiting

- **Sign-in and sign-up** are limited by Better Auth.
- **Every other API call** goes through `rateLimit()` (`src/lib/api/rate-limit.ts`). The counters live in Postgres (`api_rate_limit`), so all server instances share them. Limits per person per minute:

  | Calls | Limit |
  |---|---|
  | Any API call | 300 |
  | Sync uploads | 120 |
  | Report and log downloads | 10 |
  | Staff and invitation changes | 30 |
  | Platform account actions | 60 |

- **Over the limit**, the server answers `429` with a `Retry-After` header:
  - the sync engine keeps changes queued and quietly retries;
  - download dialogs say "Too many requests".
- **Limits are off** in development and when `DISABLE_AUTH_RATE_LIMIT=1` (end-to-end tests).

**Caching.** The app reads from the device's IndexedDB copy, so it doesn't need a server-side read cache. Sync pulls only what changed (per-branch `seq` cursor), and the service worker precaches every app page.

### Reports (PDF and Excel)

Owners, managers, the founder and super admins can download a full report from **Reports → Generate report** (in the Platform console, from the Reports tab or a shop's page). It covers sales, VAT, cost and gross profit, payment types, a per-branch (or per-shop) breakdown, daily totals, top products, customers who owe (with addresses), what you bought on credit, paid to and still owe suppliers, and low stock. Period: this month, last month, last 30 days, this year, custom dates, or the entire history.

- **Scope:** one branch; all branches (owners) or the branches a manager runs; one shop or every shop (platform staff).
- **Built on the server** by `GET /api/reports/export` (`src/lib/api/report-data.ts` for the figures, `report-render.ts` for pdfkit / exceljs), in English or French. It needs an internet connection.
- Cashiers cannot download reports. Every download is written to the activity log.

### Packages, sign-out and legal pages

- **Packages** (`src/lib/plans.ts`, shown at `/pricing` and on the landing page): Starter K0, Business K199 (preselected), Pro K499. They are free during early access. The chosen package is saved with the shop, but **limits are not enforced yet**.
- **Sign out:** in the sidebar next to the theme toggle, and in Settings / More. If changes are still waiting to upload, it warns first.
- **Terms and Privacy** (`/terms`, `/privacy`, text in `src/content/legal.ts`) are drafted for Rwandan law (Law No. 058/2021 on personal data). Have a lawyer review them before launch. Sign-up requires agreeing to both.

## Project layout

```
prisma/schema.prisma          data model (money in ngwee, BigInt; quantities Decimal(14,3))
src/app/(auth)/               landing, login, register, onboarding, invite
src/app/app/                  the app: dashboard, products, sales, purchases, customers, reports, staff, settings
src/app/api/                  auth, sync push/pull, shops, staff, invitations
src/lib/sync/                 shared table schemas + server-side sync
src/lib/local/                Dexie database, outbox writes, sync engine, business operations
src/lib/{money,vat,debt,reports,permissions}.ts   pure logic (unit tested)
src/i18n/messages/            en.json, fr.json
tests/e2e/                    Playwright tests (including the two-device offline test)
```

## Tests

```bash
npm test                      # unit tests (money, VAT, debt aging, reports, permissions, schemas)
npm run build && npm run test:e2e   # end-to-end on a production build (port 3200)
node tests/api/roles-smoke.mjs http://localhost:3100   # 54 permission, account, supplier-credit and log checks against a running server
```

The end-to-end tests create real accounts named `*@e2e.test` in the database they point at, so run them against a development branch, not production.

## Landing page

The public page at `/` is built from `src/components/landing/*`, with its text under `site.*` in the message files.

- **Contact details and customer quotes** go in `src/lib/site.ts`. WhatsApp buttons, phone, email and the testimonials section only appear once filled in, so nothing fake is ever shown.
- **Screenshots** in `public/screenshots/` are real captures of the demo shop. After changing the app's look, run `npm run build && npx next start --port 3200`, then `npm run screenshots -- http://localhost:3200`.

## Deploying (Vercel + Neon)

1. Import the repo in Vercel. Region `fra1` is set in `vercel.json`, next to Neon's `eu-central-1`.
2. Set the environment variables `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` (your production URL).
3. Deploy. The build runs `prisma migrate deploy` first.

Use a fresh `BETTER_AUTH_SECRET` and a separate Neon branch for production.
