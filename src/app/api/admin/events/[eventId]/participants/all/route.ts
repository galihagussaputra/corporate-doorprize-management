import { fail, handleError, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ eventId: string }> };

/** Lightweight identity list used only for client-side import diff preview. */
export async function GET(_request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { eventId } = await params;
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("participants")
    .select("employee_id, employee_name, status")
    .eq("event_id", eventId)
    .order("employee_id");
  if (error) return handleError(error);
  return ok(data);
}
