/*
 * CSV writing (RFC 4180). Cells that a spreadsheet would treat as a formula
 * (starting with = + - @ or a tab/carriage return) are prefixed with a quote
 * so an expense called "=HYPERLINK(...)" can't run when the export is opened.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
