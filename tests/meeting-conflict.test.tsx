// @vitest-environment jsdom
import * as React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PlanningCoordination from "../src/pages/PlanningCoordination/PlanningCoordination";
import { emptyData, makeItem } from "../src/models/schema";
afterEach(cleanup);
it("keeps meeting draft from overwriting a changed server action after conflict reload", () => {
  const data = emptyData();
  const i = makeItem("L-001", "LOAD");
  i.baseline.deliveryDate = "2026-11-20";
  data.items.push(i);
  data.meetingActions.push({
    id: "a",
    itemId: i.id,
    meetingDate: "2026-11-16",
    issue: "Delay",
    discussion: "",
    decision: "",
    action: "Call supplier",
    owner: "Buyer",
    dueDate: null,
    status: "Open",
    updatedBy: "buyer",
  });
  const save = vi.fn(async () => true);
  const p = {
    data,
    items: data.items,
    asOf: "2026-11-16",
    canWrite: true,
    busy: false,
    user: "buyer",
    save,
    openItem: vi.fn(),
    onDirty: vi.fn(),
  };
  const view = render(<PlanningCoordination {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "แก้ไข" }));
  fireEvent.change(screen.getByLabelText("Action Required"), {
    target: { value: "My local change" },
  });
  const latest = structuredClone(data);
  latest.meetingActions[0].action = "Other buyer change";
  view.rerender(<PlanningCoordination {...p} data={latest} />);
  fireEvent.click(screen.getByRole("button", { name: "บันทึก Meeting Action" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toMatch(/เปลี่ยน/);
});
