import { authClient } from "@/lib/auth-client";
import { deleteAllShopDBs } from "@/lib/local/db";
import { clearSession } from "@/lib/local/session";
import { setActiveShopHeader } from "@/lib/http";

/** Signs out and wipes all shop data from this device. */
export async function signOutEverywhereOnDevice() {
  try {
    await authClient.signOut();
  } catch {
    // offline: the server session simply expires later
  }
  setActiveShopHeader(null);
  clearSession();
  await deleteAllShopDBs();
}
