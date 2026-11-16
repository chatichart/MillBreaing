import { AppData, Item } from "../models/schema";
export const today = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const thaiDate = (s: string | null | undefined): string =>
  s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—";
export const days = (a: string, b: string): number =>
  Math.max(0, Math.floor((Date.parse(b) - Date.parse(a)) / 86400000));
export const weekOf = (s: string): number =>
  Math.min(5, Math.ceil(Number(s.slice(8, 10)) / 7));
export const forecast = (i: Item): string | null =>
  i.revisedDeliveryDate || i.baseline.deliveryDate;
// Purchasing's explicit Actual date is the delivery confirmation; no extra delivery form.
export const confirmed = (i: Item, _d: AppData): boolean =>
  !!i.actual.deliveryDate;
export const documentsComplete = (i: Item, d: AppData): boolean =>
  ["MATERIAL_CERT", "QC_DIMENSION"].every((k) =>
    d.documentMetadata.some((m) => m.itemId === i.id && m.kind === k),
  );
export const productionComplete = (i: Item): boolean =>
  !!i.actual.finishingDate && !!i.actual.qcDate && i.qcStatus === "PASS";
export const ownReady = (i: Item, d: AppData): boolean =>
  productionComplete(i) &&
  (!d.settings.requireDocumentsForReady || documentsComplete(i, d));
export function pairGroup(i: Item, d: AppData): Item[] {
  const seen = new Set([i.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of d.pairings)
      if (seen.has(p.loadId) || seen.has(p.matchingId)) {
        for (const id of [p.loadId, p.matchingId])
          if (!seen.has(id)) {
            seen.add(id);
            changed = true;
          }
      }
  }
  return d.items.filter((x) => seen.has(x.id));
}
export const pairReady = (i: Item, d: AppData): boolean =>
  pairGroup(i, d).every((x) => ownReady(x, d));
export const delayDays = (i: Item, asOf: string): number =>
  i.baseline.deliveryDate
    ? days(
        i.baseline.deliveryDate,
        i.actual.deliveryDate || [forecast(i) || "", asOf].sort().pop()!,
      )
    : 0;
export const waitingDays = (i: Item, asOf: string): number =>
  i.actual.readyDate
    ? days(i.actual.readyDate, i.actual.deliveryDate || asOf)
    : 0;
export const statuses = [
  "Not Started",
  "Casting",
  "QC + Finishing",
  "QC Failed / Rework",
  "Production Completed",
  "Waiting for Pair",
  "Ready for Delivery",
  "Waiting for Truck",
  "Delivered",
  "Delayed",
] as const;
export function status(i: Item, d: AppData, asOf: string): string {
  if (confirmed(i, d)) return "Delivered";
  if (i.qcStatus === "FAIL" || i.qcStatus === "REWORK")
    return "QC Failed / Rework";
  if (ownReady(i, d)) {
    if (!pairReady(i, d)) return "Waiting for Pair";
    if (i.actual.readyDate)
      return i.waitingForTruck ? "Waiting for Truck" : "Ready for Delivery";
    return "Production Completed";
  }
  if (i.baseline.deliveryDate && i.baseline.deliveryDate < asOf)
    return "Delayed";
  if (i.actual.castingDate) return "QC + Finishing";
  if (i.baseline.castingDate || i.revised.castingDate) return "Casting";
  return "Not Started";
}
export const tone = (s: string): string =>
  s === "Delivered"
    ? "delivered"
    : s === "Ready for Delivery"
      ? "ready"
      : /Waiting/.test(s)
        ? "waiting"
        : /Delayed|Rework|Risk/.test(s)
          ? "danger"
          : "planned";
export interface Filters {
  supplier?: string;
  type?: string;
  status?: string;
  search?: string;
  month?: string;
  from?: string;
  to?: string;
  delayed?: boolean;
}
export function filterItems(d: AppData, f: Filters, asOf: string): Item[] {
  return d.items.filter(
    (i) =>
      (!f.supplier || i.supplierId === f.supplier) &&
      (!f.type || i.itemType === f.type) &&
      (!f.status || status(i, d, asOf) === f.status) &&
      (!f.search ||
        `${i.id} ${i.description}`
          .toLowerCase()
          .includes(f.search.toLowerCase())) &&
      (!f.month || i.baseline.deliveryDate?.startsWith(f.month)) &&
      (!f.from ||
        (!!i.baseline.deliveryDate && i.baseline.deliveryDate >= f.from)) &&
      (!f.to ||
        (!!i.baseline.deliveryDate && i.baseline.deliveryDate <= f.to)) &&
      (!f.delayed || (delayDays(i, asOf) > 0 && !confirmed(i, d))),
  );
}
export interface Metrics {
  total: number;
  planned: number;
  delivered: number;
  achievement: number;
  completed: number;
  ready: number;
  waitingPair: number;
  waitingTruck: number;
  delayed: number;
  pairs: number;
}
export function metrics(d: AppData, items: Item[], asOf: string): Metrics {
  const planned = items.filter(
    (i) => i.baseline.deliveryDate && i.baseline.deliveryDate <= asOf,
  ).length;
  const delivered = items.filter(
    (i) => confirmed(i, d) && i.actual.deliveryDate! <= asOf,
  ).length;
  const count = (s: string): number =>
    items.filter((i) => status(i, d, asOf) === s).length;
  return {
    total: items.length,
    planned,
    delivered,
    achievement: planned ? (delivered / planned) * 100 : 0,
    completed: items.filter(productionComplete).length,
    ready: count("Ready for Delivery"),
    waitingPair: count("Waiting for Pair"),
    waitingTruck: count("Waiting for Truck"),
    delayed: items.filter((i) => delayDays(i, asOf) > 0 && !confirmed(i, d))
      .length,
    pairs: d.pairings.filter(
      (p) =>
        items.some((i) => i.id === p.loadId) &&
        [p.loadId, p.matchingId].every((id) => {
          const i = d.items.find((x) => x.id === id);
          return i && confirmed(i, d);
        }),
    ).length,
  };
}
export function curve(
  d: AppData,
  items: Item[],
  aggregation: "weekly" | "monthly",
  asOf: string,
): { label: string; planned: number; actual: number | null }[] {
  items = items.filter((i) => !!i.baseline.deliveryDate);
  const dates = items
    .flatMap((i) => [i.baseline.deliveryDate, i.actual.deliveryDate])
    .filter((s): s is string => !!s)
    .sort();
  if (!dates.length) return [];
  const start = dates[0].slice(0, 7);
  const end = dates[dates.length - 1].slice(0, 7);
  let month = start;
  const result = [];
  let guard = 0;
  while (month <= end && guard++ < 1200) {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const day of aggregation === "monthly"
      ? [last]
      : [7, 14, 21, 28, ...(last > 28 ? [last] : [])]) {
      const cutoff = `${month}-${String(day).padStart(2, "0")}`;
      const effective = cutoff > asOf ? asOf : cutoff;
      const actual = items.filter(
        (i) => confirmed(i, d) && i.actual.deliveryDate! <= effective,
      ).length;
      result.push({
        label:
          aggregation === "monthly" ? month : `${month} W${weekOf(cutoff)}`,
        planned: items.length
          ? (items.filter(
              (i) =>
                i.baseline.deliveryDate && i.baseline.deliveryDate <= cutoff,
            ).length /
              items.length) *
            100
          : 0,
        actual:
          cutoff.slice(0, 7) > asOf.slice(0, 7) ||
          (aggregation === "weekly" &&
            cutoff > asOf &&
            weekOf(cutoff) > weekOf(asOf))
            ? null
            : items.length
              ? (actual / items.length) * 100
              : 0,
      });
    }
    month = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  }
  return result;
}
