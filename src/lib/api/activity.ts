import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { newId } from "@/lib/ids";
import type { Actor } from "./context";

type Db = Pick<typeof prisma, "activityLog"> | Prisma.TransactionClient;

export interface ActivityEntry {
  action: string; // "sale.create", "staff.role", "auth.sign_in_failed", ...
  businessId?: string | null;
  shopId?: string | null;
  entity?: string;
  entityId?: string;
  summary?: Prisma.InputJsonValue;
  clientAt?: Date;
  deviceId?: string;
}

export interface ActivityActor {
  id: string | null;
  name: string | null;
  role: string | null;
  ip?: string | null;
}

export function actorFrom(user: Actor, role: string | null): ActivityActor {
  return { id: user.id, name: user.name, role: role ?? user.platformRole, ip: user.ip };
}

function row(actor: ActivityActor, e: ActivityEntry): Prisma.ActivityLogCreateManyInput {
  return {
    id: newId(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    ip: actor.ip ?? null,
    businessId: e.businessId ?? null,
    shopId: e.shopId ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    summary: e.summary,
    clientAt: e.clientAt,
    deviceId: e.deviceId,
  };
}

/**
 * Appends to the activity log. Entries can never be changed or removed afterwards
 * (a database trigger rejects UPDATE/DELETE on activity_log).
 */
export async function logActivity(actor: ActivityActor, entry: ActivityEntry, db: Db = prisma) {
  await db.activityLog.create({ data: row(actor, entry) });
}

export async function logActivities(actor: ActivityActor, entries: ActivityEntry[], db: Db = prisma) {
  if (entries.length) await db.activityLog.createMany({ data: entries.map((e) => row(actor, e)) });
}
