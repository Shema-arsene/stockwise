// The last known signed-in user, kept in localStorage so the app can open with no internet.
// The server cookie remains the real authority: any 401 while online signs the device out.

import { useSyncExternalStore } from "react";
import type { PlatformRole, Role } from "@/lib/permissions";

export type { Role };

export interface CachedShop {
  id: string;
  name: string;
  role: Role;
  businessId: string;
  businessName: string;
  suspended: boolean;
}

export interface CachedUser {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole | null;
  username: string | null;
  pinAccount: boolean;
}

export interface CachedSession {
  user: CachedUser;
  shops: CachedShop[];
  activeShopId: string | null;
  savedAt: string;
}

const KEY = "stockwise.session";
const listeners = new Set<() => void>();
let cache: CachedSession | null | undefined;

function read(): CachedSession | null {
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as CachedSession) : null;
  } catch {
    cache = null;
  }
  return cache;
}

function emit() {
  listeners.forEach((l) => l());
}

export function getSession(): CachedSession | null {
  return typeof window === "undefined" ? null : read();
}

export function saveSession(next: Omit<CachedSession, "savedAt" | "activeShopId"> & { activeShopId?: string | null }) {
  const prev = read();
  const preferred = next.activeShopId ?? prev?.activeShopId ?? null;
  const activeShopId = next.shops.some((s) => s.id === preferred) ? preferred : (next.shops[0]?.id ?? null);
  cache = { ...next, activeShopId, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage full or blocked: the in-memory copy still works for this visit
  }
  emit();
}

export function setActiveShop(shopId: string) {
  const s = read();
  if (s) saveSession({ ...s, activeShopId: shopId });
}

export function clearSession() {
  cache = null;
  try {
    localStorage.removeItem(KEY);
  } catch {}
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** undefined during server render / first hydration pass, then the cached session (or null). */
export function useCachedSession(): CachedSession | null | undefined {
  return useSyncExternalStore(subscribe, getSession, () => undefined);
}
