// @vitest-environment jsdom
import * as React from "react";
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import App from "../src/components/App";
import { Repository, Snapshot } from "../src/repositories/types";
import { emptyData, makeItem } from "../src/models/schema";
afterEach(cleanup);
it("allows leaving Item Detail without saving and restores the unsaved draft on return", async () => {
  render(<App repository={repository()} user="purchasing" />);
  await screen.findByText("Delivery S-Curve");
  fireEvent.click(screen.getByRole("button", { name: /Supplier Tracking/ }));
  fireEvent.click(screen.getByRole("button", { name: "L-001" }));
  fireEvent.change(await screen.findByLabelText("Purchasing Remark"), {
    target: { value: "Unsaved draft to keep" },
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
  expect(
    screen.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeTruthy();
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Item Detail/ }));
  expect(
    (screen.getByLabelText("Purchasing Remark") as HTMLInputElement).value,
  ).toBe("Unsaved draft to keep");
  confirm.mockRestore();
});
function repository(readOnly = false, fail = false): Repository {
  const data = emptyData();
  const i = makeItem("L-001", "LOAD");
  i.baseline.deliveryDate = "2026-11-20";
  data.items.push(i);
  let snapshot: Snapshot = { data, token: JSON.stringify(data) };
  return {
    mode: "sharepoint",
    load: async () => snapshot,
    canWrite: async () => !readOnly,
    upload: async () => "/documents/L-001/test.pdf",
    save: async (_base, next) => {
      if (fail) throw new Error("SharePoint 403 rejected write");
      snapshot = { data: next, token: JSON.stringify(next) };
      return snapshot;
    },
  };
}
it("navigates all four pages and saves a real follow-up without inventing Actual", async () => {
  render(<App repository={repository()} user="purchasing" />);
  await screen.findByText("Delivery S-Curve");
  fireEvent.click(screen.getByRole("button", { name: /Supplier Tracking/ }));
  fireEvent.click(screen.getByRole("button", { name: "L-001" }));
  const feedback = await screen.findByLabelText(
    "Supplier feedback / Follow-up",
  );
  fireEvent.change(feedback, {
    target: { value: "Supplier called; follow up next week" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Update" }));
  await screen.findByText("SharePoint ยืนยันการบันทึกแล้ว");
  expect(screen.getByText("Supplier called; follow up next week")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: /Planning Coordination/ }),
  );
  await screen.findByText("Weekly Delivery Control Board");
  expect(screen.getAllByText(/Actual Delivered/).length).toBeGreaterThan(0);
});
it("keeps draft and never announces success when persistence fails", async () => {
  render(<App repository={repository(false, true)} user="purchasing" />);
  await screen.findByText("Delivery S-Curve");
  fireEvent.click(screen.getByRole("button", { name: /Supplier Tracking/ }));
  fireEvent.click(screen.getByRole("button", { name: "L-001" }));
  fireEvent.change(
    await screen.findByLabelText("Supplier feedback / Follow-up"),
    { target: { value: "Keep my draft" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Save Update" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("SharePoint ยืนยันการบันทึกแล้ว")).toBeNull();
  expect(
    (
      screen.getByLabelText(
        "Supplier feedback / Follow-up",
      ) as HTMLTextAreaElement
    ).value,
  ).toBe("Keep my draft");
});
it("disables protected controls for a SharePoint reader", async () => {
  render(<App repository={repository(true)} user="reader" />);
  await screen.findByText("Delivery S-Curve");
  fireEvent.click(screen.getByRole("button", { name: /Supplier Tracking/ }));
  fireEvent.click(screen.getByRole("button", { name: "L-001" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Save Update" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true),
  );
  expect(
    (screen.getByLabelText("QC Result") as HTMLSelectElement).disabled,
  ).toBe(true);
});
it("preserves meeting drafts on navigation and handles cleared text fields", async () => {
  render(<App repository={repository()} user="purchasing" />);
  await screen.findByText("Delivery S-Curve");
  fireEvent.click(
    screen.getByRole("button", { name: /Planning Coordination/ }),
  );
  fireEvent.change(screen.getByLabelText("New meeting item"), {
    target: { value: "L-001" },
  });
  fireEvent.change(screen.getByLabelText("Responsible Person"), {
    target: { value: "Buyer" },
  });
  fireEvent.change(screen.getByLabelText("Responsible Person"), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText("Discussion"), {
    target: { value: "test" },
  });
  fireEvent.change(screen.getByLabelText("Discussion"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "บันทึก Meeting Action" }));
  await screen.findByText("กรุณาระบุผู้รับผิดชอบ Action และ Meeting Date");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
  expect(confirm).toHaveBeenCalled();
  expect(screen.getByLabelText("Responsible Person")).toBeTruthy();
  confirm.mockRestore();
});
