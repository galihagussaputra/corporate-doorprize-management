import { fail, handleError, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { AuditRecord, DashboardSummary, DrawSessionRecord, PrizeRecord } from "@/lib/types";

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { eventId } = await params;
  const supabase = await getSupabaseServer();

  try {
    const [participantsRes, winnersRes, exclusionsRes, prizesRes, sessionsRes, auditRes] =
      await Promise.all([
        supabase.from("participants").select("employee_id, status").eq("event_id", eventId),
        supabase.from("draw_winners").select("employee_id, prize_id, status").eq("event_id", eventId),
        supabase.from("eligibility_exclusions").select("employee_id").eq("event_id", eventId),
        supabase.from("prizes").select("*").eq("event_id", eventId).order("display_order"),
        supabase
          .from("draw_sessions")
          .select("*, prize:prizes(name)")
          .eq("event_id", eventId)
          .order("created_at", { ascending: false }),
        supabase
          .from("audit_logs")
          .select("*")
          .eq("event_id", eventId)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

    for (const res of [participantsRes, winnersRes, exclusionsRes, prizesRes, sessionsRes, auditRes]) {
      if (res.error) throw res.error;
    }

    const participants = (participantsRes.data ?? []) as Array<{ employee_id: string; status: string }>;
    const winners = (winnersRes.data ?? []) as Array<{
      employee_id: string; prize_id: string; status: string;
    }>;
    const exclusions = (exclusionsRes.data ?? []) as Array<{ employee_id: string }>;

    const activeIds = new Set(participants.filter((p) => p.status === "active").map((p) => p.employee_id));
    const wonIds = new Set(winners.filter((w) => w.status === "active").map((w) => w.employee_id));
    const excludedIds = new Set(exclusions.map((e) => e.employee_id));
    let eligible = 0;
    for (const id of activeIds) {
      if (!wonIds.has(id) && !excludedIds.has(id)) eligible++;
    }

    const awardedByPrize = new Map<string, number>();
    for (const w of winners) {
      if (w.status === "active") awardedByPrize.set(w.prize_id, (awardedByPrize.get(w.prize_id) ?? 0) + 1);
    }
    const prizes: PrizeRecord[] = (prizesRes.data ?? []).map((p: Record<string, unknown>) => {
      const awarded = awardedByPrize.get(p.id as string) ?? 0;
      return {
        ...(p as unknown as PrizeRecord),
        awarded,
        remaining: Math.max(0, (p.quantity as number) - awarded),
        completed: awarded >= (p.quantity as number),
      };
    });

    const sessions = (sessionsRes.data ?? []) as unknown as DrawSessionRecord[];
    sessions.forEach((s) => {
      const prize = (s as DrawSessionRecord & { prize?: { name: string } }).prize;
      if (prize) s.prize_name = prize.name;
    });
    const activeSession =
      sessions.find((s) => s.status === "revealing" || s.status === "drawing") ?? null;

    const summary: DashboardSummary = {
      totalParticipants: participants.length,
      activeParticipants: activeIds.size,
      alreadyWon: wonIds.size,
      excludedParticipants: excludedIds.size,
      eligibleParticipants: eligible,
      totalPrizes: prizes.length,
      totalPrizeQuantity: prizes.reduce((sum, p) => sum + p.quantity, 0),
      remainingPrizeQuantity: prizes.reduce((sum, p) => sum + p.remaining, 0),
      completedDraws: sessions.filter((s) => s.status === "completed").length,
      activeSession,
    };

    return ok({
      summary,
      prizes,
      recentActivity: auditRes.data as AuditRecord[],
      recentSessions: sessions.slice(0, 6),
    });
  } catch (error) {
    return handleError(error);
  }
}
