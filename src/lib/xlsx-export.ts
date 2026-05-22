import * as XLSX from "xlsx";

export type XlsxColumnType = "currency" | "number" | "percent" | "date" | "datetime" | "text";

export interface XlsxColumn {
  key: string;
  label: string;
  width?: number;
  type?: XlsxColumnType;
}

export interface XlsxSheet {
  name: string;
  rows: Array<Record<string, unknown>>;
  columns?: XlsxColumn[];
}

const FORMAT_MAP: Record<XlsxColumnType, string> = {
  currency: '"R$" #,##0.00;[Red]-"R$" #,##0.00',
  number: "#,##0.00",
  percent: "0.00%",
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
  text: "@",
};

function sanitizeSheetName(name: string): string {
  // Excel limit: 31 chars, no [ ] : * ? / \
  return name.replace(/[\[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
}

function buildSheet(sheet: XlsxSheet): XLSX.WorkSheet {
  const columns =
    sheet.columns ??
    (sheet.rows[0]
      ? Object.keys(sheet.rows[0]).map((k) => ({ key: k, label: k }))
      : []);

  const header = columns.map((c) => c.label);
  const data = sheet.rows.map((row) =>
    columns.map((c) => {
      const v = row[c.key];
      if (v === undefined || v === null) return "";
      if (c.type === "date" || c.type === "datetime") {
        if (v instanceof Date) return v;
        const d = new Date(v as string);
        return isNaN(d.getTime()) ? v : d;
      }
      return v;
    }),
  );

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  // Column widths
  ws["!cols"] = columns.map((c) => ({ wch: c.width ?? Math.max(12, c.label.length + 2) }));

  // Header style (bold) — note xlsx community doesn't write styles, but writes bold via cellStyles
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
    if (cell) cell.s = { font: { bold: true } };
  }

  // Numeric formats per column
  columns.forEach((col, cIdx) => {
    if (!col.type || col.type === "text") return;
    const fmt = FORMAT_MAP[col.type];
    for (let r = 1; r <= data.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: cIdx });
      const cell = ws[ref];
      if (!cell) continue;
      cell.z = fmt;
      if (col.type === "date" || col.type === "datetime") {
        cell.t = "d";
      } else if (typeof cell.v === "number") {
        cell.t = "n";
      }
    }
  });

  return ws;
}

export function exportToXlsx(filename: string, sheets: XlsxSheet[]): void {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  sheets.forEach((sheet, idx) => {
    let name = sanitizeSheetName(sheet.name || `Aba ${idx + 1}`);
    let suffix = 2;
    while (usedNames.has(name)) {
      const base = sanitizeSheetName(sheet.name || `Aba ${idx + 1}`);
      name = sanitizeSheetName(`${base} ${suffix++}`);
    }
    usedNames.add(name);
    XLSX.utils.book_append_sheet(wb, buildSheet(sheet), name);
  });

  const finalName = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, finalName);
}
