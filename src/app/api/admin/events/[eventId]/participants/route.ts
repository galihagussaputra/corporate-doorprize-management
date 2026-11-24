import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ eventId: string }> };

const createSchema = z.object({
  employeeId: z.string().trim().min(1).max(100),
  employeeName: z.string().trim().min(1).max(200),
  overrideReason: z.string().trim().min(5).optional(),
});

export async function GET(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { eventId } = await params;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const sort = url.searchParams.get("sort") ?? "employee_id";
  const dir = url.searchParams.get("dir") === "desc" ? false : true;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get("pageSize") ?? 50) || 50));
  const allowed = ["employee_id", "employee_name", "status", "created_at"];
  const column = allowed.includes(sort) ? sort : "employee_id";

  const supabase = await getSupabaseServer();
  let query = supabase
    .from("participants")
    .select("*", { count: "exact" })
    .eq("event_id", eventId);
  if (q) {
    const safe = q.replace(/[,()]/g, " ");
    query = query.or(`employee_id.ilike.%${safe}%,employee_name.ilike.%${safe}%`);
  }
  query = query.order(column, { ascending: dir }).range((page - 1) * pageSize, page * pageSize - 1);
  const { data, error, count } = await query;
  if (error) return handleError(error);
  return ok({ rows: data, total: count ?? 0, page, pageSize });
}

export async function POST(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { eventId } = await params;
    const body = createSchema.parse(await readJson(request));
    const supabase = await getSupabaseServer();

    const { count: drawCount } = await supabase
      .from("draw_sessions")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);
    if ((drawCount ?? 0) > 0 && !body.overrideReason) {
      return fail(
        "Roster is locked because draw history exists. Provide an override reason to make this exception.",
        409,
      );
    }

    const { data, error } = await supabase
      .from("participants")
      .insert({
        event_id: eventId,
        employee_id: body.employeeId,
        employee_name: body.employeeName,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return fail("Employee ID already exists in this event", 409);
      return handleError(error);
    }

    const { error: importError } = await supabase.from("roster_imports").insert({
      event_id: eventId,
      import_method: "manual",
      import_mode: "manual",
      total_records: 1,
      valid_records: 1,
      added_records: 1,
      administrator_id: admin.userId,
      override_reason: body.overrideReason ?? null,
      filename: null,
    });
    if (importError) return handleError(importError);

    await supabase.from("audit_logs").insert({
      event_id: eventId,
      administrator_id: admin.userId,
      action: "participant.created",
      entity_type: "participant",
      entity_id: data.id,
      new_value: { employeeId: data.employee_id, employeeName: data.employee_name },
      reason: body.overrideReason ?? null,
    });
    return ok(data, 201);
  } catch (error) {
    return handleError(error);
  }
}
