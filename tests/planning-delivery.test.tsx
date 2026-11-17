// @vitest-environment jsdom
import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PlanningCoordination from "../src/pages/PlanningCoordination/PlanningCoordination";
import { emptyData, makeItem } from "../src/models/schema";
import { curve } from "../src/domain/rules";

afterEach(cleanup);

it("places a November 17 actual in W3 despite a later plan and counts the same delivery as S-Curve", () => {
  const data = emptyData();
  const delivered = makeItem("L1", "LOAD");
  delivered.baseline.deliveryDate = "2026-12-20";
  delivered.revisedDeliveryDate = "2027-01-10";
  delivered.actual.deliveryDate = "2026-11-17";
  data.items = [delivered, ...Array.from({ length: 16 }, (_, n) => {
    const item = makeItem(`L${n + 2}`, "LOAD");
    item.baseline.deliveryDate = "2027-04-20";
    return item;
  })];
  const openItem = vi.fn();
  render(<PlanningCoordination data={data} items={data.items} asOf="2026-11-17"
    canWrite={true} busy={false} user="test" onDirty={vi.fn()} openItem={openItem} save={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("เดือน"), { target: { value: "2026-11" } });

  const w3 = screen.getByRole("button", { name: "W3 15–21" }).closest("section")!;
  const card = within(w3).getByRole("button", { name: /L1 ✓ Delivered \(Actual 17\/11\/69\)/ });
  fireEvent.click(card);
  expect(openItem).toHaveBeenCalledWith("L1");
  expect(screen.getByText("Actual Delivered").parentElement!.textContent).toBe("Actual Delivered1");
  expect(screen.getByText("แผนส่งมอบเดือนนี้").parentElement!.textContent).toBe("แผนส่งมอบเดือนนี้0");
  expect(curve(data, data.items, "weekly", "2026-11-17").find(p => p.label === "2026-11 W3")!.actual).toBeCloseTo(100 / 17);

  fireEvent.click(screen.getByRole("button", { name: "W3 15–21" }));
  const row = screen.getAllByRole("button", { name: "L1" })
    .map(button => button.closest("tr")).find(Boolean)!;
  expect(within(row).getByText("17/11/2026")).toBeTruthy();
  expect(within(row).getByText("10/01/2027")).toBeTruthy();
  // The delivered item must not reappear in its forecast month.
  fireEvent.change(screen.getByLabelText("เดือน"), { target: { value: "2027-01" } });
  expect(screen.queryByRole("button", { name: /L1 ✓ Delivered/ })).toBeNull();
  expect(screen.getByText("Actual Delivered").parentElement!.textContent).toBe("Actual Delivered0");
});

it("keeps undelivered items on their plan dates and excludes deliveries from another month", () => {
  const data = emptyData();
  const planned = makeItem("planned", "LOAD");
  planned.baseline.deliveryDate = "2026-12-01";
  planned.revisedDeliveryDate = "2026-11-24";
  const previous = makeItem("previous", "LOAD");
  previous.baseline.deliveryDate = "2026-11-17";
  previous.actual.deliveryDate = "2026-10-30";
  data.items = [planned, previous];
  render(<PlanningCoordination data={data} items={data.items} asOf="2026-11-17"
    canWrite={true} busy={false} user="test" onDirty={vi.fn()} openItem={vi.fn()} save={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("เดือน"), { target: { value: "2026-11" } });
  const w4 = screen.getByRole("button", { name: "W4 22–28" }).closest("section")!;
  expect(within(w4).getByRole("button", { name: /planned.*24\/11\/2026/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /previous ✓ Delivered/ })).toBeNull();
  expect(screen.getByText("Actual Delivered").parentElement!.textContent).toBe("Actual Delivered0");
  expect(screen.getByText("แผนส่งมอบเดือนนี้").parentElement!.textContent).toBe("แผนส่งมอบเดือนนี้2");
});

it("shows every month through December 2570 by default and collapses to a selected month", () => {
  const data = emptyData();
  const last = makeItem("December-end", "LOAD");
  last.baseline.deliveryDate = "2027-12-31";
  const outside = makeItem("outside", "LOAD");
  outside.baseline.deliveryDate = "2028-01-01";
  data.items = [last, outside];
  render(<PlanningCoordination data={data} items={data.items} asOf="2026-11-17"
    canWrite={true} busy={false} user="test" onDirty={vi.fn()} openItem={vi.fn()} save={vi.fn()} />);
  expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(14);
  expect(screen.getByRole("heading", { name: "พฤศจิกายน 2569" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "ธันวาคม 2570" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /December-end.*31\/12\/2027/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /outside.*01\/01\/2028/ })).toBeNull();
  fireEvent.change(screen.getByLabelText("เดือน"), { target: { value: "2027-12" } });
  expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(1);
  expect(screen.getAllByRole("button", { name: /^W[1-5] / }).length).toBe(5);
  fireEvent.change(screen.getByLabelText("เดือน"), { target: { value: "" } });
  expect(screen.getAllByRole("heading", { level: 3 }).length).toBe(14);
});
