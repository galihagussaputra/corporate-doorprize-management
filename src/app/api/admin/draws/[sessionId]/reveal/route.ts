import { fail, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ sessionId: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { sessionId } = await params;
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("reveal_next", { p_session_id: sessionId });
  if (error) return fail(error.message, 409);
  return ok(data);
}
