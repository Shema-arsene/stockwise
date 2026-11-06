import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@neondatabase/serverless", () => ({ neon: () => async () => [{ ok: 1 }] }));

beforeEach(() => {
  vi.stubEnv("STOCKWISE_ORIGIN_SECRET", "test-only-origin-secret");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Neon Function authorization", () => {
  it("rejects requests before querying without the server secret", async () => {
    const { default: handler } = await import("./health");
    const response = await handler.fetch(new Request("https://example.test/"));
    expect(response.status).toBe(401);
  });

  it("checks the database for an authorized request", async () => {
    const { default: handler } = await import("./health");
    const response = await handler.fetch(new Request("https://example.test/", { headers: { "x-secret": "test-only-origin-secret" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
