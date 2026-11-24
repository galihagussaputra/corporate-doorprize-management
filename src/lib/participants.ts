/**
 * Pure participant parsing / validation / roster-diff logic.
 * No browser or React dependencies — unit tested directly.
 *
 * Business identity: Employee ID (unique per event). Names may repeat.
 */

export type RowStatus = "valid" | "invalid" | "duplicate";

export interface PreviewRow {
  sourceRow: number;
  employeeId: string;
  employeeName: string;
  status: RowStatus;
  messages: string[];
}

export interface ColumnMapping {
  hasHeader: boolean;
  idIndex: number;
  nameIndex: number;
}

export interface ParsedPreview {
  mapping: ColumnMapping;
  rows: PreviewRow[];
  valid: PreviewRow[];
  invalid: PreviewRow[];
  duplicates: PreviewRow[];
  total: number;
}

export interface RosterDiff {
  added: Array<{ employeeId: string; employeeName: string }>;
  updated: Array<{ employeeId: string; from: string; to: string }>;
  unchanged: string[];
  removed: Array<{ employeeId: string; employeeName: string }>;
}

const ID_ALIASES = [
  "employee id", "employeeid", "employee no", "employee number", "emp id",
  "empid", "emp no", "staff id", "staffid", "staff no", "badge id",
  "badge no", "id", "employee code", "emp code",
];
const NAME_ALIASES = [
  "employee name", "employeename", "full name", "fullname", "staff name",
  "name", "employee full name", "display name",
];

export function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "object" ? String((value as { v?: unknown }).v ?? "") : String(value);
  s = s.replace(/^\uFEFF/, "");
  s = s.replace(/[\u00A0\u2007\u202F]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

export function detectDelimiter(text: string): "\t" | "," | ";" {
  const sample = text.split(/\r?\n/).filter(Boolean).slice(0, 5);
  const score = (d: string) =>
    sample.reduce((sum, line) => sum + splitLine(line, d).length - 1, 0);
  const tab = score("\t");
  const comma = score(",");
  const semi = score(";");
  if (tab >= comma && tab >= semi && tab > 0) return "\t";
  if (semi > comma && semi > 0) return ";";
  return ",";
}

/** Parses TSV (Excel copy) or CSV-style pasted text into a string matrix. */
export function parseDelimitedText(text: string, delimiter?: "\t" | "," | ";"): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const d = delimiter ?? detectDelimiter(clean);
  return clean
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim().length > 0)
    .map((line) => splitLine(line, d).map(normalizeCell));
}

function matchesAlias(value: string, aliases: string[]): boolean {
  const v = normalizeCell(value).toLowerCase().replace(/[_\-.]/g, " ").replace(/\s+/g, " ").trim();
  return aliases.some((a) => v === a || v.replace(/\s/g, "") === a.replace(/\s/g, ""));
}

/** Detects header row and column positions. Returns null when ambiguous. */
export function detectMapping(matrix: string[][]): ColumnMapping | null {
  if (matrix.length === 0) return null;
  const header = matrix[0];
  let idIndex = -1;
  let nameIndex = -1;
  header.forEach((cell, i) => {
    const v = normalizeCell(cell);
    if (idIndex < 0 && matchesAlias(v, ID_ALIASES)) idIndex = i;
    if (nameIndex < 0 && matchesAlias(v, NAME_ALIASES)) nameIndex = i;
  });
  if (idIndex >= 0 && nameIndex >= 0 && idIndex !== nameIndex) {
    return { hasHeader: true, idIndex, nameIndex };
  }
  // Without a recognised header, use the first two columns.
  if (header.length >= 2) return { hasHeader: false, idIndex: 0, nameIndex: 1 };
  return null;
}

export function buildPreview(
  matrix: string[][],
  mapping?: ColumnMapping | null,
): ParsedPreview {
  const detected = mapping ?? detectMapping(matrix);
  if (!detected) {
    return {
      mapping: { hasHeader: false, idIndex: 0, nameIndex: 1 },
      rows: [], valid: [], invalid: [], duplicates: [], total: 0,
    };
  }
  const resolved: ColumnMapping = detected;
  const start = resolved.hasHeader ? 1 : 0;
  const seen = new Set<string>();
  const rows: PreviewRow[] = [];

  for (let i = start; i < matrix.length; i++) {
    const raw = matrix[i];
    const employeeId = normalizeCell(raw[resolved.idIndex]);
    const employeeName = normalizeCell(raw[resolved.nameIndex]);
    const messages: string[] = [];
    if (!employeeId) messages.push("Employee ID is required");
    if (!employeeName) messages.push("Employee Name is required");
    if (employeeId.length > 100) messages.push("Employee ID exceeds 100 characters");
    if (employeeName.length > 200) messages.push("Employee Name exceeds 200 characters");
    if (raw.every((cell) => !normalizeCell(cell))) continue; // blank spreadsheet row

    let status: RowStatus = "valid";
    if (messages.length > 0) {
      status = "invalid";
    } else if (seen.has(employeeId)) {
      status = "duplicate";
      messages.push(`Duplicate Employee ID in this file (first seen on row ${firstRowFor(rows, employeeId)})`);
    } else {
      seen.add(employeeId);
    }

    rows.push({
      sourceRow: i + 1,
      employeeId,
      employeeName,
      status,
      messages,
    });
  }

  return {
    mapping: resolved,
    rows,
    valid: rows.filter((r) => r.status === "valid"),
    invalid: rows.filter((r) => r.status === "invalid"),
    duplicates: rows.filter((r) => r.status === "duplicate"),
    total: rows.length,
  };
}

function firstRowFor(rows: PreviewRow[], employeeId: string): number {
  return rows.find((r) => r.employeeId === employeeId)?.sourceRow ?? 0;
}

/** Rows safe to send to the backend. Invalid/duplicate rows are never included. */
export function toRpcRows(preview: ParsedPreview) {
  return preview.valid.map((r) => ({ employeeId: r.employeeId, employeeName: r.employeeName }));
}

export function diffRoster(
  existing: Array<{ employeeId: string; employeeName: string }>,
  incoming: Array<{ employeeId: string; employeeName: string }>,
): RosterDiff {
  const current = new Map(existing.map((p) => [p.employeeId, p.employeeName]));
  const next = new Map(incoming.map((p) => [p.employeeId, p.employeeName]));
  const diff: RosterDiff = { added: [], updated: [], unchanged: [], removed: [] };

  for (const [employeeId, employeeName] of next) {
    if (!current.has(employeeId)) {
      diff.added.push({ employeeId, employeeName });
    } else if (current.get(employeeId) !== employeeName) {
      diff.updated.push({ employeeId, from: current.get(employeeId)!, to: employeeName });
    } else {
      diff.unchanged.push(employeeId);
    }
  }
  for (const [employeeId, employeeName] of current) {
    if (!next.has(employeeId)) diff.removed.push({ employeeId, employeeName });
  }
  return diff;
}

export function previewErrorsCsv(preview: ParsedPreview): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ["Source Row", "Employee ID", "Employee Name", "Status", "Message"].map(esc).join(","),
  ];
  for (const row of preview.rows) {
    if (row.status === "valid") continue;
    lines.push(
      [row.sourceRow, row.employeeId, row.employeeName, row.status, row.messages.join("; ")]
        .map(esc)
        .join(","),
    );
  }
  if (lines.length === 1) lines.push(esc("No validation errors found"));
  return "\uFEFF" + lines.join("\r\n");
}
