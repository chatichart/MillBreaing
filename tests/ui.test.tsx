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

it("opens access management from the sidebar and returns to project pages", async () => {
  const open=vi.fn();
  render(<App repository={repository()} user="buyer" accountActions={<button>ออกจากระบบ</button>}
    accessManagement={{onOpen:open,content:<p>รายการคำขอทดสอบ</p>}} />);
  await screen.findByText("Delivery S-Curve");
  const manage=screen.getByRole("button",{name:/จัดการคำขอ/});
  expect(manage.closest('aside')).toBeTruthy();
  expect(screen.getByRole('button',{name:'ออกจากระบบ'}).closest('aside')).toBeTruthy();
  fireEvent.click(manage);
  expect(open).toHaveBeenCalledOnce();
  expect(screen.getByText('รายการคำขอทดสอบ')).toBeTruthy();
  expect(screen.queryByRole('heading',{name:'Dashboard',level:1})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/Dashboard/}));
  expect(screen.getByRole('heading',{name:'Dashboard',level:1})).toBeTruthy();
  expect(screen.queryByText('รายการคำขอทดสอบ')).toBeNull();
});

it("guides PDF selection and uploads the selected document revision", async () => {
  const repo=repository();
  const upload=vi.spyOn(repo,'upload');
  render(<App repository={repo} user="buyer" />);
  await screen.findByText('Delivery S-Curve');
  fireEvent.click(screen.getByRole('button',{name:/Supplier Tracking/}));
  fireEvent.click(screen.getByRole('button',{name:'L-001'}));
  const button=screen.getByRole('button',{name:'อัปโหลดไฟล์ PDF'});
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('เลือกไฟล์ PDF ก่อนอัปโหลด')).toBeTruthy();
  const input=screen.getByLabelText('PDF');
  fireEvent.change(input,{target:{files:[new File(['bad'],'bad.txt',{type:'text/plain'})]}});
  expect(screen.getByText('กรุณาเลือกไฟล์ PDF ขนาดไม่เกิน 20 MB')).toBeTruthy();
  expect(upload).not.toHaveBeenCalled();
  fireEvent.change(input,{target:{files:[new File(['%PDF-1.7 test'],'certificate.pdf',{type:'application/pdf'})]}});
  expect((button as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(button);
  await screen.findByText('อัปโหลดและบันทึกเอกสารเรียบร้อยแล้ว');
  expect(upload).toHaveBeenCalledWith('L-001',expect.objectContaining({name:'certificate.pdf'}),'MATERIAL_CERT','1');
  expect(screen.getByRole('link',{name:'View PDF'})).toBeTruthy();
  expect((button as HTMLButtonElement).disabled).toBe(true);
});

it("requires confirmation before removing an uploaded PDF", async () => {
  const repo=repository();const base=await repo.load();
  base.data.documentMetadata.push({id:'doc-delete',itemId:'L-001',kind:'OTHER',revision:'1',name:'ลบทดสอบ.pdf',url:'/api/documents/test',uploadedAt:'2026-11-17',uploadedBy:'buyer'});
  repo.deleteDocument=vi.fn(async()=>({data:{...base.data,documentMetadata:[]},token:'removed'}));
  render(<App repository={repo} user="buyer"/>);
  await screen.findByText('Delivery S-Curve');fireEvent.click(screen.getByRole('button',{name:/Supplier Tracking/}));fireEvent.click(screen.getByRole('button',{name:'L-001'}));
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button',{name:'ลบไฟล์ ลบทดสอบ.pdf'}));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('ลบทดสอบ.pdf'));
  expect(repo.deleteDocument).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'ลบไฟล์ ลบทดสอบ.pdf'}));
  await screen.findByText('ลบเอกสารเรียบร้อยแล้ว');
  expect(repo.deleteDocument).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button',{name:'ลบไฟล์ ลบทดสอบ.pdf'})).toBeNull();confirm.mockRestore();
});
