// @vitest-environment jsdom
import * as React from "react";
import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import App from "../src/components/App";
import { emptyData, makeItem, dataSchema } from "../src/models/schema";
import { status, metrics } from "../src/domain/rules";
afterEach(cleanup);
it("has no Drawing stage or detailed Delivery fields and records Actual directly", async () => {
  const data = emptyData();
  const i = makeItem("L-001", "LOAD");
  i.baseline.castingDate = "2026-11-01";
  data.items.push(i);
  const snap = { data, token: JSON.stringify(data) };
  render(
    <App
      repository={{
        mode: "sharepoint",
        load: async () => snap,
        canWrite: async () => true,
        save: async (_s, d) => ({ data: d, token: JSON.stringify(d) }),
        upload: async () => "",
      }}
      user="purchasing"
    />,
  );
  await screen.findByText("Delivery S-Curve");
  fireEvent.click(screen.getByRole("button", { name: /Supplier Tracking/ }));
  expect(screen.queryByText("Drawing Plan / Actual")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "L-001" }));
  expect(await screen.findByLabelText("Delivery Plan")).toBeTruthy();
  expect(screen.getByLabelText("Delivery Actual")).toBeTruthy();
  for (const label of [
    "Delivery Confirmation Reference",
    "Delivery Note No.",
    "Supplier Confirmed Delivery",
    "Planned Truck Pickup",
    "Actual Dispatch / Pickup",
    "Drawing Remark",
  ])
    expect(screen.queryByLabelText(label)).toBeNull();
  expect(status(i, data, "2026-11-01")).toBe("Casting");
  i.actual.finishingDate = "2026-11-01";
  i.actual.qcDate = "2026-11-01";
  i.qcStatus = "PASS";
  i.actual.deliveryDate = "2026-11-02";
  expect(dataSchema.safeParse(data).success).toBe(true);
  expect(metrics(data, [i], "2026-11-16").delivered).toBe(1);
});
