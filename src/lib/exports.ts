import * as XLSX from "xlsx";

export type ExportCell = string | number | null;
export type ExportRow = ExportCell[];

export function toCsv(rows: ExportRow[]): string {
  const esc = (value: ExportCell) =>
    value === null ? "" : `"${String(value).replace(/"/g, '""')}"`;
  return "\uFEFF" + rows.map((row) => row.map(esc).join(",")).join("\r\n");
}

export function toXlsx(rows: ExportRow[], sheetName: string): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = rows[0]?.map(() => ({ wch: 24 })) ?? [];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31) || "Export");
  return Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

export const PARTICIPANT_HEADERS: ExportRow = [
  "Employee ID", "Employee Name", "Status", "Created At",
];

export function participantRows(
  rows: Array<{ employee_id: string; employee_name: string; status: string; created_at: string }>,
): ExportRow[] {
  return [
    PARTICIPANT_HEADERS,
    ...rows.map((p) => [p.employee_id, p.employee_name, p.status, p.created_at]),
  ];
}

export const WINNER_HEADERS: ExportRow = [
  "Prize", "Reveal Order", "Employee ID", "Employee Name",
  "Winner Status", "Revealed At", "Draw Session ID", "Drawn At",
];

export function winnerRows(
  rows: Array<{
    prize_name: string | null;
    reveal_order: number;
    employee_id: string;
    employee_name: string;
    status: string;
    revealed_at: string | null;
    session_id: string;
    created_at: string;
  }>,
): ExportRow[] {
  return [
    WINNER_HEADERS,
    ...rows.map((w) => [
      w.prize_name ?? "", w.reveal_order, w.employee_id, w.employee_name,
      w.status, w.revealed_at ?? "", w.session_id, w.created_at,
    ]),
  ];
}
