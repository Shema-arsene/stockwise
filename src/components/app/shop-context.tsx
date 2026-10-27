"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { http, apiStatus, setActiveShopHeader } from "@/lib/http";
import { can as canRole, type Permission, type Role } from "@/lib/permissions";
import { META, openShopDB, type Member, type ShopDB, type ShopSettings } from "@/lib/local/db";
import { SyncEngine, type SyncState } from "@/lib/local/sync";
import { getSession, saveSession, useCachedSession, type CachedSession, clearSession } from "@/lib/local/session";

interface ShopContextValue {
  db: ShopDB;
  shopId: string;
  user: CachedSession["user"];
  session: CachedSession;
  role: Role;
  shop: ShopSettings;
  members: Member[];
  sync: SyncState;
  syncNow: () => Promise<void>;
  can: (p: Permission) => boolean;
  memberName: (userId: string) => string;
}

const Ctx = createContext<ShopContextValue | null>(null);

export function useShop() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShop must be used inside <ShopProvider>");
  return ctx;
}

interface MeResponse {
  user: CachedSession["user"];
  shops: CachedSession["shops"];
}

/**
 * Uploads anything still queued for a shop the user just lost access to. Removed or disabled
 * staff may still sync work they recorded offline before their access ended.
 */
async function flushLostShop(shopId: string) {
  const db = openShopDB(shopId);
  if (!(await db.outbox.count())) return;
  setActiveShopHeader(shopId);
  try {
    await new SyncEngine(db).pushPending();
  } catch {
    // offline or refused: the queue stays on the device
  }
}

/** Refreshes the cached session from the server. Returns null if the user is signed out. */
export async function refreshSession(): Promise<MeResponse | null> {
  try {
    const { data } = await http.get<MeResponse>("/me");
    const active = getSession()?.activeShopId;
    if (active && !data.shops.some((s) => s.id === active)) await flushLostShop(active);
    saveSession(data);
    return data;
  } catch (err) {
    if (apiStatus(err) === 401) return null;
    throw err;
  }
}

export function ShopProvider({ children, splash }: { children: React.ReactNode; splash: React.ReactNode }) {
  const session = useCachedSession();
  const router = useRouter();

  // Re-validate the session with the server whenever we're online.
  useEffect(() => {
    if (session === undefined) return;
    let cancelled = false;
    refreshSession()
      .then((me) => {
        if (cancelled) return;
        if (me === null) {
          clearSession();
          router.replace("/login?next=" + encodeURIComponent(location.pathname + location.search));
        } else if (me.shops.length === 0) {
          router.replace(me.user.platformRole ? "/platform" : "/onboarding");
        }
      })
      .catch(() => {
        // Offline: keep using the cached session. With no cached session we can't continue.
        if (!cancelled && session === null) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
    // Only on first load: later changes to the session come from our own saveSession calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session === undefined]);

  const shopId = session?.activeShopId ?? null;
  const shopEntry = session?.shops.find((s) => s.id === shopId);

  useEffect(() => {
    if (session && session.shops.length === 0) router.replace(session.user.platformRole ? "/platform" : "/onboarding");
  }, [session, router]);

  if (!session || !shopId || !shopEntry) return <>{splash}</>;
  return (
    <ShopRuntime key={shopId} session={session} shopId={shopId} fallbackName={shopEntry.name} fallbackRole={shopEntry.role}>
      {children}
    </ShopRuntime>
  );
}

function ShopRuntime({
  session,
  shopId,
  fallbackName,
  fallbackRole,
  children,
}: {
  session: CachedSession;
  shopId: string;
  fallbackName: string;
  fallbackRole: Role;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const db = useMemo(() => openShopDB(shopId), [shopId]);
  const engine = useMemo(() => new SyncEngine(db), [db]);
  const [sync, setSync] = useState<SyncState>(engine.state);

  useEffect(() => {
    setActiveShopHeader(shopId);
    const unsubscribe = engine.subscribe(setSync);
    void engine.start();
    return () => {
      unsubscribe();
      engine.stop();
    };
  }, [engine, shopId]);

  useEffect(() => {
    if (sync.status === "signed-out") {
      clearSession();
      router.replace("/login?next=" + encodeURIComponent(location.pathname));
    }
  }, [sync.status, router]);

  const meta = useLiveQuery(
    async () => {
      const rows = await db.meta.bulkGet([META.shop, META.members, META.role]);
      return {
        shop: rows[0]?.value as ShopSettings | undefined,
        members: rows[1]?.value as Member[] | undefined,
        role: rows[2]?.value as Role | undefined,
      };
    },
    [db],
  );

  const value = useMemo<ShopContextValue>(() => {
    const role = meta?.role ?? fallbackRole;
    const shop: ShopSettings = meta?.shop ?? {
      id: shopId,
      businessId: session.shops.find((s) => s.id === shopId)?.businessId ?? "",
      businessName: session.shops.find((s) => s.id === shopId)?.businessName ?? "",
      name: fallbackName,
      phone: null,
      address: null,
      currency: "ZMW",
      locale: "en",
      vatEnabled: false,
      vatRate: 1600,
      tpin: null,
      plan: "FREE",
      trialEndsAt: null,
    };
    const members = meta?.members ?? [];
    return {
      db,
      shopId,
      user: session.user,
      session,
      role,
      shop,
      members,
      sync,
      syncNow: () => engine.syncNow(),
      can: (p) => canRole(role, p),
      memberName: (userId) =>
        userId === session.user.id ? session.user.name : (members.find((m) => m.userId === userId)?.name ?? "—"),
    };
  }, [db, shopId, session, meta, sync, engine, fallbackName, fallbackRole]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
