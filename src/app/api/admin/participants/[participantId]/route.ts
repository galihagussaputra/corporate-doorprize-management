import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ participantId: string }> };

const patchSchema = z.object({
  employeeName: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  overrideReason: z.string().trim().min(5).optional(),
});

async function assertNotLocked(supabase: Awaited<ReturnType<typeof getSupabaseServer>>, eventId: string, reason?: string) {
  const { count } = await supabase
    .from("draw_sessions")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if ((count ?? 0) > 0 && !reason) {
    return fail("Roster is locked because draw history exists. Provide an override reason.", 409);
  }
  return null;
}

export async function PATCH(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { participantId } = await params;
    const body = patchSchema.parse(await readJson(request));
    const supabase = await getSupabaseServer();
    const { data: existing } = await supabase
      .from("participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();
    if (!existing) return fail("Participant not found", 404);

    const locked = await assertNotLocked(supabase, existing.event_id, body.overrideReason);
    if (locked) return locked;

    const patch: Record<string, unknown> = {};
    if (body.employeeName !== undefined) patch.employee_name = body.employeeName;
    if (body.status !== undefined) patch.status = body.status;
    const { data, error } = await supabase
      .from("participants")
      .update(patch)
      .eq("id", participantId)
      .select("*")
      .single();
    if (error) return handleError(error);

    await supabase.from("audit_logs").insert({
      event_id: existing.event_id,
      administrator_id: admin.userId,
      action: "participant.updated",
      entity_type: "participant",
      entity_id: participantId,
      old_value: { employeeName: existing.employee_name, status: existing.status },
      new_value: patch,
      reason: body.overrideReason ?? null,
    });
    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { participantId } = await params;
    const url = new URL(request.url);
    const reason = url.searchParams.get("reason")?.trim();
    const supabase = await getSupabaseServer();
    const { data: existing } = await supabase
      .from("participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();
    if (!existing) return fail("Participant not found", 404);

    const locked = await assertNotLocked(supabase, existing.event_id, reason);
    if (locked) return locked;

    const { data: referenced } = await supabase
      .from("draw_winners")
      .select("id")
      .eq("participant_id", participantId)
      .limit(1);
    if (referenced && referenced.length > 0) {
      return fail("This participant is referenced by a historical winner record and cannot be deleted", 409);
    }

    const { error } = await supabase.from("participants").delete().eq("id", participantId);
    if (error) return handleError(error);
    await supabase.from("audit_logs").insert({
      event_id: existing.event_id,
      administrator_id: admin.userId,
      action: "participant.deleted",
      entity_type: "participant",
      entity_id: participantId,
      old_value: { employeeId: existing.employee_id, employeeName: existing.employee_name },
      reason: reason ?? null,
    });
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
