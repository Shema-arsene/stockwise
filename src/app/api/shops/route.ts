import { handle, json, requireUser } from "@/lib/api/context";
import { createShop, createShopSchema, listOwnedShops } from "@/lib/api/shops";

// Vocabulary: a "shop" in the UI is a Business in code; a "branch" in the UI is a Shop in code.
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req);
  const input = createShopSchema.parse(await req.json());
  return json(await createShop(user, input), { status: 201 });
});

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  return json(await listOwnedShops(user.id, new URL(req.url)));
});
