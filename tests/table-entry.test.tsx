// @vitest-environment jsdom
import * as React from "react";
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import App from "../src/components/App";
import { emptyData, makeItem } from "../src/models/schema";
afterEach(cleanup);
it("bulk edits only four original dates in Table View and saves ISO without changing Actual", async () => {
  const data = emptyData();
  data.items = [makeItem("L-001", "LOAD"), makeItem("U-001", "UNLOAD")];
  const save = vi.fn(async (_s, next) => ({
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
  await screen.findByText("Delivery S-Curve");
  fireEvent.click(screen.getByRole("button", { name: /Item Detail/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "Table View", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("L-001 Casting Original"), {
    target: { value: "01/12/2026" },
  });
  fireEvent.change(screen.getByLabelText("L-001 Delivery Plan"), {
    target: { value: "20/12/2026" },
  });
  fireEvent.change(screen.getByLabelText("U-001 Delivery Plan"), {
    target: { value: "25/12/2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: /บันทึก Original/ }));
  await screen.findByText("SharePoint ยืนยันการบันทึกแล้ว");
  const next = save.mock.calls[0][1];
  expect(next.items[0].baseline.castingDate).toBe("2026-12-01");
  expect(next.items[1].baseline.deliveryDate).toBe("2026-12-25");
  expect(next.items.every((i) => i.actual.deliveryDate === null)).toBe(true);
  fireEvent.change(screen.getByLabelText("L-001 Casting Original"), {
    target: { value: "31/02/2026" },
  });
  fireEvent.change(screen.getByLabelText("U-001 Delivery Plan"), {
    target: { value: "26/12/2026" },
  });
  fireEvent.click(screen.getByRole("button", { name: /บันทึก Original/ }));
  expect(save).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิกการแก้ไขตาราง" }));
  expect(
    (screen.getByLabelText("L-001 Casting Original") as HTMLInputElement).value,
  ).toBe("01/12/2026");
});
