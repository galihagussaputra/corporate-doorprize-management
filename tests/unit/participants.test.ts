import { describe, expect, it } from "vitest";
import {
  buildPreview,
  detectDelimiter,
  detectMapping,
  diffRoster,
  normalizeCell,
  parseDelimitedText,
  previewErrorsCsv,
  toRpcRows,
} from "@/lib/participants";

describe("participant parsing", () => {
  it("detects Excel TSV, comma and semicolon input", () => {
    expect(detectDelimiter("EMP-1\tAna Santos\tEngineering\nEMP-2\tBen Reyes\tFinance")).toBe("\t");
    expect(detectDelimiter('EMP-1,Ana Santos,Engineering\n"EMP,2",Ben Reyes,Finance')).toBe(",");
    expect(detectDelimiter("EMP-1;Ana Santos;Engineering")).toBe(";");
  });

  it("parses quoted CSV fields and normalizes whitespace", () => {
    const matrix = parseDelimitedText('"EMP-1","Ana  Santos","R&D"\r\nEMP-2,"Ben\u00a0Reyes",Finance');
    expect(matrix[0]).toEqual(["EMP-1", "Ana Santos", "R&D"]);
    expect(matrix[1][1]).toBe("Ben Reyes");
  });

  it("recognizes common header aliases and explicit column order", () => {
    const mapping = detectMapping([["Badge ID", "Full Name", "Department"]]);
    expect(mapping).toEqual({ hasHeader: true, idIndex: 0, nameIndex: 1 });
    expect(detectMapping([["EMP-1", "Ana Santos"]])).toEqual({
      hasHeader: false, idIndex: 0, nameIndex: 1,
    });
  });

  it("flags invalid and duplicate rows while keeping valid rows", () => {
    const preview = buildPreview(parseDelimitedText(
      "Employee ID,Employee Name\nEMP-1,Ana Santos\nEMP-1,Another Person\nEMP-2,\nEMP-3,Ben Reyes",
    ));
    expect(preview.total).toBe(4);
    expect(preview.valid.map((r) => r.employeeId)).toEqual(["EMP-1", "EMP-3"]);
    expect(preview.duplicates).toHaveLength(1);
    expect(preview.duplicates[0].messages.join(" ")).toContain("Duplicate Employee ID");
    expect(preview.invalid).toHaveLength(1);
    expect(preview.invalid[0].messages.join(" ")).toContain("Employee Name is required");
    expect(toRpcRows(preview)).toEqual([
      { employeeId: "EMP-1", employeeName: "Ana Santos" },
      { employeeId: "EMP-3", employeeName: "Ben Reyes" },
    ]);
  });

  it("ignores blank spreadsheet rows and trims BOM", () => {
    expect(normalizeCell("\uFEFFEMP-9")).toBe("EMP-9");
    const preview = buildPreview(parseDelimitedText("ID,Name\nEMP-1,Ana\n   \nEMP-2,Ben"));
    expect(preview.total).toBe(2);
  });

  it("exports only validation errors", () => {
    const preview = buildPreview(parseDelimitedText("ID,Name\nEMP-1,\nEMP-2,Ben"));
    const csv = previewErrorsCsv(preview);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Employee Name is required");
    expect(csv).not.toContain("EMP-2,Ben");
  });
});

describe("roster diff", () => {
  it("computes added, updated, unchanged and removed by Employee ID", () => {
    const diff = diffRoster(
      [
        { employeeId: "A", employeeName: "Ana" },
        { employeeId: "B", employeeName: "Ben (old)" },
        { employeeId: "C", employeeName: "Cara" },
      ],
      [
        { employeeId: "A", employeeName: "Ana" },
        { employeeId: "B", employeeName: "Ben (new)" },
        { employeeId: "D", employeeName: "Dara" },
      ],
    );
    expect(diff.added).toEqual([{ employeeId: "D", employeeName: "Dara" }]);
    expect(diff.updated).toEqual([{ employeeId: "B", from: "Ben (old)", to: "Ben (new)" }]);
    expect(diff.unchanged).toEqual(["A"]);
    expect(diff.removed).toEqual([{ employeeId: "C", employeeName: "Cara" }]);
  });

  it("treats repeated names as distinct people when IDs differ", () => {
    const diff = diffRoster(
      [{ employeeId: "A", employeeName: "Same Name" }],
      [
        { employeeId: "A", employeeName: "Same Name" },
        { employeeId: "B", employeeName: "Same Name" },
      ],
    );
    expect(diff.added).toHaveLength(1);
    expect(diff.unchanged).toHaveLength(1);
  });
});
