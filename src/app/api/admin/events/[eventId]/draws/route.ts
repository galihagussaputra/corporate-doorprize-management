import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ eventId: string }> };

const startSchema = z.object({
  prizeId: z.string().uuid(),
  winnerCount: z.number().int().min(1).max(1000),
  mode: z.enum(["wheel", "roller", "picker", "lottery"]),
  animationDurationMs: z.number().int().min(800).max(8000).default(2600),
  revealDelayMs: z.number().int().min(300).max(6000).default(1200),
  soundEnabled: z.boolean().default(true),
  confirm: z.literal(true),
  replacesSessionId: z.string().uuid().optional(),
});

export async function GET(_request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { eventId } = await params;
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("draw_sessions")
    .select("*, prize:prizes(name), winners:draw_winners(*)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return handleError(error);
  const rows = (data ?? []).map((s: Record<string, unknown>) => {
    const prize = s.prize as { name: string } | null;
    const winners = (s.winners ?? []) as Array<Record<string, unknown>>;
    return {
      ...s,
      prize_name: prize?.name ?? null,
      winners: [...winners].sort((a, b) => Number(a.reveal_order) - Number(b.reveal_order)),
    };
  });
  return ok(rows);
}

export async function POST(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { eventId } = await params;
    const body = startSchema.parse(await readJson(request));
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase.rpc("start_draw", {
      p_event_id: eventId,
      p_prize_id: body.prizeId,
      p_winner_count: body.winnerCount,
      p_mode: body.mode,
      p_presentation: {
        animation_duration_ms: body.animationDurationMs,
        reveal_delay_ms: body.revealDelayMs,
        sound_enabled: body.soundEnabled,
        paused: false,
        phase: "intro",
      },
      p_replaces_session_id: body.replacesSessionId ?? null,
    });
    if (error) return fail(error.message, 409);
    return ok(data, 201);
  } catch (error) {
    return handleError(error);
  }
}
