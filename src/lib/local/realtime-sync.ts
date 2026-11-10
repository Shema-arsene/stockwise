import type { MaterializedLiveQuerySubscription, RealtimeClient, SealedLiveQuery } from "@neon/realtime/client";
import { http } from "@/lib/http";
import type { SyncEngine } from "./sync";

type ShopCounter = { id: string; seq: string };
type LiveResponse = { url: string; sealed: SealedLiveQuery<ShopCounter> };

/** Realtime only wakes the existing push/pull engine. Polling stays authoritative. */
export function watchRealtimeSync(engine: SyncEngine, shopId: string): () => void {
  if (process.env.NEXT_PUBLIC_NEON_REALTIME_SYNC !== "1") return () => {};

  let stopped = false;
  let connecting = false;
  let lastSeen = 0;
  let client: RealtimeClient | null = null;
  let subscription: MaterializedLiveQuerySubscription<ShopCounter> | null = null;
  const sealed = async () => (await http.get<LiveResponse>("/sync/live", { headers: { "x-shop-id": shopId } })).data;
  const close = () => {
    subscription?.unsubscribe();
    client?.close();
    subscription = null;
    client = null;
  };

  const connect = async () => {
    if (stopped || connecting || client || !navigator.onLine) return;
    connecting = true;
    try {
      const data = await sealed();
      if (stopped) return;
      const { createRealtimeClient } = await import("@neon/realtime/client");
      if (stopped) return;
      const nextClient = createRealtimeClient({ url: data.url });
      try {
        const nextSubscription = nextClient.subscribe(data.sealed);
        client = nextClient;
        subscription = nextSubscription;
        nextSubscription.onChange((snapshot) => {
          if (snapshot.status === "error") {
            close();
            return;
          }
          if (snapshot.status !== "live") return;
          const seq = Number(snapshot.data?.[0]?.seq ?? 0);
          if (seq > lastSeen) {
            lastSeen = seq;
            void engine.syncNow();
          } else if (!snapshot.data?.length && lastSeen > 0) {
            lastSeen = 0;
            void engine.syncNow(); // access may have been revoked
          }
        });
      } catch {
        nextClient.close();
        client = null;
        subscription = null;
      }
    } catch {
      // Offline or service unavailable: the normal 30-second sync remains active.
    } finally {
      connecting = false;
    }
  };

  const tick = async () => {
    if (stopped || !navigator.onLine) return;
    if (!subscription) return void connect();
    try {
      const data = await sealed();
      if (!stopped) await subscription.renew(data.sealed);
    } catch {
      close();
    }
  };

  const onOnline = () => void connect();
  window.addEventListener("online", onOnline);
  const timer = setInterval(() => void tick(), 30_000);
  void connect();
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("online", onOnline);
    close();
  };
}
