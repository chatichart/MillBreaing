import {
  AppData,
  Item,
  emptyData,
  makeItem,
  typeLabels,
} from "../models/schema";
// Counts confirmed by Purchasing. Never infer dates, Actual or pairing from the image.
export const INITIAL_QUANTITIES: {
  type: Item["itemType"];
  prefix: string;
  count: number;
}[] = [
  { type: "LOAD", prefix: "L", count: 50 },
  { type: "BOTTOM", prefix: "B", count: 10 },
  { type: "AL_COVER", prefix: "A", count: 20 },
  { type: "UNLOAD", prefix: "U", count: 20 },
];
export const INITIAL_COUNTS_ACTION =
  "Initialize user-confirmed quantities: LOAD 50, BOTTOM 10, AL_COVER 20, UNLOAD 20";
export function addInitialItems(data: AppData): AppData {
  const next: AppData = JSON.parse(JSON.stringify(data));
  const ids = new Set(next.items.map((i) => i.id));
  for (const group of INITIAL_QUANTITIES)
    for (let n = 1; n <= group.count; n++) {
      const id = `${group.prefix}-${String(n).padStart(3, "0")}`;
      if (ids.has(id)) continue;
      const item = makeItem(id, group.type);
      item.description = `${typeLabels[group.type]} #${String(n).padStart(2, "0")}`;
      next.items.push(item);
      ids.add(id);
    }
  return next;
}
export function initialData(): AppData {
  return addInitialItems(emptyData());
}
