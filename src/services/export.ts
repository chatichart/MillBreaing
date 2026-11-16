import { AppData, Item } from "../models/schema";
import { pairReady, status, forecast, thaiDate } from "../domain/rules";
export function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function reportCsv(d: AppData, items: Item[], date: string): string {
  const rows = [
    [
      "Reporting Date",
      "Item ID",
      "Supplier",
      "Delivery Plan",
      "Delivery Actual",
      "Current Status",
      "Pairing Status",
      "Delay Reason",
      "Planning Remark",
    ],
    ...items.map((i) => [
      thaiDate(date),
      i.id,
      d.suppliers.find((s) => s.id === i.supplierId)?.name,
      thaiDate(forecast(i)),
      thaiDate(i.actual.deliveryDate),
      status(i, d, date),
      pairReady(i, d) ? "Ready" : "Waiting",
      i.delayReason,
      i.planningRemark,
    ]),
  ];
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export function download(
  name: string,
  text: string,
  type = "text/csv;charset=utf-8",
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
