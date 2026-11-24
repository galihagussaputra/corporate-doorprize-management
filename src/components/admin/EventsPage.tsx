"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, CalendarDays, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { post, swrFetcher } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import type { EventRecord } from "@/lib/types";

interface EventListItem {
  id: string;
  name: string;
  description: string | null;
  status: EventRecord["status"];
  event_date: string | null;
  created_at: string;
  settings: EventRecord["settings"];
}

const statusTone: Record<string, string> = {
  draft: "bg-[var(--surface-3)]",
  ready: "bg-[#e5f5f2] text-[#0a6f64]",
  in_progress: "bg-[#fff7e6] text-[#b54708]",
  completed: "bg-[#e8efff] text-[#1d4ed8]",
  archived: "bg-[var(--surface-3)]",
};

export function EventsPage() {
  const { data, mutate } = useSWR<EventListItem[]>("/api/admin/events", swrFetcher<EventListItem[]>);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/api/admin/events", {
        name, description,
        eventDate: date ? new Date(`${date}T09:00:00Z`).toISOString() : null,
        status: "draft",
      });
      toast.success("Event created");
      setOpen(false);
      setName(""); setDescription(""); setDate("");
      mutate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-.035em]">Events</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Each event has an isolated roster, prizes, draws and audit trail.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New event
        </button>
      </div>

      {open && (
        <form onSubmit={create} className="panel mb-6 grid gap-5 p-6 md:grid-cols-[2fr_2fr_1fr_auto] md:items-end">
          <div>
            <label className="field-label">Event name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Annual Gathering 2026" />
          </div>
          <div>
            <label className="field-label">Description</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="field-label">Event date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
          </div>
        </form>
      )}

      <div className="panel overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Event</th><th>Status</th><th>Date</th><th>Created</th><th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((event) => (
              <tr key={event.id}>
                <td>
                  <div className="font-semibold">{event.name}</div>
                  {event.description && <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{event.description}</div>}
                </td>
                <td>
                  <span className={`chip border-transparent ${statusTone[event.status] ?? ""}`}>
                    {event.status.replace("_", " ")}
                  </span>
                </td>
                <td className="text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> {formatDate(event.event_date)}
                  </span>
                </td>
                <td className="text-[var(--text-muted)]">{formatDate(event.created_at)}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <Link href={`/admin/events/${event.id}`} className="btn btn-secondary py-1.5 text-xs">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    {event.settings?.public_display_enabled && (
                      <a href={`/display/${event.id}`} target="_blank" rel="noreferrer"
                         className="btn btn-ghost py-1.5 text-xs" title="Open public display">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr><td colSpan={5} className="py-16 text-center text-sm text-[var(--text-muted)]">
                No events yet. Create one to begin.
              </td></tr>
            )}
            {!data && <tr><td colSpan={5} className="py-16 text-center text-sm text-[var(--text-muted)]">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
