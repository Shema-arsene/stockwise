import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { metric, withRequest } from "./telemetry";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("telemetry", () => {
  it("correlates events without logging query secrets or request bodies", async () => {
    vi.stubEnv("TELEMETRY_SUCCESS_SAMPLE_RATE", "1");
    const output = vi.spyOn(console, "info").mockImplementation(() => {});
    const req = new Request("https://example.test/api/sync/push?token=hidden", {
      method: "POST", body: JSON.stringify({ customer: "Private Person" }),
    });
    await withRequest(req, async () => metric("sync.push_rows", { received: 1, applied: 1, rejected: 0 }));
    const logged = output.mock.calls.map(([line]) => String(line)).join("\n");
    expect(logged).toContain("requestId");
    expect(logged).toContain("/api/sync/push");
    expect(logged).not.toContain("hidden");
    expect(logged).not.toContain("Private Person");
  });

  it("keeps errors and never fails a request when logging fails", async () => {
    vi.stubEnv("TELEMETRY_SUCCESS_SAMPLE_RATE", "0");
    const output = vi.spyOn(console, "info").mockImplementation(() => { throw new Error("exporter unavailable"); });
    await expect(withRequest(new Request("https://example.test/api/shops"), async () => {
      metric("api.request", { status: 200, durationMs: 1 });
      metric("api.request", { status: 500, durationMs: 1 });
    })).resolves.toBeUndefined();
    expect(output).toHaveBeenCalledTimes(1);
  });
});
