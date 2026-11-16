import { describe, it, expect } from "vitest";
import { emptyData, makeItem, dataSchema } from "../src/models/schema";
import {
  status,
  metrics,
  curve,
  delayDays,
  weekOf,
  pairReady,
  filterItems,
} from "../src/domain/rules";
import { previewImport, applyImport } from "../src/domain/import";

describe("Purchasing business rules", () => {
  it("never counts production completion as delivery", () => {
    const d = emptyData();
    const i = makeItem("L-001", "LOAD");
    d.items.push(i);
    i.baseline.deliveryDate = "2026-11-01";
    i.actual.finishingDate = "2026-10-30";
    i.actual.qcDate = "2026-10-30";
    i.qcStatus = "PASS";
    expect(metrics(d, d.items, "2026-11-16").delivered).toBe(0);
    expect(curve(d, d.items, "monthly", "2026-11-16")[0].actual).toBe(0);
  });
  it("requires readiness for Actual and rejects contradictory QC", () => {
    const d = emptyData();
    const i = makeItem("L-001", "LOAD");
    d.items.push(i);
    i.actual.deliveryDate = "2026-11-01";
    expect(dataSchema.safeParse(d).success).toBe(false);
    i.actual.finishingDate = "2026-10-30";
    i.actual.qcDate = "2026-10-30";
    i.qcStatus = "PASS";
    i.deliveryConfirmation = "POD-1";
    d.deliveryRecords.push({
      id: "r",
      itemId: i.id,
      date: "2026-11-01",
      confirmation: "POD-1",
    });
    expect(dataSchema.safeParse(d).success).toBe(true);
    expect(status(i, d, "2026-11-16")).toBe("Delivered");
    i.qcStatus = "FAIL";
    expect(dataSchema.safeParse(d).success).toBe(false);
  });
  it("checks all explicitly defined pairing dependencies", () => {
    const d = emptyData();
    d.items = ["L-001", "B-001", "A-001"].map((id, n) =>
      makeItem(id, ["LOAD", "BOTTOM", "AL_COVER"][n] as any),
    );
    d.items.slice(0, 2).forEach((i) => {
      i.actual.finishingDate = "2026-11-01";
      i.actual.qcDate = "2026-11-01";
      i.qcStatus = "PASS";
    });
    d.pairings = [
      { id: "p1", loadId: "L-001", matchingId: "B-001", type: "LOAD_BOTTOM" },
      { id: "p2", loadId: "L-001", matchingId: "A-001", type: "LOAD_COVER" },
    ];
    expect(pairReady(d.items[0], d)).toBe(false);
    expect(status(d.items[0], d, "2026-11-16")).toBe("Waiting for Pair");
    expect(status(d.items[1], d, "2026-11-16")).toBe("Waiting for Pair");
  });
  it("distinguishes truck waiting and baseline delay from a revised forecast", () => {
    const d = emptyData();
    const i = makeItem("U-001", "UNLOAD");
    d.items.push(i);
    i.baseline.deliveryDate = "2026-11-01";
    i.revisedDeliveryDate = "2026-11-20";
    expect(delayDays(i, "2026-11-16")).toBe(19);
    i.actual.finishingDate = "2026-11-01";
    i.actual.qcDate = "2026-11-01";
    i.qcStatus = "PASS";
    i.actual.readyDate = "2026-11-02";
    i.waitingForTruck = true;
    expect(status(i, d, "2026-11-16")).toBe("Waiting for Truck");
  });
  it("uses fixed W1-W5 buckets and consistent filtered denominator", () => {
    expect(
      [1, 7, 8, 14, 15, 21, 22, 28, 29, 30].map((n) =>
        weekOf(`2026-11-${String(n).padStart(2, "0")}`),
      ),
    ).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    const d = emptyData();
    d.items = [makeItem("L-001", "LOAD"), makeItem("U-001", "UNLOAD")];
    d.items[0].baseline.deliveryDate = "2026-11-01";
    d.items[1].baseline.deliveryDate = "2026-12-01";
    const items = filterItems(d, { supplier: "SUP-001" }, "2026-11-16");
    expect(curve(d, items, "monthly", "2026-11-16")[0].planned).toBe(100);
  });
});
describe("plan imports", () => {
  it("reports duplicates, invalid dates, and type/prefix mismatch without guessing", () => {
    const p = previewImport(
      [
        { id: "L-001", itemType: "LOAD", deliveryDate: "2026-02-30" },
        { id: "L-001", itemType: "BOTTOM" },
      ],
      emptyData(),
    );
    expect(p.errors.length).toBeGreaterThanOrEqual(2);
  });
  it("preserves Actual and baseline when applying a forecast revision", () => {
    const d = emptyData();
    const i = makeItem("L-001", "LOAD");
    i.baseline.deliveryDate = "2026-11-01";
    i.actual.castingDate = "2026-10-01";
    d.items.push(i);
    const p = previewImport(
      [{ id: "L-001", itemType: "LOAD", deliveryDate: "2026-12-01" }],
      d,
    );
    const next = applyImport(d, p, "FORECAST", "user", "2026-11-16");
    expect(next.items[0].baseline.deliveryDate).toBe("2026-11-01");
    expect(next.items[0].actual.castingDate).toBe("2026-10-01");
    expect(next.items[0].revisedDeliveryDate).toBe("2026-12-01");
  });
});
