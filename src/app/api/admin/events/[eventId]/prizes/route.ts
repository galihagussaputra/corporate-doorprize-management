import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { PrizeRecord } from "@/lib/types";

type Ctx = { params: Promise<{ eventId: string }> };

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(""),
  imageUrl: z.string().url().nullable().optional(),
  category: z.string().trim().max(100).default("General"),
  quantity: z.number().int().min(1).max(1000),
  displayOrder: z.number().int().min(0).max(10000).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function GET(_request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { eventId } = await params;
  const supabase = await getSupabaseServer();
  const [prizesRes, winnersRes] = await Promise.all([
    supabase.from("prizes").select("*").eq("event_id", eventId).order("display_order"),
    supabase.from("draw_winners").select("prize_id").eq("event_id", eventId).eq("status", "active"),
  ]);
  if (prizesRes.error) return handleError(prizesRes.error);
  if (winnersRes.error) return handleError(winnersRes.error);
  const counts = new Map<string, number>();
  (winnersRes.data ?? []).forEach((w: { prize_id: string }) =>
    counts.set(w.prize_id, (counts.get(w.prize_id) ?? 0) + 1),
  );
  const prizes: PrizeRecord[] = (prizesRes.data ?? []).map((p: Record<string, unknown>) => {
    const awarded = counts.get(p.id as string) ?? 0;
    return {
      ...(p as unknown as PrizeRecord),
      awarded,
      remaining: Math.max(0, (p.quantity as number) - awarded),
      completed: awarded >= (p.quantity as number),
    };
  });
  return ok(prizes);
}

export async function POST(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { eventId } = await params;
    const body = schema.parse(await readJson(request));
    const supabase = await getSupabaseServer();
    let displayOrder = body.displayOrder;
    if (displayOrder === undefined) {
      const { data: maxRow } = await supabase
        .from("prizes")
        .select("display_order")
        .eq("event_id", eventId)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      displayOrder = ((maxRow?.display_order as number) ?? 0) + 1;
    }
    const { data, error } = await supabase
      .from("prizes")
      .insert({
        event_id: eventId,
        name: body.name,
        description: body.description,
        image_url: body.imageUrl ?? null,
        category: body.category,
        quantity: body.quantity,
        display_order: displayOrder,
        status: body.status,
      })
      .select("*")
      .single();
    if (error) return handleError(error);
    await supabase.from("audit_logs").insert({
      event_id: eventId,
      administrator_id: admin.userId,
      action: "prize.created",
      entity_type: "prize",
      entity_id: data.id,
      new_value: { name: data.name, quantity: data.quantity },
    });
    return ok(data, 201);
  } catch (error) {
    return handleError(error);
  }
}
