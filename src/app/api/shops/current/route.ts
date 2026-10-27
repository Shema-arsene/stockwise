import { z } from "zod";
import { handle, json, requireShop } from "@/lib/api/context";
import { actorFrom, logActivity } from "@/lib/api/activity";
import { prisma } from "@/lib/db/prisma";

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(32).nullable(),
  address: z.string().trim().max(200).nullable(),
  locale: z.enum(["en", "fr"]),
  vatEnabled: z.boolean(),
  vatRate: z.number().int().min(0).max(5000), // basis points, up to 50%
  tpin: z.string().trim().max(20).nullable(),
});

/** Update the current shop's settings (owner or admin). Devices pick the change up on their next sync. */
export const PATCH = handle(async (req: Request) => {
  const ctx = await requireShop(req, "settings.manage");
  const input = settingsSchema.parse(await req.json());
  const before = await prisma.shop.findUniqueOrThrow({ where: { id: ctx.shopId } });
  await prisma.shop.update({
    where: { id: ctx.shopId },
    data: { ...input, phone: input.phone || null, address: input.address || null, tpin: input.tpin || null },
  });
  const changed = Object.fromEntries(
    Object.entries(input).filter(([k, v]) => (before as Record<string, unknown>)[k] !== v && !(before[k as keyof typeof before] == null && !v)),
  );
  await logActivity(actorFrom(ctx.user, ctx.role), {
    action: "settings.update",
    businessId: ctx.businessId,
    shopId: ctx.shopId,
    entity: "shop",
    entityId: ctx.shopId,
    summary: changed,
  });
  return json({ ok: true });
});
