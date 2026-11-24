import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ prizeId: string }> };

const schema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().nullable().optional(),
  category: z.string().trim().max(100).optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  displayOrder: z.number().int().min(0).max(10000).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function PATCH(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { prizeId } = await params;
    const body = schema.parse(await readJson(request));
    const supabase = await getSupabaseServer();
    const { data: existing } = await supabase.from("prizes").select("*").eq("id", prizeId).maybeSingle();
    if (!existing) return fail("Prize not found", 404);

    if (body.quantity !== undefined) {
      const { count } = await supabase
        .from("draw_winners")
        .select("id", { count: "exact", head: true })
        .eq("prize_id", prizeId)
        .eq("status", "active");
      if (body.quantity < (count ?? 0)) {
        return fail(
          `Quantity cannot be lower than ${count} already awarded winner(s)`,
          409,
        );
      }
    }

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.imageUrl !== undefined) patch.image_url = body.imageUrl;
    if (body.category !== undefined) patch.category = body.category;
    if (body.quantity !== undefined) patch.quantity = body.quantity;
    if (body.displayOrder !== undefined) patch.display_order = body.displayOrder;
    if (body.status !== undefined) patch.status = body.status;

    const { data, error } = await supabase
      .from("prizes")
      .update(patch)
      .eq("id", prizeId)
      .select("*")
      .single();
    if (error) return handleError(error);
    await supabase.from("audit_logs").insert({
      event_id: existing.event_id,
      administrator_id: admin.userId,
      action: "prize.updated",
      entity_type: "prize",
      entity_id: prizeId,
      old_value: existing,
      new_value: patch,
    });
    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { prizeId } = await params;
  const supabase = await getSupabaseServer();
  const { data: existing } = await supabase.from("prizes").select("*").eq("id", prizeId).maybeSingle();
  if (!existing) return fail("Prize not found", 404);
  const { count } = await supabase
    .from("draw_winners")
    .select("id", { count: "exact", head: true })
    .eq("prize_id", prizeId);
  if ((count ?? 0) > 0) return fail("Prize has historical winner records and cannot be deleted", 409);
  const { error } = await supabase.from("prizes").delete().eq("id", prizeId);
  if (error) return handleError(error);
  await supabase.from("audit_logs").insert({
    event_id: existing.event_id,
    administrator_id: admin.userId,
    action: "prize.deleted",
    entity_type: "prize",
    entity_id: prizeId,
    old_value: existing,
  });
  return ok({ deleted: true });
}
