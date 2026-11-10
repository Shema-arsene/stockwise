import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { neon } from "@neondatabase/serverless";
import { createRealtime, rawSql } from "@neon/realtime/server";
import type { MaterializedLiveQuerySubscription } from "@neon/realtime/client";

/** Read-only Postgres probe. The application itself continues to use Prisma. */
export async function probePostgres(): Promise<void> {
  const url = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Database URL is not configured");
  const rows = await neon(url)`SELECT 1 AS ok`;
  if (rows[0]?.ok !== 1) throw new Error("Database probe failed");
}

/** Private object round trip. The temporary object is removed even after a failed read. */
export async function probeStorage(): Promise<void> {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const region = process.env.AWS_REGION;
  if (!endpoint || !region) throw new Error("Object Storage is not configured");
  const bucket = process.env.S3_BUCKET ?? "uploads";
  const key = `diagnostics/${randomUUID()}.txt`;
  const client = new S3Client({ endpoint, region, forcePathStyle: true });
  let uploaded = false;
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "stockwise-probe", ContentType: "text/plain" }));
    uploaded = true;
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (await response.Body?.transformToString() !== "stockwise-probe") throw new Error("Object Storage round trip failed");
  } finally {
    try {
      if (uploaded) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } finally {
      client.destroy();
    }
  }
}

/** Exercise the public Function URL without exposing its origin secret to the browser. */
export async function probeFunction(): Promise<void> {
  const url = process.env.STOCKWISE_FUNCTION_URL ?? process.env.NEON_FUNCTION_STOCKWISE_BASE_URL;
  const secret = process.env.STOCKWISE_ORIGIN_SECRET;
  if (!url || !secret) throw new Error("Neon Function is not configured");
  const unauthorized = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(12_000) });
  if (unauthorized.status !== 401) throw new Error("Neon Function did not reject an unsigned request");
  const response = await fetch(url, {
    headers: { "x-secret": secret }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok || (await response.json() as { ok?: boolean }).ok !== true) throw new Error("Neon Function probe failed");
}

/** A live initial snapshot proves the Realtime WebSocket and database query work. */
export async function probeRealtime(): Promise<void> {
  const url = process.env.NEON_REALTIME_URL;
  const secret = process.env.NEON_REALTIME_SECRET;
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url || !secret || !databaseUrl) throw new Error("Neon Realtime is not configured");
  const db = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  const realtime = createRealtime({ url, secret, db });
  let subscription: MaterializedLiveQuerySubscription<{ id: string; seq: string }> | undefined;
  try {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      subscription = await Promise.race([
        realtime.subscribe(rawSql<{ id: string; seq: string }>("SELECT id, seq FROM shop ORDER BY id LIMIT 1"), { materialize: true }),
        new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Realtime subscription timed out")), 12_000); }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    const current = subscription;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Realtime initial snapshot timed out")), 12_000);
      const check = (snapshot: ReturnType<typeof current.getSnapshot>) => {
        if (snapshot.status === "live" && snapshot.data !== undefined) {
          clearTimeout(timer);
          resolve();
        } else if (snapshot.status === "error") {
          clearTimeout(timer);
          reject(new Error("Realtime subscription failed"));
        }
      };
      current.onChange(check);
      check(current.getSnapshot());
    });
  } finally {
    subscription?.unsubscribe();
    realtime.close();
  }
}

export async function probeNeonServices() {
  const checks = [probePostgres, probeStorage, probeFunction, probeRealtime] as const;
  const names = ["postgres", "objectStorage", "functions", "realtime"] as const;
  const results = await Promise.allSettled(checks.map((check) => check()));
  return Object.fromEntries(names.map((name, index) => [name, results[index].status === "fulfilled"])) as Record<(typeof names)[number], boolean>;
}
