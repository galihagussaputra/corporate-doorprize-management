"use client";

import { useState } from "react";
import useSWR from "swr";
import { ArrowDown, ArrowUp, Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { del, patch, post, swrFetcher } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { PrizeRecord } from "@/lib/types";

export function PrizesPage({ eventId }: { eventId: string }) {
  const { data, mutate } = useSWR<PrizeRecord[]>(
    `/api/admin/events/${eventId}/prizes`, swrFetcher<PrizeRecord[]>,
  );
  const [editing, setEditing] = useState<PrizeRecord | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  async function reorder(prize: PrizeRecord, direction: -1 | 1) {
    const target = (data ?? []).find((p) => p.display_order === prize.display_order + direction);
    if (!target) return;
    try {
      await Promise.all([
        patch(`/api/admin/prizes/${prize.id}`, { displayOrder: target.display_order }),
        patch(`/api/admin/prizes/${target.id}`, { displayOrder: prize.display_order }),
      ]);
      mutate();
    } catch (err) { toast.error((err as Error).message); }
  }

  async function remove(prize: PrizeRecord) {
    if (!confirm(`Delete prize category "${prize.name}"? This cannot be undone.`)) return;
    try {
      await del(`/api/admin/prizes/${prize.id}`);
      toast.success("Prize category deleted");
      mutate();
    } catch (err) { toast.error((err as Error).message); }
  }

  return (
    <div>
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-.035em]">Prize categories</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Quantities and order are fully configurable. Remaining quantity is derived from active winners.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add prize
        </button>
      </div>

      <div className="panel overflow-hidden">
        <table className="data-table">
          <thead><tr>
            <th>Order</th><th>Prize</th><th>Category</th><th>Quantity</th>
            <th>Awarded</th><th>Remaining</th><th>Status</th><th className="text-right">Actions</th>
          </tr></thead>
          <tbody>
            {(data ?? []).map((p, i) => (
              <tr key={p.id}>
                <td>
                  <div className="flex items-center gap-1">
                    <span className="w-5 text-center font-mono text-xs text-[var(--text-muted)]">{p.display_order}</span>
                    <button className="btn-ghost rounded p-1" disabled={i === 0} onClick={() => reorder(p, -1)}><ArrowUp className="h-3 w-3" /></button>
                    <button className="btn-ghost rounded p-1" disabled={i === (data?.length ?? 0) - 1} onClick={() => reorder(p, 1)}><ArrowDown className="h-3 w-3" /></button>
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--surface-3)]">
                      <Gift className="h-4 w-4 text-[var(--accent)]" />
                    </div>
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{p.description || "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="text-[var(--text-muted)]">{p.category}</td>
                <td className="font-semibold">{p.quantity}</td>
                <td>{p.awarded}</td>
                <td>
                  <span className={cn("font-bold", p.remaining === 0 ? "text-[var(--accent)]" : "")}>{p.remaining}</span>
                </td>
                <td>
                  {p.completed ? (
                    <span className="chip border-transparent bg-[#e8efff] text-[#1d4ed8]">Completed</span>
                  ) : p.status === "inactive" ? (
                    <span className="chip">Inactive</span>
                  ) : (
                    <span className="chip border-transparent bg-[var(--accent-soft)] text-[var(--accent)]">Active</span>
                  )}
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button className="btn-ghost rounded p-1.5" onClick={() => setEditing(p)}><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="btn-ghost rounded p-1.5 hover:!text-[var(--danger)]" onClick={() => remove(p)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr><td colSpan={8} className="py-16 text-center text-sm text-[var(--text-muted)]">No prizes configured yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <PrizeForm
          prize={editing === "new" ? null : editing}
          eventId={eventId}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            setBusy(true);
            try {
              if (editing === "new") await post(`/api/admin/events/${eventId}/prizes`, values);
              else await patch(`/api/admin/prizes/${editing.id}`, values);
              toast.success("Prize saved");
              setEditing(null); mutate();
            } catch (err) { toast.error((err as Error).message); }
            finally { setBusy(false); }
          }}
        />
      )}
    </div>
  );
}

function PrizeForm({ prize, busy, onCancel, onSubmit }: {
  prize: PrizeRecord | null;
  eventId: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(prize?.name ?? "");
  const [description, setDescription] = useState(prize?.description ?? "");
  const [category, setCategory] = useState(prize?.category ?? "General");
  const [quantity, setQuantity] = useState(prize?.quantity ?? 1);
  const [imageUrl, setImageUrl] = useState(prize?.image_url ?? "");
  const [status, setStatus] = useState(prize?.status ?? "active");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onCancel}>
      <form className="panel w-full max-w-lg space-y-4 p-6" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name, description, category, quantity, imageUrl: imageUrl || null, status });
        }}>
        <h2 className="text-lg font-bold">{prize ? "Edit prize" : "New prize"}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="field-label">Prize name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="field-label">Description</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Category</label>
            <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Quantity (winners)</label>
            <input type="number" min={1} max={1000} className="input" value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>
          <div className="col-span-2">
            <label className="field-label">Image URL (optional)</label>
            <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="col-span-2">
            <label className="field-label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as "active" | "inactive")}>
              <option value="active">Active — available for drawing</option>
              <option value="inactive">Inactive — hidden from draw</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save prize"}</button>
        </div>
      </form>
    </div>
  );
}
