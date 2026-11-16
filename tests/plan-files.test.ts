import { it, expect } from "vitest";
import Excel from "exceljs";
import { readPlanFile } from "../src/services/planFiles";
it("reads CSV and real XLSX date cells into reviewed normalized plan rows", async () => {
  const csv = new File(
    ["id,itemType,deliveryDate\r\nL-001,LOAD,2026-11-20\r\n"],
    "plan.csv",
  );
  expect((await readPlanFile(csv))[0].deliveryDate).toBe("2026-11-20");
  const book = new Excel.Workbook();
  const sheet = book.addWorksheet("Plan");
  sheet.addRow(["id", "itemType", "deliveryDate"]);
  sheet.addRow(["U-001", "UNLOAD", new Date("2026-11-20T00:00:00Z")]);
  const bytes = await book.xlsx.writeBuffer();
  const f = new File([new Uint8Array(bytes as ArrayBuffer)], "plan.xlsx");
  expect((await readPlanFile(f))[0]).toEqual({
    id: "U-001",
    itemType: "UNLOAD",
    deliveryDate: "2026-11-20",
  });
});
