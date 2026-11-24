"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import useSWR from "swr";
import {
  AlertCircle, Check, ClipboardPaste, Download, FileSpreadsheet,
  Pencil, Plus, Search, Trash2, Upload, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { del, patch, post, swrFetcher } from "@/lib/api-client";
import {
  buildPreview, detectMapping, diffRoster, normalizeCell, parseDelimitedText, toRpcRows,
  type ColumnMapping,
} from "@/lib/participants";
import { cn, formatDate } from "@/lib/utils";
import type { ParticipantRecord } from "@/lib/types";
import { ImportPreview } from "./ImportPreview";

type Tab = "import" | "roster" | "history";
type Source = "excel" | "paste" | "manual";

interface Paged {
  rows: ParticipantRecord[];
  total: number;
  page: number;
  pageSize: number;
}

const emptyMapping: ColumnMapping = { hasHeader: true, idIndex: 0, nameIndex: 1 };

export function ParticipantsPage({ eventId }: { eventId: string }) {
  const [tab, setTab] = useState<Tab>("import");
  const [source, setSource] = useState<Source>("excel");
  const [excelMatrix, setExcelMatrix] = useState<string[][]>([]);
  const [pasteText, setPasteText] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping);
  const [mode, setMode] = useState<"replace" | "sync">("sync");
  const [overrideReason, setOverrideReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState("employee_id");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ParticipantRecord | null>(null);
  const [deleting, setDeleting] = useState<ParticipantRecord | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualReason, setManualReason] = useState("");

  const pasteMatrix = useMemo(() => (pasteText.trim() ? parseDelimitedText(pasteText) : []), [pasteText]);
  const matrix = source === "excel" ? excelMatrix : pasteMatrix;

  useEffect(() => {
    if (!matrix.length) return;
    const detected = detectMapping(matrix);
    if (detected) setMapping(detected);
  }, [matrix]);

  const preview = useMemo(() => (matrix.length ? buildPreview(matrix, mapping) : null), [matrix, mapping]);

  const { data: existing, mutate: mutateExisting } = useSWR<Array<{ employee_id: string; employee_name: string }>>(
    `/api/admin/events/${eventId}/participants/all`, swrFetcher<Array<{ employee_id: string; employee_name: string }>>,
  );
  const rosterKey = `/api/admin/events/${eventId}/participants?q=${encodeURIComponent(q)}&sort=${sort}&dir=${dir}&page=${page}&pageSize=50`;
  const { data: roster, mutate: mutateRoster } = useSWR<Paged>(rosterKey, swrFetcher<Paged>);
  const { data: history, mutate: mutateHistory } = useSWR<Array<Record<string, unknown>>>(
    tab === "history" ? `/api/admin/events/${eventId}/imports` : null, swrFetcher<Array<Record<string, unknown>>>,
  );

  const diff = useMemo(() => {
    if (!preview || !existing) return null;
    return diffRoster(
      existing.map((p) => ({ employeeId: p.employee_id, employeeName: p.employee_name })),
      toRpcRows(preview),
    );
  }, [preview, existing]);

  async function readFile(file: File) {
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1, raw: false, defval: "", blankrows: false,
      }) as unknown[][];
      setExcelMatrix(rows.map((row) => row.map(normalizeCell)));
      setFilename(file.name);
      toast.success(`Read ${file.name} — ${rows.length} row(s)`);
    } catch (err) {
      toast.error("Could not read workbook: " + (err as Error).message);
    }
  }

  async function commitImport() {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await post<{ added: number; updated: number; removed: number }>(
        `/api/admin/events/${eventId}/participants/import`, {
        mode, method: source,
        rows: toRpcRows(preview),
        filename,
        overrideReason: overrideReason || undefined,
        totalRecords: preview.total,
        invalidRecords: preview.invalid.length + preview.duplicates.length,
      });
      toast.success(`Roster saved: ${result.added} added, ${result.updated} updated, ${result.removed} removed`);
      setConfirmOpen(false);
      setExcelMatrix([]); setPasteText(""); setFilename(null); setOverrideReason("");
      mutateExisting(); mutateRoster(); mutateHistory();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`/api/admin/events/${eventId}/participants`, {
        employeeId: manualId, employeeName: manualName,
        overrideReason: manualReason || undefined,
      });
      toast.success("Participant added");
      setManualId(""); setManualName(""); setManualReason("");
      mutateExisting(); mutateRoster(); mutateHistory();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(false); }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await patch(`/api/admin/participants/${editing.id}`, {
        employeeName: editing.employee_name,
        status: editing.status,
        ...((editing as ParticipantRecord & { overrideReason?: string }).overrideReason
          ? { overrideReason: (editing as ParticipantRecord & { overrideReason?: string }).overrideReason } : {}),
      });
      toast.success("Participant updated");
      setEditing(null); mutateRoster(); mutateExisting(); mutateHistory();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  async function removeParticipant() {
    if (!deleting) return;
    setBusy(true);
    try {
      await del(`/api/admin/participants/${deleting.id}?reason=${encodeURIComponent(deleteReason)}`);
      toast.success("Participant removed");
      setDeleting(null); setDeleteReason(""); mutateRoster(); mutateExisting(); mutateHistory();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  function setSortColumn(column: string) {
    if (sort === column) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(column); setDir("asc"); }
    setPage(1);
  }

  const tabs: Array<[Tab, string]> = [
    ["import", "Import participants"],
    ["roster", `Roster${roster ? ` (${roster.total})` : ""}`],
    ["history", "Import history"],
  ];

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-.035em]">Participants</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Employee ID is the unique business key. Duplicate names with different IDs are valid.
          </p>
        </div>
        <div className="flex gap-2">
          <a className="btn btn-secondary text-xs" href={`/api/admin/events/${eventId}/export?type=participants&format=csv`}>
            <Download className="h-3.5 w-3.5" /> CSV
          </a>
          <a className="btn btn-secondary text-xs" href={`/api/admin/events/${eventId}/export?type=participants&format=xlsx`}>
            <Download className="h-3.5 w-3.5" /> Excel
          </a>
        </div>
      </div>

      <div className="mb-5 flex gap-1 border-b border-[var(--line)]">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("-mb-px border-b-2 px-4 py-2.5 text-[13px] font-semibold transition",
              tab === id ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "import" && (
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="mb-5 flex flex-wrap gap-2">
              {([
                ["excel", "Excel upload", FileSpreadsheet],
                ["paste", "Copy / paste", ClipboardPaste],
                ["manual", "Manual entry", UserRound],
              ] as const).map(([id, label, Icon]) => (
                <button key={id} onClick={() => setSource(id)}
                  className={cn("flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-semibold",
                    source === id ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--text-muted)]")}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            {source === "excel" && (
              <div>
                <label className="field-label">Excel file (.xlsx or .xls)</label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-5 py-7 hover:border-[var(--accent)]">
                  <Upload className="h-5 w-5 text-[var(--accent)]" />
                  <div>
                    <div className="text-[13px] font-semibold">{filename || "Choose a spreadsheet"}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">Columns are detected by header name. First rows only previewed — nothing is saved until you confirm.</div>
                  </div>
                  <input type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
                </label>
              </div>
            )}

            {source === "paste" && (
              <div>
                <label className="field-label">Paste two columns from Excel (tab-separated) or CSV</label>
                <textarea
                  className="input min-h-[190px] font-mono text-[12px] leading-relaxed"
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"Employee ID\tEmployee Name\nEMP001\tJohn Doe\nEMP002\tJane Smith"}
                />
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                  With or without a header row. Tabs, commas and semicolons are supported. Invalid rows are shown, never silently dropped.
                </p>
              </div>
            )}

            {source === "manual" && (
              <form onSubmit={addManual} className="grid gap-4 md:grid-cols-[1fr_1fr_1.4fr_auto] md:items-end">
                <div><label className="field-label">Employee ID</label>
                  <input className="input" required value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="EMP001" /></div>
                <div><label className="field-label">Employee Name</label>
                  <input className="input" required value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="John Doe" /></div>
                <div><label className="field-label">Override reason (if draw history exists)</label>
                  <input className="input" value={manualReason} onChange={(e) => setManualReason(e.target.value)} placeholder="At least 5 characters" /></div>
                <button className="btn btn-primary" disabled={busy}><Plus className="h-4 w-4" /> Add</button>
              </form>
            )}
          </div>

          {source !== "manual" && preview && (
            <>
              <ImportPreview preview={preview} matrix={matrix} mapping={mapping} onMappingChange={setMapping} />
              <div className="panel flex flex-wrap items-end gap-5 p-5">
                <div>
                  <label className="field-label">Import mode</label>
                  <div className="flex gap-2">
                    {(["sync", "replace"] as const).map((m) => (
                      <button key={m} onClick={() => setMode(m)}
                        className={cn("rounded-md border px-4 py-2 text-xs font-semibold capitalize",
                          mode === m ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--text-muted)]")}>
                        {m === "sync" ? "Synchronize" : "Replace"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="min-w-[240px] flex-1">
                  <label className="field-label">Override reason (required after first draw)</label>
                  <input className="input" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="e.g. HR correction approved by event owner" />
                </div>
                <button className="btn btn-primary" disabled={preview.valid.length === 0}
                  onClick={() => setConfirmOpen(true)}>
                  Review & confirm import
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "roster" && (
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input className="input pl-9" placeholder="Search Employee ID or name…" value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
            <span className="text-xs text-[var(--text-muted)]">{roster?.total ?? 0} record(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr>
                {([["employee_id", "Employee ID"], ["employee_name", "Employee Name"], ["status", "Status"], ["created_at", "Added"]] as const).map(([col, label]) => (
                  <th key={col}><button className="hover:text-[var(--text)]" onClick={() => setSortColumn(col)}>
                    {label} {sort === col ? (dir === "asc" ? "↑" : "↓") : ""}
                  </button></th>
                ))}
                <th className="text-right">Actions</th>
              </tr></thead>
              <tbody>
                {(roster?.rows ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs font-semibold">{p.employee_id}</td>
                    <td className="font-semibold">{p.employee_name}</td>
                    <td><span className={cn("chip", p.status === "active" ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent)]" : "")}>{p.status}</span></td>
                    <td className="text-[var(--text-muted)]">{formatDate(p.created_at)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost rounded p-1.5" onClick={() => setEditing(p)} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                        <button className="btn-ghost rounded p-1.5 hover:!text-[var(--danger)]" onClick={() => setDeleting(p)} title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 text-xs">
            <span className="text-[var(--text-muted)]">Page {page} of {Math.max(1, Math.ceil((roster?.total ?? 0) / 50))}</span>
            <div className="flex gap-2">
              <button className="btn btn-secondary py-1.5 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button className="btn btn-secondary py-1.5 text-xs" disabled={page * 50 >= (roster?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="panel overflow-hidden">
          <table className="data-table">
            <thead><tr><th>When</th><th>Method</th><th>Mode</th><th>File</th><th>Added</th><th>Updated</th><th>Removed</th><th>Override reason</th></tr></thead>
            <tbody>
              {(history ?? []).map((h) => (
                <tr key={h.id as string}>
                  <td className="text-[var(--text-muted)]">{formatDate(h.created_at as string, true)}</td>
                  <td className="font-semibold">{h.import_method as string}</td>
                  <td>{h.import_mode as string}</td>
                  <td className="text-[var(--text-muted)]">{(h.filename as string) ?? "—"}</td>
                  <td>{h.added_records as number}</td><td>{h.updated_records as number}</td><td>{h.removed_records as number}</td>
                  <td className="text-[11px] text-[var(--warning)]">{(h.override_reason as string) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmOpen && preview && diff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="panel w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Confirm roster {mode}</h2>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              This operation will be recorded in the audit log. Invalid and duplicate rows are excluded from the commit.
            </p>
            <div className="mt-5 grid grid-cols-4 gap-3 text-center">
              {([
                ["Added", diff.added.length, "text-[var(--accent)]"],
                ["Updated", diff.updated.length, ""],
                ["Unchanged", diff.unchanged.length, ""],
                ["Removed", diff.removed.length, "text-[var(--warning)]"],
              ] as const).map(([label, value, color]) => (
                <div key={label} className="panel-flat rounded-md px-3 py-4">
                  <div className={cn("text-2xl font-bold", color)}>{value}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
                </div>
              ))}
            </div>
            {diff.updated.length > 0 && (
              <div className="mt-4 max-h-28 overflow-auto rounded-md border border-[var(--line)] p-3 text-[11px]">
                {diff.updated.slice(0, 10).map((u) => (
                  <div key={u.employeeId}><span className="font-mono font-semibold">{u.employeeId}</span>: “{u.from}” → “{u.to}”</div>
                ))}
              </div>
            )}
            {(preview.invalid.length > 0 || preview.duplicates.length > 0) && (
              <div className="mt-4 flex items-center gap-2 rounded-md bg-[var(--warning-soft)] px-3 py-2 text-[11px] text-[var(--warning)]">
                <AlertCircle className="h-4 w-4" />
                {preview.invalid.length} invalid and {preview.duplicates.length} duplicate row(s) will not be imported. Download the error report from the preview above.
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={commitImport}>
                {busy ? "Saving…" : <><Check className="h-4 w-4" /> Confirm {mode}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setEditing(null)}>
          <form className="panel w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
            <h2 className="text-lg font-bold">Edit participant</h2>
            <div><label className="field-label">Employee ID (immutable)</label>
              <input className="input font-mono" value={editing.employee_id} disabled /></div>
            <div><label className="field-label">Employee Name</label>
              <input className="input" value={editing.employee_name}
                onChange={(e) => setEditing({ ...editing, employee_name: e.target.value })} /></div>
            <div><label className="field-label">Status</label>
              <select className="input" value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as "active" | "inactive" })}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select></div>
            <div><label className="field-label">Override reason (if draw history exists)</label>
              <input className="input" value={(editing as ParticipantRecord & { overrideReason?: string }).overrideReason ?? ""}
                onChange={(e) => setEditing({ ...editing, overrideReason: e.target.value } as ParticipantRecord)} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>Save</button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setDeleting(null)}>
          <div className="panel w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Remove participant</h2>
            <p className="text-[12px] text-[var(--text-muted)]">
              {deleting.employee_id} — {deleting.employee_name}. Historical winner records are never deleted.
            </p>
            <div><label className="field-label">Reason (required if draw history exists)</label>
              <input className="input" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} /></div>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={busy} onClick={removeParticipant}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
