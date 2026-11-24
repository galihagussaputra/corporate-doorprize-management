"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Copy, ExternalLink, KeyRound, Lock, RefreshCw, Save, ShieldCheck, Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { patch, post, swrPostFetcher } from "@/lib/api-client";
import { cn, formatDateTime } from "@/lib/utils";
import type { EventRecord, EventStatus } from "@/lib/types";

type FormState = {
  name: string;
  description: string;
  eventDate: string;
  status: EventStatus;
  public_display_enabled: boolean;
  theme: "dark" | "light";
  primary_color: string;
  logo_url: string;
  sound_enabled: boolean;
  animation_duration_ms: number;
  reveal_delay_ms: number;
};

const STATUSES: EventStatus[] = ["draft", "ready", "in_progress", "completed", "archived"];

export function EventSettingsPage({ eventId, event }: { eventId: string; event: EventRecord | null }) {
  const [form, setForm] = useState<FormState>(() => ({
    name: event?.name ?? "",
    description: event?.description ?? "",
    eventDate: event?.event_date ? event.event_date.slice(0, 10) : "",
    status: event?.status ?? "draft",
    public_display_enabled: event?.settings.public_display_enabled ?? false,
    theme: event?.settings.theme ?? "dark",
    primary_color: event?.settings.primary_color ?? "#e6b75c",
    logo_url: event?.settings.logo_url ?? "",
    sound_enabled: event?.settings.sound_enabled ?? true,
    animation_duration_ms: event?.settings.animation_duration_ms ?? 2600,
    reveal_delay_ms: event?.settings.reveal_delay_ms ?? 1200,
  }));
  const [busy, setBusy] = useState(false);
  const { data: token, mutate: mutateToken } = useSWR<{ slug: string | null }>(
    `/api/admin/events/${eventId}/display`,
    swrPostFetcher<{ slug: string | null }>,
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Event name is required");
    setBusy(true);
    try {
      await patch(`/api/admin/events/${eventId}`, {
        name: form.name.trim(),
        description: form.description,
        eventDate: form.eventDate ? new Date(`${form.eventDate}T09:00:00.000Z`).toISOString() : null,
        status: form.status,
        settings: {
          public_display_enabled: form.public_display_enabled,
          theme: form.theme,
          primary_color: form.primary_color,
          logo_url: form.logo_url.trim() || null,
          sound_enabled: form.sound_enabled,
          animation_duration_ms: Number(form.animation_duration_ms),
          reveal_delay_ms: Number(form.reveal_delay_ms),
        },
      });
      toast.success("Event settings saved");
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  async function togglePublic(enabled: boolean) {
    try {
      const result = await post<{ slug: string | null }>(`/api/admin/events/${eventId}/display`, {
        publicEnabled: enabled,
      });
      set("public_display_enabled", enabled);
      await mutateToken({ slug: result.slug ?? token?.slug ?? null }, { revalidate: false });
      toast.success(enabled ? "Public display enabled" : "Public display disabled");
    } catch (err) { toast.error((err as Error).message); }
  }

  async function rotateToken() {
    if (!window.confirm("Rotate the display link? The current projector link will stop working immediately.")) return;
    try {
      const result = await post<{ slug: string }>(`/api/admin/events/${eventId}/display`, { rotateToken: true });
      await mutateToken({ slug: result.slug }, { revalidate: false });
      toast.success("Display link rotated. Update the projector bookmark.");
    } catch (err) { toast.error((err as Error).message); }
  }

  async function copyLink() {
    if (!token?.slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/display/${token.slug}`);
      toast.success("Display link copied");
    } catch { toast.error("Copy failed — select the link manually"); }
  }

  const displayUrl = token?.slug ? `/display/${token.slug}` : "";

  return (
    <div className="max-w-4xl">
      <div className="mb-7">
        <h1 className="text-[26px] font-bold tracking-[-.035em]">Event settings</h1>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          Event identity, presentation defaults and the read-only projector link.
        </p>
      </div>

      <section className="panel mb-5 p-6">
        <h2 className="section-title mb-5">Event details</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="field-label">Event name</label>
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Event date</label>
            <input type="date" className="input" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Event status</label>
            <select className="input" value={form.status} onChange={(e) => set("status", e.target.value as EventStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="field-label">Description</label>
            <textarea className="input min-h-[80px]" value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
        </div>
      </section>

      <section className="panel mb-5 p-6">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="section-title">Drawing policy</h2>
        </div>
        <div className="flex items-start gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
          <div className="text-[12px]">
            <div className="font-bold">One Employee ID = one prize (ONCE)</div>
            <div className="mt-1 text-[var(--text-muted)]">
              This rule is enforced in the database by a partial unique index and cannot be disabled. Voided wins stay ineligible by default; restoring eligibility requires a reason and is written to the audit log.
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label">Animation duration (ms)</label>
            <input type="number" min={800} max={8000} step={100} className="input"
              value={form.animation_duration_ms} onChange={(e) => set("animation_duration_ms", Number(e.target.value))} />
          </div>
          <div>
            <label className="field-label">Reveal interval (ms)</label>
            <input type="number" min={300} max={6000} step={100} className="input"
              value={form.reveal_delay_ms} onChange={(e) => set("reveal_delay_ms", Number(e.target.value))} />
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-[13px] font-medium">
          <input type="checkbox" checked={form.sound_enabled} onChange={(e) => set("sound_enabled", e.target.checked)} />
          <Volume2 className="h-3.5 w-3.5" /> Sound effects on the projector
        </label>
      </section>

      <section className="panel mb-5 p-6">
        <div className="mb-5 flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="section-title">Projector display</h2>
        </div>
        <label className="flex items-start gap-3 rounded-md border border-[var(--line)] p-3 text-[12px]">
          <input type="checkbox" className="mt-0.5" checked={form.public_display_enabled}
            onChange={(e) => togglePublic(e.target.checked)} />
          <span>
            <span className="font-bold">Publish the read-only display</span>
            <span className="mt-1 block text-[var(--text-muted)]">
              The display endpoint only exposes the sanitized presentation state — never the roster, audit trail, winner identities before reveal, or admin controls.
            </span>
          </span>
        </label>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label">Theme</label>
            <select className="input" value={form.theme} onChange={(e) => set("theme", e.target.value as "dark" | "light")}>
              <option value="dark">Dark stage</option>
              <option value="light">Light stage</option>
            </select>
          </div>
          <div>
            <label className="field-label">Accent colour</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primary_color} onChange={(e) => set("primary_color", e.target.value)}
                className="h-10 w-12 cursor-pointer rounded border border-[var(--line)] bg-transparent p-1" />
              <input className="input font-mono text-xs" value={form.primary_color}
                onChange={(e) => set("primary_color", e.target.value)} />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="field-label">Logo URL (optional)</label>
            <input className="input" placeholder="https://…" value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} />
          </div>
        </div>

        <div className="mt-6 rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <div className="flex items-center gap-2 text-[12px] font-bold">
            <KeyRound className="h-3.5 w-3.5" /> Display link
          </div>
          {token?.slug ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-[var(--surface-3)] px-2 py-2 text-[11px]">{displayUrl}</code>
                <button className="btn btn-secondary py-2 text-xs" onClick={copyLink}><Copy className="h-3.5 w-3.5" /> Copy</button>
                <a className="btn btn-secondary py-2 text-xs" href={`/display/${token.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
                <button className="btn btn-secondary py-2 text-xs" onClick={rotateToken}>
                  <RefreshCw className="h-3.5 w-3.5" /> Rotate
                </button>
              </div>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Treat this as a secret. Rotating immediately invalidates the old link. Display state refreshes automatically; no administrative action is available on this page.
              </p>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-[var(--text-muted)]">
              Enable the public display to create the projector link.
            </p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="btn btn-ghost text-xs" href={`/admin/events/${eventId}/winners`}>
          View audit history →
        </Link>
        <button className={cn("btn btn-primary px-6", busy && "opacity-60")} disabled={busy} onClick={save}>
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
      {event && (
        <p className="mt-3 text-[11px] text-[var(--text-muted)]">Last updated {formatDateTime(event.updated_at)}</p>
      )}
    </div>
  );
}
