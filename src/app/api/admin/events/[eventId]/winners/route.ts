import { fail, handleError, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { eventId } = await params;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const supabase = await getSupabaseServer();
  let query = supabase
    .from("draw_winners")
    .select("*, prize:prizes(name), session:draw_sessions(status, completed_at)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (q) {
    const safe = q.replace(/[,()]/g, " ");
    query = query.or(`employee_id.ilike.%${safe}%,employee_name.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) return handleError(error);
  const rows = (data ?? []).map((w: Record<string, unknown>) => {
    const prize = w.prize as { name: string } | null;
    const session = w.session as { status: string; completed_at: string | null } | null;
    return { ...w, prize_name: prize?.name ?? null, session_status: session?.status ?? null };
  });
  return ok(rows);
}
