// @vitest-environment jsdom
import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PlanningCoordination from "../src/pages/PlanningCoordination/PlanningCoordination";
import { emptyData, makeItem } from "../src/models/schema";
import { curve } from "../src/domain/rules";

afterEach(cleanup);

it("counts monthly plans independently of actual deliveries, including when the delivered card moved months", () => {
  const data = emptyData();
  const early = makeItem("early", "LOAD");
  early.baseline.deliveryDate = "2026-12-17";
  early.actual.deliveryDate = "2026-11-17";
  const pending = makeItem("pending", "LOAD");
  pending.baseline.deliveryDate = "2026-12-22";
  const future = makeItem("future", "UNLOAD");
  future.baseline.deliveryDate = "2026-12-24";
  future.actual.deliveryDate = "2026-12-24";
  data.items = [early, pending, future];
  render(<PlanningCoordination data={data} items={data.items} asOf="2026-11-17"
    canWrite={true} busy={false} user="test" onDirty={vi.fn()} openItem={vi.fn()} save={vi.fn()} />);
  const november = screen.getByRole("rowheader", { name: /พฤศจิกายน 2569/ }).closest("tr")!;
  const december = screen.getByRole("rowheader", { name: /ธันวาคม 2569/ }).closest("tr")!;
  expect(within(november).getAllByRole("cell")[5].textContent).toBe("แผน0ส่งจริง1");
  expect(within(december).getAllByRole("cell")[5].textContent).toBe("แผน2ส่งจริง0");
  expect(within(december).getAllByRole("cell")[8].textContent).toBe("แผน1ส่งจริง0");
  fireEvent.change(screen.getByLabelText("เดือน"), { target: { value: "2026-12" } });
  const footer = screen.getByRole("table", { name: "แผนส่งมอบรายเดือนและสัปดาห์" }).querySelector("tfoot")!;
  expect(within(footer).getAllByRole("cell")[5].textContent).toBe("แผน2ส่งจริง0");
});

it("filters the board and totals by clickable status legend and toggles back to all", () => {
  const data = emptyData();
  const delivered = makeItem("delivered", "LOAD");
  delivered.baseline.deliveryDate = "2026-12-17";
  delivered.actual.deliveryDate = "2026-11-17";
  const planned = makeItem("planned", "UNLOAD");
  planned.baseline.deliveryDate = "2026-11-24";
  const delayed = makeItem("late", "BOTTOM");
  delayed.baseline.deliveryDate = "2026-11-10";
  data.items = [delivered, planned, delayed];
  render(<PlanningCoordination data={data} items={data.items} asOf="2026-11-17"
    canWrite={true} busy={false} user="test" onDirty={vi.fn()} openItem={vi.fn()} save={vi.fn()} />);
  const board = screen.getByRole("table", { name: "แผนส่งมอบรายเดือนและสัปดาห์" });
  const deliveredFilter = screen.getByRole("button", { name: "กรองสถานะ Delivered" });
  fireEvent.click(deliveredFilter);
  expect(deliveredFilter.getAttribute("aria-pressed")).toBe("true");
  expect(within(board).getByRole("button", { name: /delivered ✓ Delivered/ })).toBeTruthy();
  expect(within(board).queryByRole("button", { name: /planned Planned/ })).toBeNull();
  expect(within(board).getByRole("rowheader", { name: /รวมช่วงที่แสดง/ }).textContent).toBe("รวมช่วงที่แสดงแผน1ส่งจริง1");
  fireEvent.click(deliveredFilter);
  expect(within(board).getByRole("rowheader", { name: /รวมช่วงที่แสดง/ }).textContent).toBe("รวมช่วงที่แสดงแผน3ส่งจริง1");
  fireEvent.click(screen.getByRole("button", { name: "กรองสถานะ Planned / Expected" }));
  expect(within(board).getByRole("button", { name: /planned Planned/ })).toBeTruthy();
  expect(within(board).queryByRole("button", { name: /delivered ✓ Delivered/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "กรองสถานะ Delayed" }));
  expect(within(board).getByRole("button", { name: /late At Risk \/ Delayed/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "ทุกสถานะ", exact: true }));
  expect(within(board).getByRole("rowheader", { name: /รวมช่วงที่แสดง/ }).textContent).toBe("รวมช่วงที่แสดงแผน3ส่งจริง1");
});

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

  const w3 = screen.getByRole("button", { name: "W3 15–21" }).closest("td")!;
  const card = within(w3).getByRole("button", { name: /L1 ✓ Delivered Plan 20\/12\/69 \(Actual 17\/11\/69\)/ });
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
  const w4 = screen.getByRole("button", { name: "W4 22–28" }).closest("td")!;
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
  expect(within(screen.getByRole("table", { name: "แผนส่งมอบรายเดือนและสัปดาห์" })).getAllByRole("rowgroup")[1].querySelectorAll("tr").length).toBe(14);
  expect(screen.getByRole("rowheader", { name: /พฤศจิกายน 2569/ })).toBeTruthy();
  expect(screen.getByRole("rowheader", { name: /ธันวาคม 2570/ })).toBeTruthy();
  const decemberRow = screen.getByRole("rowheader", { name: /ธันวาคม 2570/ }).closest("tr")!;
  expect(within(decemberRow).getAllByRole("cell").slice(-4).map(cell => cell.textContent)).toEqual(["แผน1ส่งจริง0", "แผน0ส่งจริง0", "แผน0ส่งจริง0", "แผน0ส่งจริง0"]);
  expect(screen.getByRole("button", { name: /December-end.*31\/12\/2027/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /outside.*01\/01\/2028/ })).toBeNull();
  fireEvent.change(screen.getByLabelText("เดือน"), { target: { value: "2027-12" } });
  expect(within(screen.getByRole("table", { name: "แผนส่งมอบรายเดือนและสัปดาห์" })).getAllByRole("rowgroup")[1].querySelectorAll("tr").length).toBe(1);
  expect(screen.getAllByRole("button", { name: /^W[1-5] / }).length).toBe(5);
  fireEvent.click(screen.getByRole("button", { name: "แสดงทุกเดือน" }));
  expect(within(screen.getByRole("table", { name: "แผนส่งมอบรายเดือนและสัปดาห์" })).getAllByRole("rowgroup")[1].querySelectorAll("tr").length).toBe(14);
});
