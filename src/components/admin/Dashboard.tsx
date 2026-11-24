"use client";

import Link from "next/link";
import useSWR from "swr";
import { Activity, Gift, Radio, TicketCheck, UsersRound } from "lucide-react";
import { swrFetcher } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";
import type { AuditRecord, DashboardSummary, DrawSessionRecord, PrizeRecord } from "@/lib/types";

interface Overview {
  summary: DashboardSummary;
  prizes: PrizeRecord[];
  recentActivity: AuditRecord[];
  recentSessions: DrawSessionRecord[];
}

function Stat({ label, value, hint, icon: Icon }: {
  label: string; value: string | number; hint?: string; icon: React.ElementType;
}) {
  return (
    <div className="panel px-5 py-5">
      <div className="flex items-start justify-between">
        <div className="stat-label">{label}</div>
        <Icon className="h-4 w-4 text-[var(--text-muted)]" />
      </div>
      <div className="stat-value mt-4">{value}</div>
      {hint && <div className="mt-2 text-[11px] text-[var(--text-muted)]">{hint}</div>}
    </div>
  );
}

export function Dashboard({ eventId }: { eventId: string }) {
  const { data } = useSWR<Overview>(`/api/admin/events/${eventId}/overview`, swrFetcher<Overview>, {
    refreshInterval: 5000,
  });
  const s = data?.summary;
  const active = s?.activeSession;

  return (
    <div>
      <div className="mb-7 flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-.035em]">Event overview</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Live participation and prize status. Refreshes automatically.
          </p>
        </div>
        <Link href={`/admin/events/${eventId}/draw`} className="btn btn-primary">
          <Radio className="h-4 w-4" /> Live draw console
        </Link>
      </div>

      {active && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#e6b75c]/40 bg-[#fff7e6] px-5 py-4 dark:bg-[var(--warning-soft)]">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#b54708] opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#b54708]" />
            </span>
            <div>
              <div className="text-[13px] font-bold">Draw in progress — {active.prize_name ?? "prize"}</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {active.reveal_index} of {active.requested_winner_count} revealed
                {active.paused_at ? " · paused" : ""}
              </div>
            </div>
          </div>
          <Link href={`/admin/events/${eventId}/draw`} className="btn btn-secondary text-xs">Open console</Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Registered" value={s?.totalParticipants ?? "—"} hint={`${s?.activeParticipants ?? 0} active`} icon={UsersRound} />
        <Stat label="Eligible" value={s?.eligibleParticipants ?? "—"} hint={`${s?.alreadyWon ?? 0} won · ${s?.excludedParticipants ?? 0} excluded`} icon={TicketCheck} />
        <Stat label="Prize quantity" value={s?.totalPrizeQuantity ?? "—"} hint={`${s?.remainingPrizeQuantity ?? 0} remaining`} icon={Gift} />
        <Stat label="Completed draws" value={s?.completedDraws ?? "—"} hint={`${s?.totalPrizes ?? 0} prize categories`} icon={Activity} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <h2 className="section-title">Prize categories</h2>
            <Link href={`/admin/events/${eventId}/prizes`} className="text-xs font-semibold text-[var(--accent)]">Manage</Link>
          </div>
          <table className="data-table">
            <thead><tr><th>Prize</th><th>Qty</th><th>Awarded</th><th>Remaining</th><th>Status</th></tr></thead>
            <tbody>
              {(data?.prizes ?? []).map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{p.category}</div>
                  </td>
                  <td>{p.quantity}</td>
                  <td>{p.awarded}</td>
                  <td className="font-semibold">{p.remaining}</td>
                  <td>
                    {p.completed ? (
                      <span className="chip border-transparent bg-[#e8efff] text-[#1d4ed8]">Complete</span>
                    ) : p.status === "inactive" ? (
                      <span className="chip">Inactive</span>
                    ) : (
                      <span className="chip border-transparent bg-[var(--accent-soft)] text-[var(--accent)]">Open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="section-title">Recent activity</h2>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {(data?.recentActivity ?? []).map((log) => (
              <div key={log.id} className="px-5 py-3.5">
                <div className="text-[12px] font-semibold">{log.action}</div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{log.entity_type} · {log.entity_id?.slice(0, 8) ?? "—"}</div>
                <div className="mt-1 text-[10px] text-[var(--text-muted)]">{formatDateTime(log.created_at)}</div>
              </div>
            ))}
            {data && data.recentActivity.length === 0 && (
              <div className="px-5 py-10 text-center text-[12px] text-[var(--text-muted)]">No activity recorded yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
