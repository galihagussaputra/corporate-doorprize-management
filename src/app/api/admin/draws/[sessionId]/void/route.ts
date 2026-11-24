import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ sessionId: string }> };

const schema = z.object({
  reason: z.string().trim().min(5),
  eligibilityPolicy: z.enum(["keep_ineligible", "restore_eligibility"]).default("keep_ineligible"),
  confirm: z.literal(true),
});

export async function POST(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { sessionId } = await params;
    const body = schema.parse(await readJson(request));
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.rpc("void_draw", {
      p_session_id: sessionId,
      p_reason: body.reason,
      p_eligibility_policy: body.eligibilityPolicy,
    });
    if (error) return fail(error.message, 409);
    return ok(data);
  } catch (error) {
    return handleError(error);
  }
}
