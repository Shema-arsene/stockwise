import { HttpError, handle, json, requirePlatform } from "@/lib/api/context";
import { periodFromQuery, shopTotals } from "@/lib/api/people";
import { peopleOfBusiness } from "@/lib/api/staff";
import { prisma } from "@/lib/db/prisma";

/** One shop in detail: branches with headline numbers and everyone working in it. */
export const GET = handle(async (req: Request) => {
  await requirePlatform(req, "platform.view");
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const business = await prisma.business.findUnique({
    where: { id },
    include: { shops: { select: { id: true, name: true, address: true, phone: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!business) throw new HttpError(404, "not_found");

  const { todayFrom, monthFrom } = periodFromQuery(url);
  const [totals, { owner, people }] = await Promise.all([shopTotals(business.shops.map((s) => s.id), todayFrom, monthFrom), peopleOfBusiness(id)]);

  return json({
    business: { id: business.id, name: business.name, plan: business.plan, status: business.status, createdAt: business.createdAt },
    owner,
    shops: business.shops.map((s) => ({ ...s, ...totals.find((t) => t.shopId === s.id)! })),
    people,
  });
});
