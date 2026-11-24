import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ eventId: string }> };

const schema = z.object({
  mode: z.enum(["replace", "sync"]),
  method: z.enum(["excel", "paste"]),
  rows: z.array(z.object({
    employeeId: z.string().min(1).max(100),
    employeeName: z.string().min(1).max(200),
  })).min(1).max(5000),
  filename: z.string().max(300).nullable().optional(),
  overrideReason: z.string().trim().min(5).optional(),
  totalRecords: z.number().int().nonnegative().optional(),
  invalidRecords: z.number().int().nonnegative().default(0),
});

export async function POST(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { eventId } = await params;
    const body = schema.parse(await readJson(request));
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.rpc("commit_roster", {
      p_event_id: eventId,
      p_mode: body.mode,
      p_rows: body.rows,
      p_filename: body.filename ?? null,
      p_method: body.method,
      p_override_reason: body.overrideReason ?? null,
      p_total_records: body.totalRecords ?? body.rows.length,
      p_invalid_records: body.invalidRecords,
    });
    if (error) {
      if (error.message.includes("locked")) return fail(error.message, 409);
      return handleError(error);
    }
    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}
