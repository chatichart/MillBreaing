import Papa from "papaparse";
import { PlanRow } from "../domain/import";
export async function readPlanFile(file: File): Promise<PlanRow[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error("ไฟล์แผนต้องไม่เกิน 10 MB");
  if (file.name.toLowerCase().endsWith(".csv")) {
    const parsed = Papa.parse<PlanRow>(await file.text(), {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length)
      throw new Error(parsed.errors.map((e) => e.message).join("; "));
    return parsed.data;
  }
  if (file.name.toLowerCase().endsWith(".json")) {
    const rows: unknown = JSON.parse(await file.text());
    if (!Array.isArray(rows))
      throw new Error("Normalized PDF JSON must be an array");
    return rows as PlanRow[];
  }
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const Excel = await import(
      /* webpackChunkName: 'plan-xlsx-import' */ "exceljs"
    );
    const book = new Excel.Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    const sheet = book.worksheets[0];
    if (!sheet) throw new Error("Workbook ไม่มี worksheet");
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, c) => {
      headers[c] = String(cell.value || "");
    });
    const rows: PlanRow[] = [];
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      const value: Record<string, string> = {};
      row.eachCell((cell, c) => {
        const v = cell.value;
        if (v instanceof Date) value[headers[c]] = v.toISOString().slice(0, 10);
        else if (typeof v === "string" || typeof v === "number")
          value[headers[c]] = String(v);
        else if (v !== null)
          throw new Error(
            `Row ${n}: formulas / rich cells are not supported; normalize source first`,
          );
      });
      rows.push(value as unknown as PlanRow);
    });
    return rows;
  }
  throw new Error("รองรับ CSV, XLSX และ normalized PDF JSON");
}
