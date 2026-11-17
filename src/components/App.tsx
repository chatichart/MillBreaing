import { DateValidationContext } from "./DateInput";
import * as React from "react";
import { AppData, itemTypes, typeLabels } from "../models/schema";
import { ORIGINAL_PLAN_EDITABLE } from "../config/workflow";
import { Repository, Snapshot, ConflictError } from "../repositories/types";
import { Filters, filterItems, today, thaiDate } from "../domain/rules";
import { FiltersBar, PageProps } from "./Common";
import Dashboard from "../pages/Dashboard/Dashboard";
import SupplierTracking from "../pages/SupplierTracking/SupplierTracking";
import OriginalPlanTable from "../pages/ItemDetail/OriginalPlanTable";
import ItemDetail from "../pages/ItemDetail/ItemDetail";
import PlanningCoordination from "../pages/PlanningCoordination/PlanningCoordination";
import { download } from "../services/export";
import "../styles/app.css";
export interface AppProps {
  repository: Repository;
  user: string;
  accountActions?: React.ReactNode;
  accessManagement?: {onOpen:()=>void;content:React.ReactNode};
}
const pages = [
  "Dashboard",
  "Supplier Tracking",
  "Item Detail",
  "Planning Coordination",
];
export default function App({
  repository,
  user,
  accountActions,
  accessManagement,
}: AppProps): React.ReactElement {
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const savedData = React.useRef<AppData>();
  const [page, setPage] = React.useState(0);
  const [itemId, setItemId] = React.useState("");
  const [detailType, setDetailType] = React.useState("");
  const [filters, setFilters] = React.useState<Filters>({});
  const [busy, setBusy] = React.useState(false);
  const [writable, setWritable] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [conflict, setConflict] = React.useState<Snapshot | null>(null);
  const [otherDirty, setDirty] = React.useState(false);
  const [formDirty, setItemDirty] = React.useState(false);
  const [tableDirty, setTableDirty] = React.useState(false);
  const [invalidDates, setInvalidDates] = React.useState<Set<string>>(
    new Set(),
  );
  const reportDateInvalid = React.useCallback(
    (id: string, invalid: boolean): void => {
      setInvalidDates((previous) => {
        if (previous.has(id) === invalid) return previous;
        const next = new Set(previous);
        if (invalid) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [],
  );
  const itemDirty = formDirty || tableDirty || invalidDates.size > 0;
  const [detailView, setDetailView] = React.useState("form");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dirty = page === 2 ? itemDirty : otherDirty;
  const asOf = today();
  const load = React.useCallback(async (): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      const s = await repository.load();
      setSnapshot(s);
      setWritable(await repository.canWrite());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [repository]);
  React.useEffect(() => {
    void load();
  }, [load]);
  React.useEffect(() => {
    const unload = (e: BeforeUnloadEvent): void => {
      if (itemDirty || otherDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [itemDirty, otherDirty]);
  const navigate = (n: number, id?: string): void => {
    if (
      dirty &&
      (page !== 2 || n === 2) &&
      (n !== page || (id !== undefined && id !== itemId)) &&
      !window.confirm("มีการแก้ไขยังไม่บันทึก ต้องการออกจากรายการนี้หรือไม่?")
    )
      return;
    setDirty(false);
    setPage(n);
    if (id !== undefined) {
      setItemId(id);
      if (id)
        setDetailType(
          snapshot?.data.items.find((i) => i.id === id)?.itemType || "",
        );
    }
    setNotice("");
  };
  const save = async (next: AppData): Promise<boolean> => {
    if (!snapshot || !writable || busy || conflict) return false;
    const invalid = Array.from(
      rootRef.current?.querySelectorAll<HTMLInputElement>("[data-mb-date]") ||
        [],
    ).find(
      (input) =>
        !input.closest("[hidden]") && !input.disabled && !input.checkValidity(),
    );
    if (invalid) {
      setNotice("");
      invalid.reportValidity();
      setError("กรุณาตรวจวันที่ให้ถูกต้องเป็น dd/mm/yyyy");
      return false;
    }
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const saved = await repository.save(snapshot, next);
      savedData.current = saved.data;
      setSnapshot(saved);
      setNotice(
        repository.mode === "preview"
          ? "บันทึกข้อมูลตัวอย่างใน browser แล้ว (ไม่ใช่ SharePoint)"
          : repository.mode === "sharepoint" ? "SharePoint ยืนยันการบันทึกแล้ว" : "PostgreSQL ยืนยันการบันทึกแล้ว",
      );
      return true;
    } catch (e) {
      if (e instanceof ConflictError) setConflict(e.current);
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const deleteDocument = async(url:string):Promise<boolean>=>{
    if(!snapshot||!writable||busy||conflict||!repository.deleteDocument) return false;
    setBusy(true);setError('');setNotice('');
    try {
      const saved=await repository.deleteDocument(snapshot,url);
      savedData.current=saved.data;setSnapshot(saved);return true;
    } catch(e) {
      if(e instanceof ConflictError) setConflict(e.current);
      setError(e instanceof Error?e.message:String(e));return false;
    } finally {setBusy(false);}
  };
  const props: PageProps | null = snapshot
    ? {
        data: snapshot.data,
        items: filterItems(snapshot.data, filters, asOf),
        asOf,
        onDirty: setDirty,
        canWrite: writable && !conflict,
        busy,
        user,
        openItem: (id) => navigate(2, id),
        save,
        getSavedData: () => savedData.current,
        deleteDocument: repository.deleteDocument ? deleteDocument : undefined,
      }
    : null;
  return (
    <DateValidationContext.Provider value={reportDateInvalid}>
      <div className="mb-app" ref={rootRef}>
        <aside className="mb-sidebar">
          <div className="mb-brand">
            <div className="mb-brand-mark">
              R<span>+</span>
            </div>
            <div>
              REALSOLUPLUS<small>PURCHASING WORKSPACE</small>
            </div>
          </div>
          <div className="mb-project">
            MILL BEARING<small>Supplier Delivery Tracking</small>
          </div>
          <nav aria-label="Main pages">
            {pages.map((name, n) => (
              <button
                key={name}
                className={page === n ? "active" : ""}
                onClick={() => navigate(n)}
              >
                <span>{["◫", "▤", "◇", "▦"][n]}</span>
                {name}
              </button>
            ))}
            {accessManagement && <button className={page===4?'active':''} onClick={()=>{navigate(4);accessManagement.onOpen();}}><span aria-hidden="true">⚿</span>จัดการคำขอ / สิทธิ์</button>}
          </nav>
          <div className="mb-sidebar-foot">
            PURCHASING DEPARTMENT<small>{user}</small>
            {accountActions}
            <span className="mb-live-dot" />
            {repository.mode === "sharepoint"
              ? "SharePoint Online"
              : repository.mode === "preview" ? "Local Preview" : repository.mode === "demo" ? "PostgreSQL • Public Demo" : "PostgreSQL"}
          </div>
        </aside>
        <main className="mb-main">
          <header className="mb-header">
            <div>
              <span className="mb-eyebrow">PURCHASING / MILL BEARING</span>
              <h1>{page===4?"จัดการคำขอ / สิทธิ์":pages[page]}</h1>
              <p>
                {page === 4 ? "ตรวจสอบคำขอและจัดการสิทธิ์การใช้งาน" : page === 0
                  ? "ภาพรวมการติดตามผู้ผลิตและประสิทธิภาพการส่งมอบ"
                  : page === 1
                    ? "ติดตามความคืบหน้าและแผนส่งมอบจากผู้ผลิต"
                    : page === 2
                      ? "บันทึกความคืบหน้า หลักฐาน และประวัติติดตาม"
                      : "ประสานงานแผนส่งมอบรายสัปดาห์"}
              </p>
            </div>
            <div className="mb-header-meta">
              <span>{thaiDate(asOf)}</span>
              <small>
                Asia/Bangkok • {writable ? "Purchasing editor" : "Read only"}
              </small>
              <button
                disabled={busy || dirty || itemDirty}
                onClick={() => {
                  void load();
                }}
              >
                ↻ Refresh
              </button>
            </div>
          </header>
          {repository.mode === "preview" && (
            <div className="mb-preview">
              LOCAL PREVIEW • ตั้งต้น Load 50 / Bottom 10 / AL Cover 20 / Unload 20
              • เก็บข้อมูลเดิมไว้ • รายการใหม่ไม่มี Plan/Actual • ยังไม่เชื่อม SharePoint
            </div>
          )}
          {busy && (
            <div role="status" className="mb-notice">
              กำลังดำเนินการ…
            </div>
          )}
          {notice && (
            <div role="status" className="mb-success">
              {notice}
            </div>
          )}
          {error && (
            <div role="alert" className="mb-error">
              {error}
              {!snapshot && (
                <button
                  onClick={() => {
                    void load();
                  }}
                >
                  ลองโหลดอีกครั้ง
                </button>
              )}
            </div>
          )}
          {conflict && (
            <section className="mb-warning">
              <strong>Conflict: ฉบับร่างยังอยู่ ไม่ได้บันทึกทับ</strong>
              <p>
                โหลดข้อมูลล่าสุดเพื่อเทียบการแก้ไข
                รายการที่ถูกแก้โดยผู้อื่นจะต้องตรวจสอบแล้วนำเฉพาะการแก้ไขกลับมาใช้
              </p>
              <button
                onClick={() =>
                  download(
                    "server-conflict.json",
                    JSON.stringify(conflict.data, null, 2),
                    "application/json",
                  )
                }
              >
                ดาวน์โหลดข้อมูลล่าสุด
              </button>
              <button
                onClick={() => {
                  setSnapshot(conflict);
                  setConflict(null);
                  setError(
                    "โหลดค่าล่าสุดแล้ว: ตรวจสอบ Draft ใน Item Detail ก่อนบันทึก",
                  );
                }}
              >
                โหลดข้อมูลล่าสุด (รักษา Draft ใน Item Detail)
              </button>
            </section>
          )}
          {page===4 && accessManagement?.content}
          {props && (
            <div hidden={page===4}>
              <div className="mb-content-meta">
                <span>
                  PROJECT <b>MILL-BEARING</b>
                </span>
                <span>
                  {snapshot?.data.items.length} ITEMS • REV{" "}
                  {snapshot?.data.revision}
                </span>
              </div>
              {page !== 2 && (
                <FiltersBar
                  data={props.data}
                  value={filters}
                  onChange={setFilters}
                  dates={page === 0}
                />
              )}
              <div className="mb-page">
                {page !== 2 && itemDirty && (
                  <div className="mb-notice">
                    มีฉบับร่างที่ยังไม่บันทึกใน Item Detail • กลับไปแก้ไขต่อหรือกด Save
                    Update ได้
                  </div>
                )}
                {page === 0 && <Dashboard {...props} />}
                {page === 1 && <SupplierTracking {...props} />}
                <div hidden={page !== 2}>
                  <div
                    className="mb-actions"
                    role="group"
                    aria-label="Item Detail view"
                  >
                    <button
                      aria-pressed={detailView === "form"}
                      className={detailView === "form" ? "primary" : ""}
                      onClick={() => setDetailView("form")}
                    >
                      Form View
                    </button>
                    <button
                      aria-pressed={detailView === "table"}
                      className={detailView === "table" ? "primary" : ""}
                      onClick={() => setDetailView("table")}
                    >
                      Table View
                    </button>
                  </div>
                  <div className="mb-filters">
                    <label>
                      ประเภทสินค้า
                      <select
                        value={detailType}
                        onChange={(e) => {
                          const type = e.target.value;
                          const selected = props.data.items.find(
                            (i) => i.id === itemId,
                          );
                          if (selected && type && selected.itemType !== type) {
                            if (
                              dirty &&
                              !window.confirm(
                                "มีการแก้ไขยังไม่บันทึก ต้องการเปลี่ยนประเภทสินค้าและออกจากรายการนี้หรือไม่?",
                              )
                            )
                              return;
                            setItemId("");
                            setDirty(false);
                          }
                          setDetailType(type);
                        }}
                      >
                        <option value="">ทุกประเภทสินค้า</option>
                        {itemTypes.map((type) => (
                          <option key={type} value={type}>
                            {typeLabels[type]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      เลือกรายการ
                      <select
                        value={itemId}
                        onChange={(e) => navigate(2, e.target.value)}
                      >
                        <option value="">เลือก Item ID</option>
                        {props.data.items
                          .filter(
                            (i) => !detailType || i.itemType === detailType,
                          )
                          .map((i) => (
                            <option key={i.id}>{i.id}</option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <div hidden={detailView !== "form"}>
                    <ItemDetail
                      {...props}
                      itemId={itemId}
                      repository={repository}
                      onDirty={setItemDirty}
                    />
                  </div>
                  <div hidden={detailView !== "table"}>
                    <OriginalPlanTable
                      {...props}
                      items={props.data.items.filter(
                        (i) => !detailType || i.itemType === detailType,
                      )}
                      onDirty={setTableDirty}
                    />
                  </div>
                </div>
                {page === 3 && <PlanningCoordination {...props} />}
              </div>
            </div>
          )}
          <footer className="mb-footer">
            Realsoluplus Co., Ltd. • Supplier follow-up & delivery coordination{" "}
            <span>
              {ORIGINAL_PLAN_EDITABLE
                ? "Original Plan เปิดแก้ไข • เก็บประวัติทุกครั้ง"
                : "Original baseline preserved"}{" "}
              · Confirmed deliveries only
            </span>
          </footer>
        </main>
      </div>
    </DateValidationContext.Provider>
  );
}
