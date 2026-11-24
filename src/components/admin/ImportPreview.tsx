"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download } from "lucide-react";
import { downloadBlob } from "@/lib/utils";
import { previewErrorsCsv, type ColumnMapping, type ParsedPreview } from "@/lib/participants";

export function ImportPreview({
  preview, matrix, mapping, onMappingChange,
}: {
  preview: ParsedPreview;
  matrix: string[][];
  mapping: ColumnMapping;
  onMappingChange: (m: ColumnMapping) => void;
}) {
  const [filter, setFilter] = useState<"all" | "invalid" | "duplicate" | "valid">("all");
  const columns = (matrix[0] ?? []).map((cell, i) => ({
    index: i,
    label: cell ? `${cell} (col ${i + 1})` : `Column ${i + 1}`,
  }));
  const rows = filter === "all" ? preview.rows
    : filter === "invalid" ? preview.invalid
    : filter === "duplicate" ? preview.duplicates
    : preview.valid;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel px-4 py-3">
          <div className="stat-label">Valid</div>
          <div className="mt-1 text-xl font-bold text-[var(--accent)]">{preview.valid.length}</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="stat-label">Invalid</div>
          <div className="mt-1 text-xl font-bold text-[var(--danger)]">{preview.invalid.length}</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="stat-label">Duplicate IDs</div>
          <div className="mt-1 text-xl font-bold text-[var(--warning)]">{preview.duplicates.length}</div>
        </div>
      </div>

      <div className="panel flex flex-wrap items-end gap-4 px-4 py-3">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={mapping.hasHeader}
            onChange={(e) => onMappingChange({ ...mapping, hasHeader: e.target.checked })}
          />
          First row is a header
        </label>
        <div>
          <label className="field-label !mb-1">Employee ID column</label>
          <select className="input !w-auto py-1.5 text-xs" value={mapping.idIndex}
            onChange={(e) => onMappingChange({ ...mapping, idIndex: Number(e.target.value) })}>
            {columns.map((c) => <option key={c.index} value={c.index}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label !mb-1">Employee Name column</label>
          <select className="input !w-auto py-1.5 text-xs" value={mapping.nameIndex}
            onChange={(e) => onMappingChange({ ...mapping, nameIndex: Number(e.target.value) })}>
            {columns.map((c) => <option key={c.index} value={c.index}>{c.label}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary ml-auto py-1.5 text-xs" disabled={preview.invalid.length + preview.duplicates.length === 0}
          onClick={() => downloadBlob(previewErrorsCsv(preview), "participant-validation-errors.csv", "text/csv")}>
          <Download className="h-3.5 w-3.5" /> Download validation errors
        </button>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] px-3 py-2">
          {(["all", "invalid", "duplicate", "valid"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded px-3 py-1.5 text-[11px] font-semibold capitalize ${
                filter === f ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--text-muted)]"
              }`}>
              {f} ({f === "all" ? preview.rows.length : f === "invalid" ? preview.invalid.length : f === "duplicate" ? preview.duplicates.length : preview.valid.length})
            </button>
          ))}
        </div>
        <div className="max-h-[340px] overflow-auto">
          <table className="data-table">
            <thead><tr><th>Row</th><th>Employee ID</th><th>Employee Name</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>
              {rows.slice(0, 500).map((row) => (
                <tr key={row.sourceRow}>
                  <td className="text-[var(--text-muted)]">{row.sourceRow}</td>
                  <td className="font-mono text-xs font-semibold">{row.employeeId || "—"}</td>
                  <td className="font-semibold">{row.employeeName || "—"}</td>
                  <td>
                    {row.status === "valid" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                      </span>
                    ) : row.status === "duplicate" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--warning)]">
                        <Copy className="h-3.5 w-3.5" /> Duplicate
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--danger)]">
                        <AlertTriangle className="h-3.5 w-3.5" /> Invalid
                      </span>
                    )}
                  </td>
                  <td className="text-[11px] text-[var(--text-muted)]">{row.messages.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="py-10 text-center text-xs text-[var(--text-muted)]">No rows in this category.</div>}
        </div>
      </div>
    </div>
  );
}
