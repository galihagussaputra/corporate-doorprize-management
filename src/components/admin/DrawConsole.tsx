"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle, CheckCircle2, CirclePause, CirclePlay, ExternalLink,
  Flag, Play, RefreshCw, RotateCcw, ShieldCheck, Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, post, swrFetcher, swrPostFetcher } from "@/lib/api-client";
import { DRAW_MODES, DEFAULT_ANIMATION_MS, DEFAULT_REVEAL_DELAY_MS, revealDelayFor } from "@/lib/draw";
import { cn, formatDateTime } from "@/lib/utils";
import type {
  DashboardSummary, DrawMode, DrawSessionRecord, DrawWinner, EventRecord, PrizeRecord,
} from "@/lib/types";

interface Overview {
  summary: DashboardSummary;
  prizes: PrizeRecord[];
}
interface DrawResult {
  sessionId: string;
  eventId: string;
  prizeId: string;
  prizeName: string;
  drawingMode: DrawMode;
  winnerCount: number;
  eligibleCount: number;
  winners: Array<{ revealOrder: number; participantId: string; employeeId: string; employeeName: string }>;
}
interface SessionDetail extends DrawSessionRecord { winners: DrawWinner[] }

export function DrawConsole({ eventId, event }: { eventId: string; event: EventRecord | null }) {
  const { data: overview, mutate: mutateOverview } = useSWR<Overview>(
    `/api/admin/events/${eventId}/overview`, swrFetcher<Overview>, { refreshInterval: 4000 },
  );
  const { data: history, mutate: mutateHistory } = useSWR<DrawSessionRecord[]>(
    `/api/admin/events/${eventId}/draws`, swrFetcher<DrawSessionRecord[]>, { refreshInterval: 4000 },
  );
  const { data: token } = useSWR<{ slug: string | null }>(
    `/api/admin/events/${eventId}/display`, swrPostFetcher<{ slug: string | null }>,
  );

  const [prizeId, setPrizeId] = useState("");
  const [mode, setMode] = useState<DrawMode>("wheel");
  const [count, setCount] = useState(1);
  const [duration, setDuration] = useState(event?.settings.animation_duration_ms ?? DEFAULT_ANIMATION_MS);
  const [delay, setDelay] = useState(event?.settings.reveal_delay_ms ?? DEFAULT_REVEAL_DELAY_MS);
  const [sound, setSound] = useState(event?.settings.sound_enabled ?? true);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<SessionDetail | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [voidTarget, setVoidTarget] = useState<DrawSessionRecord | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [policy, setPolicy] = useState<"keep_ineligible" | "restore_eligibility">("keep_ineligible");
  const revealing = useRef(false);

  const prizes = overview?.prizes ?? [];
  const activePrize = prizes.find((p) => p.id === prizeId);
  const eligible = overview?.summary.eligibleParticipants ?? 0;
  const maxCount = Math.min(activePrize?.remaining ?? 0, eligible);
  const eventReady = event?.status === "ready" || event?.status === "in_progress";
  const canDraw = Boolean(prizeId && confirmed && count >= 1 && count <= maxCount && !active && eventReady);

  useEffect(() => {
    if (!prizeId && prizes.length > 0) {
      const next = prizes.find((p) => p.status === "active" && p.remaining > 0);
      if (next) { setPrizeId(next.id); setCount(Math.min(1, next.remaining)); }
    }
  }, [prizes, prizeId]);

  const loadActive = useCallback(async (sessionId: string) => {
    try {
      const detail = await apiFetch<SessionDetail>(`/api/admin/draws/${sessionId}`);
      setActive(detail);
    } catch { setActive(null); }
  }, []);

  useEffect(() => {
    const summaryActive = overview?.summary.activeSession;
    if (summaryActive && (!active || active.id !== summaryActive.id)) loadActive(summaryActive.id);
    if (!summaryActive && active && (active.status === "revealing" || active.status === "drawing")) setActive(null);
  }, [overview?.summary.activeSession, active, loadActive]);

  const revealNext = useCallback(async (sessionId: string) => {
    if (revealing.current) return;
    revealing.current = true;
    try {
      const result = await post<{ revealIndex: number; allRevealed: boolean; winner: { employeeName: string } }>(
        `/api/admin/draws/${sessionId}/reveal`,
      );
      toast.success(`Winner ${result.revealIndex} revealed — ${result.winner.employeeName}`);
      await loadActive(sessionId);
      mutateOverview(); mutateHistory();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      revealing.current = false;
    }
  }, [loadActive, mutateOverview, mutateHistory]);

  // Admin-controlled automatic reveal. Pause state is persisted server-side,
  // so a refresh or reconnect resumes from the last confirmed reveal index.
  useEffect(() => {
    if (!active || active.status !== "revealing" || active.paused_at) return;
    if (active.reveal_index >= active.requested_winner_count) return;
    const activeDelay = active.presentation?.reveal_delay_ms ?? delay;
    const activeDuration = active.presentation?.animation_duration_ms ?? duration;
    const wait = revealDelayFor(active.reveal_index, activeDelay, activeDuration);
    const timer = setTimeout(() => revealNext(active.id), wait);
    return () => clearTimeout(timer);
  }, [active?.id, active?.reveal_index, active?.paused_at, active?.status, delay, duration, revealNext]);

  async function startDraw(replacesSessionId?: string, overrideCount?: number, overridePrizeId?: string) {
    setBusy(true);
    try {
      const result = await post<DrawResult>(`/api/admin/events/${eventId}/draws`, {
        prizeId: overridePrizeId ?? prizeId,
        winnerCount: overrideCount ?? count,
        mode,
        animationDurationMs: duration,
        revealDelayMs: delay,
        soundEnabled: sound,
        confirm: true,
        ...(replacesSessionId ? { replacesSessionId } : {}),
      });
      toast.success(`${result.winnerCount} winner(s) securely selected and stored`);
      setConfirmed(false);
      setVoidTarget(null);
      await loadActive(result.sessionId);
      mutateOverview(); mutateHistory();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(false); }
  }

  async function complete() {
    if (!active) return;
    setBusy(true);
    try {
      await post(`/api/admin/draws/${active.id}/complete`);
      toast.success("Draw completed. Prize quantity updated.");
      setActive(null);
      setConfirmed(false);
      mutateOverview(); mutateHistory();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  async function togglePause() {
    if (!active) return;
    try {
      const result = await post<{ paused: boolean }>(`/api/admin/draws/${active.id}/pause`, {
        paused: !active.paused_at,
      });
      setActive({ ...active, paused_at: result.paused ? new Date().toISOString() : null });
      toast.success(result.paused ? "Reveal paused" : "Reveal resumed");
      mutateOverview();
    } catch (err) { toast.error((err as Error).message); }
  }

  async function cancelSession() {
    if (!active || cancelReason.trim().length < 5) return;
    setBusy(true);
    try {
      await post(`/api/admin/draws/${active.id}/cancel`, { reason: cancelReason, confirm: true });
      toast.success("Draw cancelled. Winner claims voided and recorded.");
      setActive(null); setCancelOpen(false); setCancelReason(""); setConfirmed(false);
      mutateOverview(); mutateHistory();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  async function voidAndRedraw() {
    if (!voidTarget || voidReason.trim().length < 5) return;
    setBusy(true);
    try {
      await post(`/api/admin/draws/${voidTarget.id}/void`, {
        reason: voidReason, eligibilityPolicy: policy, confirm: true,
      });
      toast.success("Original result voided and preserved in history");
      const replacedId = voidTarget.id;
      const replacedPrize = voidTarget.prize_id;
      const replacedCount = voidTarget.requested_winner_count;
      setVoidTarget(null); setVoidReason("");
      setPrizeId(replacedPrize);
      await startDraw(replacedId, replacedCount, replacedPrize);
      mutateOverview(); mutateHistory();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-.035em]">Live draw console</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Only authorized administrators can start, reveal, pause or complete a draw.
          </p>
        </div>
        {token?.slug && (
          <a href={`/display/${token.slug}`} target="_blank" rel="noreferrer" className="btn btn-secondary text-xs">
            <ExternalLink className="h-3.5 w-3.5" /> Open LED display
          </a>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="panel p-6">
          <div className="flex items-center gap-2 border-b border-[var(--line)] pb-4">
            <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
            <h2 className="section-title">Configure draw</h2>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="field-label">Prize category</label>
              <select className="input" value={prizeId} disabled={Boolean(active)} onChange={(e) => {
                setPrizeId(e.target.value);
                const p = prizes.find((x) => x.id === e.target.value);
                if (p) setCount(Math.min(1, p.remaining, eligible));
              }}>
                <option value="">Select a prize…</option>
                {prizes.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.remaining === 0}>
                    {p.name} — {p.remaining} remaining
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Presentation mode (visual only)</label>
              <select className="input" value={mode} disabled={Boolean(active)} onChange={(e) => setMode(e.target.value as DrawMode)}>
                {DRAW_MODES.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.tagline}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Number of winners</label>
              <input type="number" min={1} max={Math.max(1, maxCount)} className="input" value={count}
                disabled={Boolean(active)} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
            <div>
              <label className="field-label">Reveal interval (ms)</label>
              <input type="number" min={300} max={6000} step={100} className="input" value={delay}
                onChange={(e) => setDelay(Number(e.target.value))} />
            </div>
            <div>
              <label className="field-label">Animation duration (ms)</label>
              <input type="number" min={800} max={8000} step={100} className="input" value={duration}
                onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-[13px] font-medium">
                <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
                Sound effects
              </label>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <div>
              <div className="stat-label">Registered</div>
              <div className="mt-1 text-lg font-bold">{overview?.summary.activeParticipants ?? "—"}</div>
            </div>
            <div>
              <div className="stat-label">Already won</div>
              <div className="mt-1 text-lg font-bold">{overview?.summary.alreadyWon ?? "—"}</div>
            </div>
            <div>
              <div className="stat-label">Eligible now</div>
              <div className="mt-1 text-lg font-bold text-[var(--accent)]">{eligible}</div>
            </div>
          </div>

          {!eventReady && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-[var(--warning-soft)] px-3 py-2.5 text-[12px] text-[var(--warning)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Set the event status to <strong>Ready</strong> or <strong>In Progress</strong> in Event settings before starting a draw.
            </div>
          )}
          {count > eligible && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-[var(--warning-soft)] px-3 py-2.5 text-[12px] text-[var(--warning)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Requested winners ({count}) exceed eligible participants ({eligible}). Reduce the quantity before drawing.
            </div>
          )}
          {activePrize && count > activePrize.remaining && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-[var(--warning-soft)] px-3 py-2.5 text-[12px] text-[var(--warning)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Only {activePrize.remaining} prize quantity remains for {activePrize.name}.
            </div>
          )}

          <label className="mt-6 flex items-start gap-3 rounded-md border border-[var(--line)] p-3 text-[12px]">
            <input type="checkbox" className="mt-0.5" checked={confirmed} disabled={Boolean(active)}
              onChange={(e) => setConfirmed(e.target.checked)} />
            <span>
              I confirm that the prize, mode and winner quantity are correct. The backend will securely select and persist all winners before any animation is shown.
            </span>
          </label>
          <button className="btn btn-primary mt-4 w-full py-3" disabled={!canDraw || busy}
            onClick={() => startDraw()}>
            <Play className="h-4 w-4" /> {busy ? "Selecting winners…" : "Start secure draw"}
          </button>
        </section>

        <section className="panel flex flex-col p-6">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
            <h2 className="section-title">Draw status</h2>
            {active && (
              <span className={cn("chip border-transparent",
                active.paused_at ? "bg-[var(--warning-soft)] text-[var(--warning)]" : "bg-[var(--accent-soft)] text-[var(--accent)]")}>
                {active.paused_at ? "Paused" : active.status}
              </span>
            )}
          </div>
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
              <Trophy className="mb-4 h-9 w-9 text-[var(--line-strong)]" />
              <div className="text-[14px] font-semibold">No active draw</div>
              <div className="mt-1 max-w-xs text-[12px] text-[var(--text-muted)]">
                Configure a draw and confirm. Winners are selected on the server and revealed sequentially on the LED display.
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-1 flex-col">
              <div className="text-[12px] text-[var(--text-muted)]">Current prize</div>
              <div className="text-xl font-bold">{active.prize_name ?? "—"}</div>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                  style={{ width: `${(active.reveal_index / active.requested_winner_count) * 100}%` }} />
              </div>
              <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                {active.reveal_index} / {active.requested_winner_count} revealed · {active.drawing_mode}
              </div>

              <div className="mt-5 max-h-[300px] flex-1 space-y-2 overflow-auto">
                {(active.winners ?? []).map((w) => (
                  <div key={w.id}
                    className={cn("flex items-center justify-between rounded-md border px-3 py-2.5",
                      w.reveal_order <= active.reveal_index ? "border-[var(--line)] bg-[var(--accent-soft)]" : "border-dashed border-[var(--line)] opacity-50")}>
                    <div>
                      <div className="text-[14px] font-bold">{w.reveal_order <= active.reveal_index ? w.employee_name : "Awaiting reveal"}</div>
                      <div className="font-mono text-[11px] text-[var(--text-muted)]">
                        {w.reveal_order <= active.reveal_index ? w.employee_id : `Winner ${w.reveal_order}`}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-[var(--text-muted)]">#{w.reveal_order}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button className="btn btn-secondary" onClick={togglePause}>
                  {active.paused_at ? <><CirclePlay className="h-4 w-4" /> Resume</> : <><CirclePause className="h-4 w-4" /> Pause</>}
                </button>
                <button className="btn btn-secondary" disabled={active.reveal_index >= active.requested_winner_count}
                  onClick={() => revealNext(active.id)}>
                  Reveal next
                </button>
                <button className="btn btn-primary col-span-2"
                  disabled={active.reveal_index < active.requested_winner_count || busy}
                  onClick={complete}>
                  <CheckCircle2 className="h-4 w-4" /> Complete draw
                </button>
                <button className="btn btn-ghost col-span-2 text-[var(--danger)]" onClick={() => setCancelOpen(true)}>
                  <Flag className="h-4 w-4" /> Cancel draw with reason
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h2 className="section-title">Draw history</h2>
        </div>
        <table className="data-table">
          <thead><tr>
            <th>Prize</th><th>Started</th><th>Mode</th><th>Winners</th>
            <th>Revealed</th><th>Status</th><th className="text-right">Actions</th>
          </tr></thead>
          <tbody>
            {(history ?? []).map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.prize_name ?? "—"}</td>
                <td className="text-[var(--text-muted)]">{formatDateTime(s.started_at)}</td>
                <td className="capitalize">{s.drawing_mode}</td>
                <td>{s.requested_winner_count}</td>
                <td>{s.reveal_index}</td>
                <td>
                  <span className={cn("chip", s.status === "completed" ? "border-transparent bg-[#e8efff] text-[#1d4ed8]" :
                    s.status === "voided" || s.status === "cancelled" ? "border-transparent bg-[var(--warning-soft)] text-[var(--warning)]" : "")}>
                    {s.status}
                  </span>
                </td>
                <td>
                  <div className="flex justify-end">
                    {s.status === "completed" && (
                      <button className="btn btn-secondary py-1.5 text-xs" onClick={() => setVoidTarget(s)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Void & re-draw
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {history && history.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-[12px] text-[var(--text-muted)]">No draw sessions yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {cancelOpen && active && (
        <Modal title="Cancel draw" onClose={() => setCancelOpen(false)}>
          <p className="text-[12px] text-[var(--text-muted)]">
            All winners in this session will be voided and preserved in history. They will not be silently deleted.
          </p>
          <label className="field-label mt-4">Reason</label>
          <textarea className="input min-h-[90px]" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Projector connection lost before reveal" />
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setCancelOpen(false)}>Keep drawing</button>
            <button className="btn btn-danger" disabled={cancelReason.trim().length < 5 || busy} onClick={cancelSession}>
              Confirm cancellation
            </button>
          </div>
        </Modal>
      )}

      {voidTarget && (
        <Modal title="Void result & re-draw" onClose={() => setVoidTarget(null)}>
          <p className="text-[12px] text-[var(--text-muted)]">
            The original result stays in history as voided. You must explicitly choose what happens to those Employee IDs under the ONCE policy.
          </p>
          <label className="field-label mt-4">Reason</label>
          <textarea className="input min-h-[80px]" value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
            placeholder="e.g. Winner was not present after three announcements" />
          <div className="mt-4 space-y-2">
            {([
              ["keep_ineligible", "Keep Employee IDs ineligible (recommended) — ONCE remains permanent"],
              ["restore_eligibility", "Restore eligibility — exceptional, fully audited correction"],
            ] as const).map(([value, label]) => (
              <label key={value} className="flex items-start gap-2 rounded-md border border-[var(--line)] p-3 text-[12px]">
                <input type="radio" name="policy" className="mt-0.5" checked={policy === value}
                  onChange={() => setPolicy(value)} />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => setVoidTarget(null)}>Cancel</button>
            <button className="btn btn-danger" disabled={voidReason.trim().length < 5 || busy} onClick={voidAndRedraw}>
              <RefreshCw className="h-4 w-4" /> Void & draw again
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div className="panel w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
