import DateInput from "../../components/DateInput";
import * as React from "react";
import { PageProps, Badge, Empty } from "../../components/Common";
import { Item, typeLabels } from "../../models/schema";
import { delayDays, status, thaiDate, forecast } from "../../domain/rules";
import ImportPanel from "../../components/ImportPanel";
export default function SupplierTracking(p: PageProps): React.ReactElement {
  const [sort, setSort] = React.useState("date");
  const [quick, setQuick] = React.useState<Item | null>(null);
  const [note, setNote] = React.useState("");
  const [nextDate, setNextDate] = React.useState("");
  const [err, setErr] = React.useState("");
  const rows = p.items
    .slice()
    .sort((a, b) =>
      sort === "delay"
        ? delayDays(b, p.asOf) - delayDays(a, p.asOf)
        : (forecast(a) || "9999").localeCompare(forecast(b) || "9999"),
    );
  const quickSave = async (): Promise<void> => {
    if (!quick || !note.trim()) {
      setErr("กรุณาระบุผลติดตาม");
      return;
    }
    const data = JSON.parse(JSON.stringify(p.data));
    const i = data.items.find((x: Item) => x.id === quick.id);
    i.lastFollowUpDate = p.asOf;
    i.nextFollowUpDate = nextDate || null;
    i.updatedBy = p.user;
    i.updatedAt = new Date().toISOString();
    data.followUps.push({
      id: crypto.randomUUID(),
      itemId: i.id,
      date: p.asOf,
      stage: status(quick, p.data, p.asOf),
      feedback: note,
      delayReason: i.delayReason,
      revisedTarget: i.revisedTargetDate,
      action: i.followUpAction || "",
      nextDate: nextDate || null,
      by: p.user,
    });
    data.auditEvents.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      by: p.user,
      entityId: i.id,
      action: "Quick follow-up",
      before: JSON.stringify(quick),
      after: JSON.stringify(i),
    });
    if (await p.save(data)) {
      setQuick(null);
      setNote("");
    }
  };
  return (
    <>
      <div className="mb-section-head">
        <p>{rows.length} รายการ • คลิก Item ID เพื่ออัปเดต</p>
        <label>
          เรียงตาม{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="date">Delivery Plan</option>
            <option value="delay">Delay Severity</option>
          </select>
        </label>
      </div>
      <section className="mb-panel mb-table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Item / Type",
                "ผู้ผลิต",
                "Casting Plan / Actual",
                "Finishing Plan / Actual",
                "QC Plan / Actual",
                "Delivery Plan",
                "Delivery Actual",
                "สถานะ",
                "Delay Days",
                "Last Follow-up",
                "Next Follow-up",
                "ติดตาม",
              ].map((v) => (
                <th key={v}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr
                key={i.id}
                className={
                  delayDays(i, p.asOf) > 0 && !i.actual.deliveryDate
                    ? "mb-overdue"
                    : ""
                }
              >
                <td>
                  <button className="mb-link" onClick={() => p.openItem(i.id)}>
                    {i.id}
                  </button>
                  <small>{typeLabels[i.itemType]}</small>
                  <small>{i.description}</small>
                </td>
                <td>
                  {p.data.suppliers.find((s) => s.id === i.supplierId)?.name}
                </td>
                {(["castingDate", "finishingDate", "qcDate"] as const).map(
                  (k) => (
                    <td key={k}>
                      {thaiDate(i.baseline[k])}
                      <small>Actual: {thaiDate(i.actual[k])}</small>
                    </td>
                  ),
                )}
                <td>{thaiDate(forecast(i))}</td>
                <td>{thaiDate(i.actual.deliveryDate)}</td>
                <td>
                  <Badge value={status(i, p.data, p.asOf)} />
                </td>
                <td>{delayDays(i, p.asOf)}</td>
                <td>{thaiDate(i.lastFollowUpDate)}</td>
                <td
                  className={
                    !i.nextFollowUpDate || i.nextFollowUpDate < p.asOf
                      ? "mb-missing"
                      : ""
                  }
                >
                  {thaiDate(i.nextFollowUpDate)}
                  {!i.nextFollowUpDate && <small>ยังไม่กำหนดติดตาม</small>}
                </td>
                <td>
                  <button
                    disabled={!p.canWrite || p.busy}
                    onClick={() => {
                      setQuick(i);
                      setNextDate(i.nextFollowUpDate || "");
                    }}
                  >
                    Quick Update
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty />}
      </section>
      {quick && (
        <section className="mb-panel">
          <h2>ติดตามด่วน • {quick.id}</h2>
          <label>
            Supplier feedback
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label>
            Next Follow-up
            <DateInput
              value={nextDate}
              onChange={(value) => setNextDate(value || "")}
            />
          </label>
          {err && <p role="alert">{err}</p>}
          <div className="mb-actions">
            <button
              disabled={p.busy}
              className="primary"
              onClick={() => {
                void quickSave();
              }}
            >
              บันทึกติดตาม
            </button>
            <button onClick={() => setQuick(null)}>ยกเลิก</button>
          </div>
        </section>
      )}
      <ImportPanel {...p} />
    </>
  );
}
