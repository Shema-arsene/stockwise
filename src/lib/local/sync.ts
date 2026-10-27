// Background sync between the on-device database and the server.
//
//   push: send queued local changes (outbox) in order, in batches. The server is idempotent,
//         so a batch that times out can safely be sent again.
//   pull: fetch everything with a change number greater than our cursor and store it,
//         except rows that still have unsent local edits (those win until pushed).
//
// Runs on start, when the device comes back online, when the tab becomes visible,
// shortly after every local write, and every 30 seconds.

import { http, isNetworkError, apiStatus, apiErrorCode } from "@/lib/http";
import type { PullResult, PushResult, TableName } from "@/lib/sync/tables";
import { newId } from "@/lib/ids";
import { META, getMeta, setMeta, type ShopDB } from "./db";
import { onLocalWrite, rebuildAllDerived, refreshDerived, type Change } from "./write";

// "suspended": the business was suspended by StockWise. "no-access": this person was removed or disabled.
export type SyncStatus = "idle" | "syncing" | "offline" | "error" | "signed-out" | "suspended" | "no-access";

export interface SyncState {
  status: SyncStatus;
  pending: number; // outbox entries not yet pushed
  lastSyncedAt: string | null;
  lastError: string | null;
  rejected: PushResult["rejected"];
  initialised: boolean; // finished at least one full pull on this device
}

const PUSH_BATCH = 200;
const INTERVAL_MS = 30_000;
const WRITE_DEBOUNCE_MS = 1_000;

export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private cleanup: (() => void)[] = [];
  private listeners = new Set<(s: SyncState) => void>();
  // Starts as "syncing" so the UI never claims "all saved" before the first sync has run.
  state: SyncState = {
    status: "syncing",
    pending: 0,
    lastSyncedAt: null,
    lastError: null,
    rejected: [],
    initialised: false,
  };

  constructor(private db: ShopDB) {}

  subscribe(fn: (s: SyncState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  async start() {
    const [lastSyncedAt, cursor, pending] = await Promise.all([
      getMeta<string>(this.db, META.lastSyncedAt),
      getMeta<number>(this.db, META.cursor),
      this.db.outbox.count(),
    ]);
    this.set({ lastSyncedAt: lastSyncedAt ?? null, pending, initialised: cursor !== undefined });

    const kick = () => void this.syncNow();
    const onVisible = () => document.visibilityState === "visible" && kick();
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisible);
    this.cleanup.push(
      () => window.removeEventListener("online", kick),
      () => document.removeEventListener("visibilitychange", onVisible),
      onLocalWrite(() => {
        void this.db.outbox.count().then((n) => this.set({ pending: n }));
        if (this.debounce) clearTimeout(this.debounce);
        this.debounce = setTimeout(kick, WRITE_DEBOUNCE_MS);
      }),
    );
    this.timer = setInterval(kick, INTERVAL_MS);
    kick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
    this.cleanup.forEach((c) => c());
    this.cleanup = [];
    this.listeners.clear();
  }

  /** Runs a sync; if one is in progress, schedules exactly one more afterwards. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.syncNow();
      }
    });
    return this.running;
  }

  private async run() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.set({ status: "offline" });
      return;
    }
    this.set({ status: "syncing", lastError: null });
    try {
      await this.push();
      await this.pull();
      const now = new Date().toISOString();
      await setMeta(this.db, META.lastSyncedAt, now);
      this.set({ status: "idle", lastSyncedAt: now, pending: await this.db.outbox.count() });
    } catch (err) {
      if (isNetworkError(err)) this.set({ status: "offline" });
      else if (apiStatus(err) === 401) this.set({ status: "signed-out" });
      else if (apiErrorCode(err) === "business_suspended") this.set({ status: "suspended" });
      else if (apiErrorCode(err) === "not_a_member") this.set({ status: "no-access" });
      // Too many requests: not an error the person can fix. Keep changes queued and try again shortly.
      else if (apiStatus(err) === 429) {
        this.set({ status: "idle", pending: await this.db.outbox.count() });
        const wait = Number((err as { response?: { headers?: Record<string, string> } }).response?.headers?.["retry-after"]) || 30;
        setTimeout(() => void this.syncNow(), Math.min(wait, 120) * 1000);
      }
      else this.set({ status: "error", lastError: err instanceof Error ? err.message : String(err) });
    }
  }

  private async deviceId(): Promise<string> {
    let id = await getMeta<string>(this.db, META.deviceId);
    if (!id) {
      id = newId();
      await setMeta(this.db, META.deviceId, id);
    }
    return id;
  }

  /** Upload queued changes only (used when access to this shop has just ended). */
  async pushPending() {
    await this.push();
  }

  private async push() {
    const deviceId = await this.deviceId();
    for (;;) {
      const batch = await this.db.outbox.orderBy("seq").limit(PUSH_BATCH).toArray();
      if (!batch.length) return;

      const { data } = await http.post<PushResult>("/sync/push", {
        deviceId,
        mutations: batch.map((e) => ({ table: e.table, row: e.row })),
      });

      await this.db.transaction("rw", this.db.outbox, async () => {
        await this.db.outbox.bulkDelete(batch.map((e) => e.seq!));
      });
      if (data.rejected.length) await this.dropRejected(data.rejected);
      this.set({ pending: await this.db.outbox.count() });
    }
  }

  /** The server refused these rows (e.g. permission changed). Remove them so the device matches the server. */
  private async dropRejected(rejected: PushResult["rejected"]) {
    const byTable = new Map<TableName, string[]>();
    for (const r of rejected) byTable.set(r.table, [...(byTable.get(r.table) ?? []), r.id]);
    const changes: Change[] = [];
    await this.db.transaction("rw", this.db.tables, async () => {
      for (const [table, ids] of byTable) {
        const rows = await this.db.table(table).bulkGet(ids);
        rows.forEach((row) => row && changes.push({ table, row } as Change));
        await this.db.table(table).bulkDelete(ids);
      }
      await refreshDerived(this.db, changes);
    });
    this.set({ rejected: [...this.state.rejected, ...rejected].slice(-50) });
    // Re-download the server's copy of anything we had edited.
    await setMeta(this.db, META.cursor, 0);
  }

  private async pull() {
    let cursor = (await getMeta<number>(this.db, META.cursor)) ?? 0;
    const firstDownload = cursor === 0;
    for (;;) {
      const { data } = await http.get<PullResult>("/sync/pull", { params: { since: cursor } });
      await this.applyPull(data, !firstDownload);
      cursor = data.cursor;
      if (!data.hasMore) break;
    }
    if (firstDownload) await rebuildAllDerived(this.db);
    this.set({ initialised: true });
  }

  private async applyPull(data: PullResult, updateDerived: boolean) {
    await this.db.transaction("rw", this.db.tables, async () => {
      const pendingIds = new Set((await this.db.outbox.toArray()).map((e) => e.rowId));
      const changes: Change[] = [];
      for (const [table, rows] of Object.entries(data.changes) as [TableName, Change["row"][]][]) {
        const fresh = rows.filter((r) => !pendingIds.has(r.id));
        if (!fresh.length) continue;
        await this.db.table(table).bulkPut(fresh);
        fresh.forEach((row) => changes.push({ table, row } as Change));
      }
      if (updateDerived) await refreshDerived(this.db, changes);
      await setMeta(this.db, META.shop, data.shop);
      await setMeta(this.db, META.members, data.members);
      await setMeta(this.db, META.role, data.role);
      await setMeta(this.db, META.cursor, data.cursor);
    });
  }
}
