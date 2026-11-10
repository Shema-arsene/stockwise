// Compare two JSON captures from scripts/benchmark.mjs with identical fixtures.
import { readFile } from "node:fs/promises";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error("Usage: npm run benchmark:compare -- before.json after.json");
const before = JSON.parse(await readFile(beforePath, "utf8"));
const after = JSON.parse(await readFile(afterPath, "utf8"));
if (before.iterations !== after.iterations) throw new Error("Iteration counts differ; rerun with matching workload");
const oldRoutes = new Map(before.results.map((r) => [r.path, r]));
const newRoutes = new Map(after.results.map((r) => [r.path, r]));
if (oldRoutes.size !== newRoutes.size || [...oldRoutes.keys()].some((p) => !newRoutes.has(p))) throw new Error("Measured routes differ");

let failed = false;
for (const [path, old] of oldRoutes) {
  const current = newRoutes.get(path);
  const oldErrors = Object.entries(old.statuses).reduce((n, [code, count]) => n + (Number(code) >= 500 ? count : 0), 0) / old.requests;
  const newErrors = Object.entries(current.statuses).reduce((n, [code, count]) => n + (Number(code) >= 500 ? count : 0), 0) / current.requests;
  const p95Change = old.p95Ms > 0 ? (current.p95Ms / old.p95Ms - 1) * 100 : 0;
  const errorChangePoints = (newErrors - oldErrors) * 100;
  const syncRegression = path.startsWith("/api/sync/") && p95Change > 10;
  const errorRegression = errorChangePoints > 0.1;
  failed ||= syncRegression || errorRegression;
  console.log(`${path}: p95 ${old.p95Ms.toFixed(1)} → ${current.p95Ms.toFixed(1)} ms (${p95Change.toFixed(1)}%); 5xx ${
    (oldErrors * 100).toFixed(2)}% → ${(newErrors * 100).toFixed(2)}%${syncRegression || errorRegression ? " REGRESSION" : ""}`);
}
if (failed) process.exitCode = 1;
