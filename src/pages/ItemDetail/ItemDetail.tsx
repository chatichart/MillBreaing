import DateInput from "../../components/DateInput";
import * as React from "react";
import { PageProps, Badge, Empty } from "../../components/Common";
import {
  Item,
  documentKinds,
  dataSchema,
  typeLabels,
} from "../../models/schema";
import { Repository } from "../../repositories/types";
import {
  status,
  thaiDate,
  waitingDays,
  pairReady,
  forecast,
} from "../../domain/rules";
import { download } from "../../services/export";
import { ORIGINAL_PLAN_EDITABLE } from "../../config/workflow";
export default function ItemDetail(
  p: PageProps & {
    itemId: string;
    repository: Repository;
    onDirty: (dirty: boolean) => void;
  },
): React.ReactElement {
  const source = p.data.items.find((i) => i.id === p.itemId);
  const [draft, setDraft] = React.useState<Item | undefined>(
    source ? JSON.parse(JSON.stringify(source)) : undefined,
  );
  const [original, setOriginal] = React.useState(JSON.stringify(source));
  const [dateReset, setDateReset] = React.useState(0);
  const [error, setError] = React.useState("");
  const [feedback, setFeedback] = React.useState("");
  const [pairTarget, setPairTarget] = React.useState("");
  const [docKind, setDocKind] =
    React.useState<(typeof documentKinds)[number]>("MATERIAL_CERT");
  const [revision, setRevision] = React.useState("1");
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const fileInputId = React.useId();
  const uploadHintId = React.useId();
  const [uploadMessage, setUploadMessage] = React.useState<{text:string;error:boolean}|null>(null);
  React.useEffect(() => {
    setDraft(source ? JSON.parse(JSON.stringify(source)) : undefined);
    setOriginal(JSON.stringify(source));
    setFeedback("");
    setError("");
    setFile(null);
    setUploadMessage(null);
    if(fileInput.current) fileInput.current.value='';
  }, [p.itemId]);
  const dirty = !!draft && (JSON.stringify(draft) !== original || !!feedback);
  React.useEffect(() => {
    p.onDirty(dirty);
    return () => p.onDirty(false);
  }, [dirty, p.onDirty]);
  if (!draft || !source)
    return <Empty>เลือกรายการจาก Supplier Tracking หรือ Weekly Board</Empty>;
  const i = draft;
  const disabled = !p.canWrite || p.busy || uploading;
  const changed = JSON.stringify(source) !== original;
  const set = <K extends keyof Item>(key: K, value: Item[K]): void =>
    setDraft({ ...i, [key]: value });
  const field = (
    label: string,
    key: keyof Item,
    type = "text",
  ): React.ReactElement => (
    <label>
      {label}
      {type === "date" ? (
        <DateInput
          key={`${p.itemId}:${dateReset}`}
          value={i[key] as string | null}
          disabled={disabled}
          onChange={(value) => set(key, value as never)}
        />
      ) : (
        <input
          type={type}
          value={String(i[key] ?? "")}
          disabled={disabled}
          onChange={(e) => set(key, (e.target.value || null) as never)}
        />
      )}
    </label>
  );
  const dateField = (
    label: string,
    group: "actual" | "revised",
    key: keyof Item["baseline"] | "readyDate",
  ): React.ReactElement => (
    <label>
      {label}
      <DateInput
        key={`${p.itemId}:${dateReset}`}
        disabled={disabled}
        value={(i[group] as unknown as Record<string, string | null>)[key]}
        onChange={(value) =>
          setDraft({
            ...i,
            [group]: { ...i[group], [key]: value },
            ...(group === "actual" && key === "deliveryDate" && value
              ? { waitingForTruck: false }
              : {}),
          })
        }
      />
    </label>
  );
  const save = async (): Promise<void> => {
    try {
      setError("");
      if (changed)
        throw new Error(
          "รายการนี้ถูกเปลี่ยนในข้อมูลล่าสุด: ดาวน์โหลด Draft แล้วกด Cancel เพื่อโหลดค่าปัจจุบัน จากนั้นนำเฉพาะการแก้ไขกลับมาใช้",
        );
      const d = JSON.parse(JSON.stringify(p.data));
      const updated = {
        ...i,
        updatedAt: new Date().toISOString(),
        updatedBy: p.user,
      };
      if (feedback.trim()) {
        updated.lastFollowUpDate = p.asOf;
        d.followUps.push({
          id: crypto.randomUUID(),
          itemId: i.id,
          date: p.asOf,
          stage: status(i, p.data, p.asOf),
          feedback,
          delayReason: i.delayReason,
          revisedTarget: i.revisedTargetDate,
          action: i.followUpAction || "",
          nextDate: i.nextFollowUpDate,
          by: p.user,
        });
      }
      d.items = d.items.map((x: Item) => (x.id === i.id ? updated : x));
      const oldDelivery = source.actual.deliveryDate;
      if (i.actual.deliveryDate && oldDelivery !== i.actual.deliveryDate)
        d.deliveryRecords.push({
          id: crypto.randomUUID(),
          itemId: i.id,
          date: i.actual.deliveryDate,
          recordedBy: p.user,
        });
      d.auditEvents.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        by: p.user,
        entityId: i.id,
        action: "Item / supplier / forecast update",
        before: original,
        after: JSON.stringify(updated),
      });
      dataSchema.parse(d);
      if (await p.save(d)) {
        const confirmed = p.getSavedData?.()?.items.find((item) => item.id === updated.id) || updated;
        setDraft(JSON.parse(JSON.stringify(confirmed)));
        setOriginal(JSON.stringify(confirmed));
        setFeedback("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const upload = async (): Promise<void> => {
    if (!file || disabled || dirty || !revision.trim() || p.repository.mode==='demo') return;
    setUploading(true);
    setUploadMessage(null);
    let uploaded = "";
    try {
      uploaded = await p.repository.upload(i.id, file, docKind, revision.trim());
      const d = JSON.parse(JSON.stringify(p.data));
      const meta = {
        id: crypto.randomUUID(),
        itemId: i.id,
        kind: docKind,
        revision:revision.trim(),
        name: file.name,
        url: uploaded,
        uploadedAt: new Date().toISOString(),
        uploadedBy: p.user,
      };
      d.documentMetadata.push(meta);
      d.auditEvents.push({
        id: crypto.randomUUID(),
        at: meta.uploadedAt,
        by: p.user,
        entityId: i.id,
        action: "Document revision uploaded",
        before: "",
        after: JSON.stringify(meta),
      });
      if (!(await p.save(d)))
        setUploadMessage({error:true,text:`อัปโหลดไฟล์แล้ว แต่บันทึกข้อมูลแนบไม่สำเร็จ กรุณาติดต่อผู้ดูแลพร้อมเส้นทาง ${uploaded}`});
      else {
        setFile(null);
        if(fileInput.current) fileInput.current.value='';
        setUploadMessage({error:false,text:'อัปโหลดและบันทึกเอกสารเรียบร้อยแล้ว'});
      }
    } catch (e) {
      setUploadMessage({error:true,text:`${e instanceof Error?e.message:String(e)}${uploaded?` • ไฟล์อยู่ที่ ${uploaded} แต่ข้อมูลแนบยังไม่สมบูรณ์ กรุณาติดต่อผู้ดูแล`:''}`});
    } finally {
      setUploading(false);
    }
  };
  const addPair = async (): Promise<void> => {
    if (!pairTarget || pairTarget === i.id) return;
    const other = p.data.items.find((x) => x.id === pairTarget);
    if (!other) return;
    const load =
      i.itemType === "LOAD" ? i : other.itemType === "LOAD" ? other : i;
    const match = load.id === i.id ? other : i;
    const type =
      load.itemType === "LOAD" && match.itemType === "BOTTOM"
        ? "LOAD_BOTTOM"
        : load.itemType === "LOAD" && match.itemType === "AL_COVER"
          ? "LOAD_COVER"
          : "EXPLICIT";
    const d = JSON.parse(JSON.stringify(p.data));
    if (
      d.pairings.some(
        (r: { loadId: string; matchingId: string }) =>
          r.loadId === load.id && r.matchingId === match.id,
      )
    ) {
      setError("Pair already exists");
      return;
    }
    const pair = {
      id: crypto.randomUUID(),
      loadId: load.id,
      matchingId: match.id,
      type,
    };
    d.pairings.push(pair);
    d.auditEvents.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      by: p.user,
      entityId: i.id,
      action: "Explicit pairing created",
      before: "",
      after: JSON.stringify(pair),
    });
    await p.save(d);
  };
  return (
    <>
      <section className="mb-panel">
        <div className="mb-section-head">
          <div>
            <span className="mb-eyebrow">ITEM DETAIL</span>
            <h2>
              {i.id} • {typeLabels[i.itemType]}
            </h2>
            <p>
              Plan: {thaiDate(forecast(i))} • Actual:{" "}
              {thaiDate(i.actual.deliveryDate)}
            </p>
          </div>
          <Badge value={status(source, p.data, p.asOf)} />
        </div>
        <p>
          Truck waiting: {waitingDays(source, p.asOf)} วัน • Pair readiness:{" "}
          {pairReady(source, p.data) ? "Ready" : "Waiting"}
        </p>
        {changed && (
          <div className="mb-warning">
            ข้อมูลเซิร์ฟเวอร์เปลี่ยนแล้ว ฉบับร่างถูกเก็บไว้ ห้ามบันทึกทับก่อนตรวจสอบค่าล่าสุด
            <details>
              <summary>ค่าปัจจุบันใน SharePoint / Repository</summary>
              <pre>{JSON.stringify(source, null, 2)}</pre>
            </details>
          </div>
        )}
        <div className="mb-form">
          <label>
            Supplier
            <input
              readOnly
              value={
                p.data.suppliers.find((s) => s.id === i.supplierId)?.name ||
                i.supplierId
              }
            />
          </label>
          <label>
            QC Result
            <select
              value={i.qcStatus}
              disabled={disabled}
              onChange={(e) =>
                set("qcStatus", e.target.value as Item["qcStatus"])
              }
            >
              {["PENDING", "PASS", "FAIL", "REWORK"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <h3>Original Plan / Revised / Actual</h3>
        <p>
          {ORIGINAL_PLAN_EDITABLE
            ? "เปิดกรอก Original Plan สำหรับเตรียมแผนเริ่มต้น • บันทึกประวัติการแก้ไขทุกครั้ง"
            : "Original Plan ปิดแก้ไขแล้ว • แก้ผ่าน Explicit Baseline Revision ใน Import เท่านั้น"}{" "}
          • ไม่เติม Actual จากแผน
        </p>
        <div className="mb-form">
          {(["castingDate", "finishingDate", "qcDate"] as const).map((k) => (
            <React.Fragment key={k}>
              <label>
                {
                  {
                    castingDate: "Casting",
                    finishingDate: "Finishing",
                    qcDate: "QC",
                  }[k]
                }{" "}
                Original
                <DateInput
                  key={`${p.itemId}:${dateReset}`}
                  readOnly={!ORIGINAL_PLAN_EDITABLE}
                  disabled={disabled}
                  value={i.baseline[k] || ""}
                  onChange={(value) =>
                    set("baseline", { ...i.baseline, [k]: value })
                  }
                />
              </label>
              {dateField(
                `${{ castingDate: "Casting", finishingDate: "Finishing", qcDate: "QC" }[k]} Revised`,
                "revised",
                k,
              )}
              {dateField(
                `${{ castingDate: "Casting", finishingDate: "Finishing", qcDate: "QC" }[k]} Actual`,
                "actual",
                k,
              )}
            </React.Fragment>
          ))}
        </div>
        <h3>Delivery</h3>
        <div className="mb-form">
          <label>
            Delivery Plan
            <DateInput
              key={`${p.itemId}:${dateReset}`}
              disabled={disabled}
              value={
                (ORIGINAL_PLAN_EDITABLE
                  ? i.baseline.deliveryDate
                  : forecast(i)) || ""
              }
              onChange={(value) =>
                ORIGINAL_PLAN_EDITABLE
                  ? setDraft({
                      ...i,
                      baseline: {
                        ...i.baseline,
                        deliveryDate: value,
                      },
                    })
                  : set("revisedDeliveryDate", value)
              }
            />
          </label>
          {dateField("Delivery Actual", "actual", "deliveryDate")}
        </div>
        <p>บันทึก Actual เมื่อรับสินค้าจริงแล้วเท่านั้น • เก็บแผนเดิมสำหรับรายงานในประวัติ</p>
        <h3>Readiness</h3>
        <div className="mb-form">
          {dateField("Ready for Delivery", "actual", "readyDate")}
          <label className="mb-check">
            <input
              type="checkbox"
              disabled={disabled}
              checked={i.waitingForTruck}
              onChange={(e) => set("waitingForTruck", e.target.checked)}
            />
            รอรถรับ
          </label>
        </div>
        <h3>Delay & Follow-up</h3>
        <div className="mb-form">
          <label>
            Delay Stage
            <select
              value={i.delayStage || ""}
              disabled={disabled}
              onChange={(e) => set("delayStage", e.target.value || null)}
            >
              <option value="">ไม่ระบุ</option>
              {i.delayStage &&
                !["Casting", "Finishing", "QC", "Delivery"].includes(
                  i.delayStage,
                ) && (
                  <option value={i.delayStage}>{i.delayStage} (ข้อมูลเดิม)</option>
                )}
              {["Casting", "Finishing", "QC", "Delivery"].map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
          <label>
            Delay Category
            <select
              value={i.delayCategory || ""}
              disabled={disabled}
              onChange={(e) => set("delayCategory", e.target.value || null)}
            >
              <option value="">ไม่มี</option>
              {[
                "Casting Delay",
                "Material Delay",
                "QC Failure",
                "Rework",
                "Waiting for Pair",
                "Waiting for Truck",
                "Transportation Delay",
                "Other",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          {field("Delay Reason", "delayReason")}
          {field("Revised Target", "revisedTargetDate", "date")}
          {field("Follow-up Action", "followUpAction")}
          {field("Next Follow-up", "nextFollowUpDate", "date")}
          {field("Casting Remark", "castingRemark")}
          {field("QC Remark", "qcRemark")}
          {field("Purchasing Remark", "purchasingRemark")}
          {field("Planning Remark", "planningRemark")}
          <label>
            Supplier feedback / Follow-up
            <textarea
              disabled={disabled}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="mb-error" role="alert">
            {error}
          </p>
        )}
        <div className="mb-actions">
          <button
            className="primary"
            disabled={disabled || !dirty || changed}
            onClick={() => {
              void save();
            }}
          >
            Save Update
          </button>
          <button
            disabled={p.busy}
            onClick={() => {
              setDateReset((v) => v + 1);
              setDraft(JSON.parse(JSON.stringify(source)));
              setOriginal(JSON.stringify(source));
              setFeedback("");
              setError("");
            }}
          >
            Cancel Changes / โหลดค่าปัจจุบัน
          </button>
          <button
            onClick={() =>
              download(
                `${i.id}-draft.json`,
                JSON.stringify(i, null, 2),
                "application/json",
              )
            }
          >
            ดาวน์โหลด Draft
          </button>
          {dirty && <span>มีการแก้ไขที่ยังไม่บันทึก</span>}
        </div>
      </section>
      <section className="mb-panel">
        <h2>Component Pairing</h2>
        <p>กำหนดคู่โดย Purchasing เท่านั้น ไม่จับคู่จากเลขลำดับ</p>
        {p.data.pairings
          .filter((r) => r.loadId === i.id || r.matchingId === i.id)
          .map((r) => (
            <div className="mb-pair" key={r.id}>
              <strong>
                {r.loadId} ↔ {r.matchingId}
              </strong>
              <span>
                {r.type} •{" "}
                {pairReady(source, p.data) ? "Pair Ready" : "Waiting for Pair"}
              </span>
            </div>
          ))}
        <div className="mb-actions">
          <select
            aria-label="Matching component"
            value={pairTarget}
            disabled={disabled || dirty}
            onChange={(e) => setPairTarget(e.target.value)}
          >
            <option value="">เลือกชิ้นส่วนที่ต้องส่งร่วมกัน</option>
            {p.data.items
              .filter((x) => x.id !== i.id)
              .map((x) => (
                <option key={x.id}>{x.id}</option>
              ))}
          </select>
          <button
            disabled={disabled || dirty || !pairTarget}
            onClick={() => {
              void addPair();
            }}
          >
            เพิ่ม Pair แบบชัดเจน
          </button>
        </div>
      </section>
      <section className="mb-panel">
        <h2>Document Attachments</h2>
        {p.repository.mode === "demo" && <p className="mb-warning">โหมดทดลองสาธารณะยังไม่เปิดอัปโหลดเอกสาร • เปิดใช้หลังตั้งค่า Entra ID</p>}
        <p>
          Material Certificate และ QC Dimension Check แยกประเภท • เก็บทุก Revision
          • PDF ไม่เกิน 20 MB
        </p>
        <div className="mb-form">
          <label>
            ประเภทเอกสาร
            <select
              value={docKind}
              disabled={disabled}
              onChange={(e) => setDocKind(e.target.value as typeof docKind)}
            >
              {documentKinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            Revision
            <input
              value={revision}
              disabled={disabled}
              onChange={(e) => setRevision(e.target.value)}
            />
          </label>
          <div className="mb-file-picker">
            <label htmlFor={fileInputId}>PDF</label>
            <input id={fileInputId} ref={fileInput} className="mb-file-input" type="file"
              accept="application/pdf,.pdf" disabled={disabled || p.repository.mode==='demo'}
              onChange={(e)=>{
                const selected=e.target.files?.[0]||null;
                setUploadMessage(null);
                if(selected && (!/\.pdf$/i.test(selected.name) || selected.size>20*1024*1024 || selected.size===0)){
                  setFile(null);e.target.value='';
                  setUploadMessage({error:true,text:'กรุณาเลือกไฟล์ PDF ขนาดไม่เกิน 20 MB'});
                } else setFile(selected);
              }} />
            <div className="mb-file-selection">
              <button type="button" disabled={disabled || p.repository.mode==='demo'} onClick={()=>fileInput.current?.click()}>
                {file?'เปลี่ยนไฟล์ PDF':'เลือกไฟล์ PDF'}
              </button>
              <span>{file?`${file.name} • ${(file.size/1024/1024).toFixed(2)} MB`:'ยังไม่ได้เลือกไฟล์'}</span>
            </div>
          </div>
        </div>
        <div className="mb-upload-actions">
          <button className="primary" type="button" aria-describedby={uploadHintId}
            disabled={disabled || dirty || !file || !revision.trim() || p.repository.mode==='demo'}
            onClick={()=>{void upload();}}>
            {uploading?'กำลังอัปโหลด…':'อัปโหลดไฟล์ PDF'}
          </button>
          <span id={uploadHintId}>
            {p.repository.mode==='demo'?'โหมดทดลองยังไม่เปิดอัปโหลดเอกสาร':!p.canWrite?'ต้องมีสิทธิ์ Editor จึงจะอัปโหลดได้':uploading?'กรุณารอจนบันทึกเอกสารเสร็จ':p.busy?'กำลังดำเนินการ กรุณารอสักครู่':dirty?'กรุณากด Save Update ก่อนอัปโหลดเอกสาร':!file?'เลือกไฟล์ PDF ก่อนอัปโหลด':!revision.trim()?'กรุณาระบุ Revision':'พร้อมอัปโหลด • ไฟล์จะแนบกับ '+i.id}
          </span>
        </div>
        {uploadMessage&&<div role={uploadMessage.error?'alert':'status'} className={uploadMessage.error?'mb-error':'mb-success'}>{uploadMessage.text}</div>}
        <table>
          <thead>
            <tr>
              <th>ประเภท / ชื่อ</th>
              <th>Revision</th>
              <th>Upload Date / By</th>
              <th>เอกสาร</th>
            </tr>
          </thead>
          <tbody>
            {p.data.documentMetadata
              .filter((m) => m.itemId === i.id && m.kind !== "DRAWING")
              .map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.kind}
                    <small>{m.name}</small>
                  </td>
                  <td>{m.revision}</td>
                  <td>
                    {thaiDate(m.uploadedAt.slice(0, 10))}
                    <small>{m.uploadedBy}</small>
                  </td>
                  <td>
                    <a href={m.url} target="_blank" rel="noopener noreferrer">
                      View PDF
                    </a>{" "}
                    •{" "}
                    <a href={m.url} download={m.name}>
                      Download PDF
                    </a>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <section className="mb-panel">
        <h2>Follow-up History</h2>
        {p.data.followUps
          .filter((r) => r.itemId === i.id)
          .slice()
          .reverse()
          .map((r) => (
            <article className="mb-history" key={r.id}>
              <strong>
                {thaiDate(r.date)} • {r.stage} • {r.by}
              </strong>
              <p>{r.feedback}</p>
              <p>
                Delay: {r.delayReason || "—"} • Revised target:{" "}
                {thaiDate(r.revisedTarget)} • Action: {r.action || "—"} • Next:{" "}
                {thaiDate(r.nextDate)}
              </p>
            </article>
          ))}
      </section>
      <details className="mb-panel">
        <summary>Audit History / Supplier & Plan Revisions</summary>
        {p.data.auditEvents
          .filter((a) => a.entityId === i.id)
          .slice()
          .reverse()
          .map((a) => (
            <div className="mb-history" key={a.id}>
              <strong>
                {thaiDate(a.at.slice(0, 10))} • {a.by} • {a.action}
              </strong>
              <details>
                <summary>Before / After</summary>
                <pre>{a.before}</pre>
                <pre>{a.after}</pre>
              </details>
            </div>
          ))}
      </details>
    </>
  );
}
