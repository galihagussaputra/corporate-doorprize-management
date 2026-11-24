import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ sessionId: string }> };

const schema = z.object({ paused: z.boolean() });

export async function POST(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { sessionId } = await params;
    const { paused } = schema.parse(await readJson(request));
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.rpc("set_draw_pause", {
      p_session_id: sessionId,
      p_paused: paused,
    });
    if (error) return fail(error.message, 409);
    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}
