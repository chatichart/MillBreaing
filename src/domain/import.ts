import {
  AppData,
  Item,
  itemTypes,
  makeItem,
  validDate,
  dataSchema,
} from "../models/schema";
import { z } from "zod";
const rowSchema = z
  .object({
    id: z.string(),
    itemType: z.string(),
    description: z.string().optional(),
    supplierId: z.string().optional(),
    castingDate: z.string().optional(),
    finishingDate: z.string().optional(),
    qcDate: z.string().optional(),
    deliveryDate: z.string().optional(),
  })
  .strict();
const planDateKeys = [
  "castingDate",
  "finishingDate",
  "qcDate",
  "deliveryDate",
] as const;
export interface PlanRow {
  id: string;
  itemType: string;
  description?: string;
  supplierId?: string;
  castingDate?: string;
  finishingDate?: string;
  qcDate?: string;
  deliveryDate?: string;
}
export interface ImportPreview {
  rows: PlanRow[];
  errors: string[];
  warnings: string[];
}
export function previewImport(rows: PlanRow[], d: AppData): ImportPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r, n) => {
    const parsed = rowSchema.safeParse(r);
    if (!parsed.success) {
      errors.push(
        `Row ${n + 2}: ${parsed.error.issues.map((e) => e.message).join("; ")}`,
      );
      return;
    }
    const label = `Row ${n + 2} (${r.id})`;
    if (seen.has(r.id)) errors.push(`${label}: Duplicate ID`);
    seen.add(r.id);
    if (!itemTypes.includes(r.itemType as Item["itemType"])) {
      errors.push(`${label}: Invalid item type`);
      return;
    }
    const i = makeItem(r.id, r.itemType as Item["itemType"]);
    if (r.supplierId) i.supplierId = r.supplierId;
    i.description = r.description || "";
    let prev = "";
    for (const key of planDateKeys) {
      const value = r[key];
      if (value) {
        if (!validDate(value)) errors.push(`${label}: Invalid ${key}`);
        if (prev && value < prev) errors.push(`${label}: Date sequence ${key}`);
        prev = value;
        i.baseline[key] = value;
      }
    }
    if (!r.deliveryDate)
      warnings.push(
        `${label}: Missing delivery date; no date will be inferred`,
      );
    const temp = {
      ...d,
      items: [i],
      pairings: [],
      deliveryRecords: [],
      followUps: [],
      meetingActions: [],
      documentMetadata: [],
    };
    const v = dataSchema.safeParse(temp);
    if (!v.success)
      errors.push(...v.error.issues.map((e) => `${label}: ${e.message}`));
    const old = d.items.find((x) => x.id === r.id);
    if (old && old.itemType !== r.itemType)
      errors.push(`${label}: Permanent item type cannot change`);
  });
  return { rows, errors, warnings };
}
export function applyImport(
  d: AppData,
  p: ImportPreview,
  mode: "FORECAST" | "BASELINE",
  by: string,
  at: string,
  baselineReason = "",
): AppData {
  const checked = previewImport(p.rows, d);
  if (checked.errors.length) throw new Error(checked.errors.join("\n"));
  if (mode === "BASELINE" && !baselineReason.trim())
    throw new Error("Explicit baseline revision reason required");
  const next: AppData = JSON.parse(JSON.stringify(d));
  for (const r of p.rows) {
    let i = next.items.find((x) => x.id === r.id);
    const exists = !!i;
    if (!i) {
      i = makeItem(r.id, r.itemType as Item["itemType"]);
      next.items.push(i);
    }
    const before = JSON.stringify(i);
    if (r.description !== undefined) i.description = r.description;
    if (r.supplierId) i.supplierId = r.supplierId;
    for (const key of planDateKeys)
      if (r[key] !== undefined) {
        if (!exists || mode === "BASELINE") i.baseline[key] = r[key] || null;
        else {
          i.revised[key] = r[key] || null;
          if (key === "deliveryDate") i.revisedDeliveryDate = r[key] || null;
        }
      }
    i.updatedAt = at;
    i.updatedBy = by;
    next.auditEvents.push({
      id: crypto.randomUUID(),
      at,
      by,
      entityId: i.id,
      action:
        mode === "BASELINE"
          ? `Baseline revision: ${baselineReason}`
          : "Plan import / forecast revision",
      before,
      after: JSON.stringify(i),
    });
  }
  return dataSchema.parse(next);
}
