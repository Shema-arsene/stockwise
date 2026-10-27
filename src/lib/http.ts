import axios, { AxiosError } from "axios";

/** Shared Axios instance for all calls to our own API. */
export const http = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 30_000,
  headers: { "content-type": "application/json" },
});

let activeShopId: string | null = null;

/** Every shop-scoped request carries the shop the user is working in. */
export function setActiveShopHeader(shopId: string | null) {
  activeShopId = shopId;
}

http.interceptors.request.use((config) => {
  if (activeShopId) config.headers.set("x-shop-id", activeShopId);
  return config;
});

export interface ApiErrorBody {
  error: string;
  message?: string;
}

/** True when the request never reached the server (offline, DNS, timeout). */
export function isNetworkError(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

export function apiErrorCode(err: unknown): string | undefined {
  if (err instanceof AxiosError) return (err.response?.data as ApiErrorBody | undefined)?.error;
  return undefined;
}

export function apiStatus(err: unknown): number | undefined {
  return err instanceof AxiosError ? err.response?.status : undefined;
}
