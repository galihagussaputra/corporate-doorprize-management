"use client";

import { useState } from "react";
import useSWR from "swr";
import { Download, History, Search, Trophy } from "lucide-react";
import { swrFetcher } from "@/lib/api-client";
import { cn, formatDateTime } from "@/lib/utils";
import type { AuditRecord, DrawWinner } from "@/lib/types";

type WinnerRow = DrawWinner & { prize_name: string | null; session_status: string | null };

export function WinnersPage({ eventId }: { eventId: string }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"winners" | "audit">("winners");
  const { data: winners } = useSWR<WinnerRow[]>(
    `/api/admin/events/${eventId}/winners?q=${encodeURIComponent(q)}`, swrFetcher<WinnerRow[]>,
  );
  const { data: audit } = useSWR<AuditRecord[]>(
    tab === "audit" ? `/api/admin/events/${eventId}/audit` : null, swrFetcher<AuditRecord[]>,
  );

  const grouped = new Map<string, WinnerRow[]>();
  (winners ?? []).forEach((w) => {
    const key = w.prize_name ?? "Unknown prize";
    grouped.set(key, [...(grouped.get(key) ?? []), w]);
  });

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-.035em]">Winners & audit</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Complete, immutable result history. Voided results are preserved, never deleted.
          </p>
        </div>
        <div className="flex gap-2">
          <a className="btn btn-secondary text-xs" href={`/api/admin/events/${eventId}/export?type=winners&format=csv`}>
            <Download className="h-3.5 w-3.5" /> CSV
          </a>
          <a className="btn btn-secondary text-xs" href={`/api/admin/events/${eventId}/export?type=winners&format=xlsx`}>
            <Download className="h-3.5 w-3.5" /> Excel
          </a>
        </div>
      </div>

      <div className="mb-5 flex gap-1 border-b border-[var(--line)]">
        {(["winners", "audit"] as const).map((id) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold",
              tab === id ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text-muted)]")}>
            {id === "winners" ? "Winner history" : "Audit log"}
          </button>
        ))}
      </div>

      {tab === "winners" ? (
        <>
          <div className="panel mb-5 flex items-center gap-3 px-4 py-3">
            <Search className="h-4 w-4 text-[var(--text-muted)]" />
            <input className="input border-0 bg-transparent pl-0 focus:shadow-none"
              placeholder="Search Employee ID or Employee Name…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="shrink-0 text-xs text-[var(--text-muted)]">{winners?.length ?? 0} record(s)</span>
          </div>

          <div className="space-y-5">
            {[...grouped.entries()].map(([prize, rows]) => (
              <section key={prize} className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <Trophy className="h-4 w-4 text-[#e6b75c]" />
                    <h2 className="section-title">{prize}</h2>
                  </div>
                  <span className="chip">{rows.length} winner(s)</span>
                </div>
                <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 xl:grid-cols-3">
                  {rows.map((w) => (
                    <div key={w.id} className="bg-[var(--surface)] px-5 py-4">
                      <div className="text-[15px] font-bold">{w.employee_name}</div>
                      <div className="mt-0.5 font-mono text-[12px] font-semibold text-[var(--accent)]">{w.employee_id}</div>
                      <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span>Reveal #{w.reveal_order} · {formatDateTime(w.revealed_at ?? w.created_at)}</span>
                        {w.status !== "active" && (
                          <span className="chip border-transparent bg-[var(--warning-soft)] text-[var(--warning)]">{w.status}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {winners && winners.length === 0 && (
              <div className="panel py-20 text-center text-sm text-[var(--text-muted)]">No winners recorded yet.</div>
            )}
          </div>
        </>
      ) : (
        <div className="panel overflow-hidden">
          <table className="data-table">
            <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Reason</th><th>Administrator</th></tr></thead>
            <tbody>
              {(audit ?? []).map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(log.created_at)}</td>
                  <td className="font-semibold">{log.action}</td>
                  <td className="text-[var(--text-muted)]">{log.entity_type} · {log.entity_id?.slice(0, 8) ?? "—"}</td>
                  <td className="text-[11px] text-[var(--warning)]">{log.reason ?? "—"}</td>
                  <td className="font-mono text-[10px] text-[var(--text-muted)]">{log.administrator_id?.slice(0, 8) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
