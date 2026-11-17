import { z } from "zod";

export const itemTypes = ["LOAD", "BOTTOM", "AL_COVER", "UNLOAD"] as const;
export const typeLabels = {
  LOAD: "Load Half Bearing",
  BOTTOM: "Bottom Half Bearing",
  AL_COVER: "AL Cover",
  UNLOAD: "Unload Half Bearing",
};
export const supplierFor = (type: string): string =>
  type === "UNLOAD" ? "SUP-002" : "SUP-001";
export const validDate = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const date = z.string().refine(validDate, "วันที่ไม่ถูกต้อง (YYYY-MM-DD)").nullable();
const text = z.string().max(4000).nullable();
// Legacy Drawing and detailed Delivery values are optional for lossless reading of earlier drafts only.
const baseline = z
  .object({
    drawingDate: date.optional(),
    castingDate: date,
    finishingDate: date,
    qcDate: date,
    deliveryDate: date,
  })
  .strict();
export const itemSchema = z
  .object({
    id: z.string().regex(/^[LBAU]-\d{3,}$/),
    itemType: z.enum(itemTypes),
    description: z.string().max(1000),
    supplierId: z.string(),
    baseline,
    revised: baseline,
    actual: z
      .object({
        drawingDate: date.optional(),
        castingDate: date,
        finishingDate: date,
        qcDate: date,
        readyDate: date,
        dispatchDate: date.optional(),
        deliveryDate: date,
      })
      .strict(),
    qcStatus: z.enum(["PENDING", "PASS", "FAIL", "REWORK"]),
    qcRemark: text,
    drawingRemark: text.optional(),
    castingRemark: text,
    revisedDeliveryDate: date,
    supplierConfirmedDate: date.optional(),
    plannedPickupDate: date.optional(),
    waitingForTruck: z.boolean(),
    deliveryNote: text.optional(),
    deliveryConfirmation: text.optional(),
    truckRemark: text.optional(),
    deliveryRemark: text.optional(),
    delayStage: text,
    delayCategory: text,
    delayReason: text,
    revisedTargetDate: date,
    followUpAction: text,
    purchasingRemark: text,
    planningRemark: text,
    lastFollowUpDate: date,
    nextFollowUpDate: date,
    createdAt: z.string(),
    updatedAt: text,
    updatedBy: text,
  })
  .strict();
export type Item = z.infer<typeof itemSchema>;
const actionSchema = z
  .object({
    id: z.string(),
    itemId: z.string(),
    meetingDate: z.string().refine(validDate),
    issue: z.string(),
    discussion: z.string(),
    decision: z.string(),
    action: z.string(),
    owner: z.string(),
    dueDate: date,
    status: z.enum(["Open", "In Progress", "Completed", "Cancelled"]),
    updatedBy: z.string(),
  })
  .strict();
export type MeetingAction = z.infer<typeof actionSchema>;
export const documentKinds = [
  "MATERIAL_CERT",
  "QC_DIMENSION",
  "DELIVERY_NOTE",
  "OTHER",
] as const;
export const baseDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    project: z.object({ id: z.literal("MILL-BEARING"), name: z.string() }),
    suppliers: z.array(z.object({ id: z.string(), name: z.string() })),
    items: z.array(itemSchema),
    pairings: z.array(
      z
        .object({
          id: z.string(),
          loadId: z.string(),
          matchingId: z.string(),
          type: z.enum(["LOAD_BOTTOM", "LOAD_COVER", "EXPLICIT"]),
        })
        .strict(),
    ),
    deliveryRecords: z.array(
      z
        .object({
          id: z.string(),
          itemId: z.string(),
          date: z.string().refine(validDate),
          confirmation: z.string().optional(),
          recordedBy: z.string().optional(),
        })
        .strict(),
    ),
    followUps: z.array(
      z
        .object({
          id: z.string(),
          itemId: z.string(),
          date: z.string().refine(validDate),
          stage: z.string(),
          feedback: z.string(),
          delayReason: text,
          revisedTarget: date,
          action: z.string(),
          nextDate: date,
          by: z.string(),
        })
        .strict(),
    ),
    meetingActions: z.array(actionSchema),
    documentMetadata: z.array(
      z
        .object({
          id: z.string(),
          itemId: z.string(),
          kind: z.enum([...documentKinds, "DRAWING"]),
          revision: z.string().min(1),
          name: z.string(),
          url: z
            .string()
            .refine(
              (v) =>
                v.startsWith("/") && !v.startsWith("//") && !/[\\\r\n]/.test(v),
              "Server-relative document URL required",
            ),
          uploadedAt: z.string(),
          uploadedBy: z.string(),
        })
        .strict(),
    ),
    auditEvents: z.array(
      z
        .object({
          id: z.string(),
          at: z.string(),
          by: z.string(),
          entityId: z.string(),
          action: z.string(),
          before: z.string(),
          after: z.string(),
        })
        .strict(),
    ),
    settings: z
      .object({
        requireDocumentsForReady: z.boolean(),
        requireDocumentsForDelivery: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type AppData = z.infer<typeof baseDataSchema>;
export const dataSchema = baseDataSchema.superRefine((d, ctx) => {
  const issue = (message: string): void =>
    ctx.addIssue({ code: "custom", message });
  for (const key of [
    "items",
    "suppliers",
    "pairings",
    "deliveryRecords",
    "followUps",
    "meetingActions",
    "documentMetadata",
    "auditEvents",
  ] as const) {
    const ids = d[key].map((v) => v.id);
    if (new Set(ids).size !== ids.length) issue(`Duplicate ${key} ID`);
  }
  const ids = new Set(d.items.map((i) => i.id));
  const hasDocs = (id: string): boolean =>
    ["MATERIAL_CERT", "QC_DIMENSION"].every((kind) =>
      d.documentMetadata.some((m) => m.itemId === id && m.kind === kind),
    );
  for (const i of d.items) {
    if (
      i.id[0] !==
      { LOAD: "L", BOTTOM: "B", AL_COVER: "A", UNLOAD: "U" }[i.itemType]
    )
      issue(`${i.id}: Item type / prefix mismatch`);
    if (!d.suppliers.some((s) => s.id === i.supplierId))
      issue(`${i.id}: Unknown supplier`);
    const ready =
      !!i.actual.finishingDate && !!i.actual.qcDate && i.qcStatus === "PASS";
    if (
      !i.actual.deliveryDate && (i.actual.readyDate || i.waitingForTruck) &&
      !ready
    )
      issue(`${i.id}: ต้อง Finishing เสร็จและ QC Pass ก่อนจัดส่ง`);
    if (
      !i.actual.deliveryDate && i.actual.readyDate &&
      d.settings.requireDocumentsForReady &&
      !hasDocs(i.id)
    )
      issue(`${i.id}: Required documents missing`);
    // Delivery Actual records an observed delivery independently of production/QC/documents.
    for (const group of [i.baseline, i.revised, i.actual]) {
      const sequence = [
        "castingDate",
        "finishingDate",
        "qcDate",
        "readyDate",
        "deliveryDate",
      ];
      let previous = "";
      for (const key of sequence) {
        const value = (group as unknown as Record<string, string | null>)[key];
        if (value) {
          if (previous && value < previous)
            issue(`${i.id}: Date sequence invalid (${key})`);
          previous = value;
        }
      }
    }
    if (i.waitingForTruck && i.actual.deliveryDate)
      issue(`${i.id}: Delivered item cannot be waiting for truck`);
    if (i.waitingForTruck && !i.actual.readyDate)
      issue(`${i.id}: กรุณาระบุ Ready for Delivery Date ก่อนเลือกรอรถรับ`);
  }
  for (const p of d.pairings) {
    const a = d.items.find((i) => i.id === p.loadId),
      b = d.items.find((i) => i.id === p.matchingId);
    if (!a || !b || a.id === b.id) issue(`${p.id}: Invalid pairing`);
    if (
      p.type !== "EXPLICIT" &&
      (a?.itemType !== "LOAD" ||
        b?.itemType !== (p.type === "LOAD_BOTTOM" ? "BOTTOM" : "AL_COVER"))
    )
      issue(`${p.id}: Pair type mismatch`);
  }
  for (const i of d.items) {
    if (!i.waitingForTruck || i.actual.deliveryDate) continue;
    const group = new Set([i.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of d.pairings)
        if (group.has(p.loadId) || group.has(p.matchingId))
          for (const id of [p.loadId, p.matchingId])
            if (!group.has(id)) {
              group.add(id);
              changed = true;
            }
    }
    if (
      d.items.some(
        (x) =>
          group.has(x.id) &&
          (!x.actual.finishingDate ||
            !x.actual.qcDate ||
            x.qcStatus !== "PASS" ||
            (d.settings.requireDocumentsForReady && !hasDocs(x.id))),
      )
    )
      issue(`${i.id}: Pair dependencies are not ready for shipment`);
  }
  for (const key of [
    "deliveryRecords",
    "followUps",
    "meetingActions",
    "documentMetadata",
  ] as const)
    for (const row of d[key])
      if (!ids.has(row.itemId)) issue(`${key}: Unknown item ${row.itemId}`);
});
export function emptyData(): AppData {
  return {
    schemaVersion: 1,
    revision: 0,
    project: { id: "MILL-BEARING", name: "Mill Bearing Supplier Tracking" },
    suppliers: [
      { id: "SUP-001", name: "สยาม สิริพลัส" },
      { id: "SUP-002", name: "เอส.เจ เมทัลเวิร์ค" },
    ],
    items: [],
    pairings: [],
    deliveryRecords: [],
    followUps: [],
    meetingActions: [],
    documentMetadata: [],
    auditEvents: [],
    settings: {
      requireDocumentsForReady: false,
      requireDocumentsForDelivery: false,
    },
  };
}
export function makeItem(id: string, itemType: Item["itemType"]): Item {
  const dates = {
    castingDate: null,
    finishingDate: null,
    qcDate: null,
    deliveryDate: null,
  };
  return {
    id,
    itemType,
    description: "",
    supplierId: supplierFor(itemType),
    baseline: { ...dates },
    revised: { ...dates },
    actual: { ...dates, readyDate: null },
    qcStatus: "PENDING",
    qcRemark: null,
    castingRemark: null,
    revisedDeliveryDate: null,
    waitingForTruck: false,
    delayStage: null,
    delayCategory: null,
    delayReason: null,
    revisedTargetDate: null,
    followUpAction: null,
    purchasingRemark: null,
    planningRemark: null,
    lastFollowUpDate: null,
    nextFollowUpDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    updatedBy: null,
  };
}
