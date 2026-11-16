// @vitest-environment jsdom
import * as React from "react";
import { it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
} from "@testing-library/react";
import App from "../src/components/App";
import { emptyData, makeItem } from "../src/models/schema";
afterEach(cleanup);
function setup(withRevision = false) {
  const data = emptyData();
  data.items = [
    makeItem("L-001", "LOAD"),
    makeItem("B-001", "BOTTOM"),
    makeItem("L-002", "LOAD"),
  ];
  if (withRevision) {
    data.items[0].baseline.deliveryDate = "2026-11-10";
    data.items[0].revisedDeliveryDate = "2026-11-20";
  }
  const save = vi.fn(async (_base, next) => ({
    data: next,
    token: JSON.stringify(next),
  }));
  render(
    <App
      user="buyer"
      repository={{
        mode: "sharepoint",
        load: async () => ({ data, token: JSON.stringify(data) }),
        canWrite: async () => true,
        save,
        upload: async () => "",
      }}
    />,
  );
  return { save };
}
it("edits the Original delivery baseline without deleting an existing supplier revision", async () => {
  const { save } = setup(true);
  await screen.findByText("Delivery S-Curve");
  fireEvent.click(screen.getByRole("button", { name: /Item Detail/ }));
  fireEvent.change(screen.getByLabelText("เลือกรายการ"), {
    target: { value: "L-001" },
  });
  const plan = await screen.findByLabelText("Delivery Plan");
  expect((plan as HTMLInputElement).value).toBe("10/11/2026");
  fireEvent.change(plan, { target: { value: "11/11/2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Update" }));
  await screen.findByText("SharePoint ยืนยันการบันทึกแล้ว");
  expect(save.mock.calls[0][1].items[0].revisedDeliveryDate).toBe("2026-11-20");
});
it("filters the Item Detail selector by product type and protects unsaved dates", async () => {
  setup();
  await screen.findByText("Delivery S-Curve");
  fireEvent.click(screen.getByRole("button", { name: /Item Detail/ }));
  fireEvent.change(screen.getByLabelText("ประเภทสินค้า"), {
    target: { value: "LOAD" },
  });
  const items = screen.getByLabelText("เลือกรายการ");
  expect(within(items).queryByRole("option", { name: "B-001" })).toBeNull();
  expect(within(items).getByRole("option", { name: "L-002" })).toBeTruthy();
  fireEvent.change(items, { target: { value: "L-001" } });
  fireEvent.change(await screen.findByLabelText("Casting Original"), {
    target: { value: "01/11/2026" },
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.change(screen.getByLabelText("ประเภทสินค้า"), {
    target: { value: "BOTTOM" },
  });
  expect(confirm).toHaveBeenCalled();
  expect(
    (screen.getByLabelText("Casting Original") as HTMLInputElement).value,
  ).toBe("01/11/2026");
  confirm.mockRestore();
});
it("saves entered Original dates and Delivery Plan as baseline with audit, leaving Actual empty", async () => {
  const { save } = setup();
  await screen.findByText("Delivery S-Curve");
  fireEvent.click(screen.getByRole("button", { name: /Item Detail/ }));
  fireEvent.change(screen.getByLabelText("เลือกรายการ"), {
    target: { value: "L-001" },
  });
  fireEvent.change(await screen.findByLabelText("Casting Original"), {
    target: { value: "01/11/2026" },
  });
  fireEvent.change(screen.getByLabelText("Finishing Original"), {
    target: { value: "05/11/2026" },
  });
  fireEvent.change(screen.getByLabelText("QC Original"), {
    target: { value: "06/11/2026" },
  });
  fireEvent.change(screen.getByLabelText("Delivery Plan"), {
    target: { value: "10/11/2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Update" }));
  await screen.findByText("SharePoint ยืนยันการบันทึกแล้ว");
  const next = save.mock.calls[0][1];
  expect(next.items[0].baseline).toMatchObject({
    castingDate: "2026-11-01",
    finishingDate: "2026-11-05",
    qcDate: "2026-11-06",
    deliveryDate: "2026-11-10",
  });
  expect(next.items[0].actual.deliveryDate).toBeNull();
  expect(next.auditEvents[0].before).not.toEqual(next.auditEvents[0].after);
});
