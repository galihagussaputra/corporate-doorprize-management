import { fail, handleError, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { sessionId } = await params;
  const supabase = await getSupabaseServer();
  const [{ data: session, error }, { data: winners }] = await Promise.all([
    supabase.from("draw_sessions").select("*, prize:prizes(name)").eq("id", sessionId).maybeSingle(),
    supabase.from("draw_winners").select("*").eq("session_id", sessionId).order("reveal_order"),
  ]);
  if (error) return handleError(error);
  if (!session) return fail("Draw session not found", 404);
  return ok({ ...session, winners: winners ?? [] });
}
