// Read-only HTTP baseline. Use BENCHMARK_BASE_URL and optionally BENCHMARK_COOKIE /
// BENCHMARK_SHOP_ID for authenticated sync pulls. Never runs writes or creates data.
import { performance } from "node:perf_hooks";

const base = process.env.BENCHMARK_BASE_URL ?? "http://localhost:3000";
const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 30);
if (!Number.isInteger(iterations) || iterations < 5 || iterations > 1000) throw new Error("BENCHMARK_ITERATIONS must be 5..1000");
const headers = {
  ...(process.env.BENCHMARK_COOKIE ? { cookie: process.env.BENCHMARK_COOKIE } : {}),
  ...(process.env.BENCHMARK_SHOP_ID ? { "x-shop-id": process.env.BENCHMARK_SHOP_ID } : {}),
};
const paths = ["/", "/login"];
if (headers.cookie && headers["x-shop-id"]) paths.push("/api/sync/pull?since=0");

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
const results = [];
for (const path of paths) {
  const samples = [];
  const statuses = {};
  let bytes = 0;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const response = await fetch(new URL(path, base), { headers, cache: "no-store" });
    const body = await response.arrayBuffer();
    samples.push(performance.now() - start);
    statuses[response.status] = (statuses[response.status] ?? 0) + 1;
    bytes += body.byteLength;
  }
  samples.sort((a, b) => a - b);
  results.push({ path, requests: iterations, statuses, p50Ms: percentile(samples, .5), p95Ms: percentile(samples, .95), p99Ms: percentile(samples, .99), averageBytes: Math.round(bytes / iterations) });
}
console.log(JSON.stringify({ at: new Date().toISOString(), base: new URL(base).origin, iterations, results }, null, 2));
