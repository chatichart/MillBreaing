import { it, expect } from "vitest";
import { emptyData, makeItem, dataSchema } from "../src/models/schema";
import { previewImport, applyImport } from "../src/domain/import";
import { csvCell } from "../src/services/export";
import { curve } from "../src/domain/rules";
it("excludes undated items from both sides of baseline S-Curve denominator", () => {
  const d = emptyData();
  d.items = [makeItem("L-001", "LOAD"), makeItem("U-001", "UNLOAD")];
  d.items[0].baseline.deliveryDate = "2026-11-01";
  expect(curve(d, d.items, "monthly", "2026-11-16")[0].planned).toBe(100);
});
it("rejects shipment while any configured pairing dependency is unready", () => {
  const d = emptyData();
  const load = makeItem("L-001", "LOAD"),
    bottom = makeItem("B-001", "BOTTOM");
  d.items.push(load, bottom);
  d.pairings.push({
    id: "p",
    loadId: load.id,
    matchingId: bottom.id,
    type: "LOAD_BOTTOM",
  });
  load.actual.finishingDate = "2026-11-01";
  load.actual.qcDate = "2026-11-01";
  load.qcStatus = "PASS";
  load.actual.deliveryDate = "2026-11-02";
  expect(dataSchema.safeParse(d).success).toBe(false);
});
it("requires explicit reason for baseline revision", () => {
  const d = emptyData();
  expect(() =>
    applyImport(
      d,
      previewImport([{ id: "L-001", itemType: "LOAD" }], d),
      "BASELINE",
      "user",
      "2026-11-16",
    ),
  ).toThrow(/reason/);
});
it("requires a ready date before recording waiting for truck", () => {
  const d = emptyData(),
    i = makeItem("U-001", "UNLOAD");
  d.items.push(i);
  i.actual.finishingDate = "2026-11-01";
  i.actual.qcDate = "2026-11-01";
  i.qcStatus = "PASS";
  i.waitingForTruck = true;
  expect(dataSchema.safeParse(d).success).toBe(false);
  i.actual.readyDate = "2026-11-02";
  expect(dataSchema.safeParse(d).success).toBe(true);
});
it("rejects non-row import objects rather than crashing or accepting unknown actual fields", () => {
  expect(
    previewImport(
      [
        null as any,
        {
          id: "L-001",
          itemType: "LOAD",
          actual: { deliveryDate: "2026-11-01" },
        } as any,
      ],
      emptyData(),
    ).errors.length,
  ).toBeGreaterThan(0);
});
it("escapes CSV formulas and embedded quotes", () => {
  expect(csvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"');
});
