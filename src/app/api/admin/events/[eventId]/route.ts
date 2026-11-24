import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ eventId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  eventDate: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "ready", "in_progress", "completed", "archived"]).optional(),
  settings: z.object({
    public_display_enabled: z.boolean().optional(),
    theme: z.enum(["dark", "light"]).optional(),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    logo_url: z.string().url().nullable().optional(),
    sound_enabled: z.boolean().optional(),
    animation_duration_ms: z.number().int().min(800).max(8000).optional(),
    reveal_delay_ms: z.number().int().min(300).max(6000).optional(),
  }).optional(),
});

export async function GET(_request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { eventId } = await params;
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (error) return handleError(error);
  if (!data) return fail("Event not found", 404);
  return ok(data);
}

export async function PATCH(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { eventId } = await params;
    const body = patchSchema.parse(await readJson(request));
    const supabase = await getSupabaseServer();

    const { data: existing } = await supabase
      .from("events")
      .select("settings")
      .eq("id", eventId)
      .maybeSingle();
    if (!existing) return fail("Event not found", 404);

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.eventDate !== undefined) patch.event_date = body.eventDate;
    if (body.status !== undefined) patch.status = body.status;
    if (body.settings) patch.settings = { ...existing.settings, ...body.settings };

    const { data, error } = await supabase
      .from("events")
      .update(patch)
      .eq("id", eventId)
      .select("*")
      .single();
    if (error) return handleError(error);

    await supabase.from("audit_logs").insert({
      event_id: eventId,
      administrator_id: admin.userId,
      action: "event.updated",
      entity_type: "event",
      entity_id: eventId,
      old_value: existing.settings,
      new_value: patch,
    });
    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}
