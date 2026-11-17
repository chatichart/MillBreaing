import DateInput from "../../components/DateInput";
import * as React from "react";
import { PageProps, Badge, Empty, Kpis } from "../../components/Common";
import { Item, MeetingAction, itemTypes, typeLabels } from "../../models/schema";
import {
  confirmed,
  delayDays,
  forecast,
  metrics,
  status,
  thaiDate,
  tone,
  weekOf,
} from "../../domain/rules";
import { reportCsv, download } from "../../services/export";
export default function PlanningCoordination(p: PageProps): React.ReactElement {
  const [month, setMonth] = React.useState("");
  const [week, setWeek] = React.useState(0);
  const [view, setView] = React.useState("weekly");
  const [selectedStatus, setSelectedStatus] = React.useState("");
  const [editing, setEditing] = React.useState<MeetingAction | null>(null);
  const [editingOriginal, setEditingOriginal] = React.useState<
    string | undefined
  >();
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    p.onDirty(!!editing);
    return () => p.onDirty(false);
  }, [!!editing, p.onDirty]);
  // Delivered items belong to their actual delivery month/week, even when
  // their plan is in another month (or has no delivery date).
  const boardDate = (i: Item): string | null =>
    i.actual.deliveryDate || forecast(i);
  const boardStatus = (i: Item): string => {
    const s = status(i, p.data, p.asOf);
    if (s !== "Delivered" && !/Waiting|Rework/.test(s) && delayDays(i, p.asOf) > 0)
      return "At Risk / Delayed";
    return ["Not Started", "Casting", "QC + Finishing"].includes(s)
      ? "Planned / Expected" : s;
  };
  const matchesStatus = (i: Item): boolean => !selectedStatus ||
    boardStatus(i) === (selectedStatus === "Delayed" ? "At Risk / Delayed" : selectedStatus);
  const months: string[] = [];
  const startMonth = p.asOf.slice(0, 7);
  const endMonth = `${Math.max(2027, Number(p.asOf.slice(0, 4)))}-12`;
  if (month) months.push(month);
  else {
    let cursor = startMonth;
    while (cursor <= endMonth) {
      months.push(cursor);
      const [year, m] = cursor.split("-").map(Number);
      cursor = `${m === 12 ? year + 1 : year}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
    }
  }
  const inRange = (date: string | null): boolean =>
    !!date && months.includes(date.slice(0, 7));
  const plannedScope = p.items.filter((i) => inRange(forecast(i)) && matchesStatus(i));
  const actualScope = p.items.filter((i) => inRange(i.actual.deliveryDate) &&
    i.actual.deliveryDate! <= p.asOf && matchesStatus(i));
  const plannedThisMonth = plannedScope.length;
  const scope = p.items.filter((i) => inRange(boardDate(i)) && matchesStatus(i));
  const monthLabel = (value: string): string =>
    new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${value}-01T00:00:00Z`));
  const actualLabel = (date: string): string =>
    `${date.slice(8, 10)}/${date.slice(5, 7)}/${String(Number(date.slice(0, 4)) + 543).slice(-2)}`;
  const visible = scope.filter((i) => !week || weekOf(boardDate(i)!) === week);
  const m = metrics(p.data, scope, p.asOf);
  const deliveryCounts = (planned: Item[], actual: Item[]): React.ReactElement => (
    <div className="mb-delivery-counts">
      <span>แผน<b>{planned.length}</b></span>
      <span>ส่งจริง<b>{actual.length}</b></span>
    </div>
  );
  const issues = (i: Item): string[] => {
    const result = [];
    if (delayDays(i, p.asOf) > 0 && !confirmed(i, p.data))
      result.push("Supplier Delay");
    const s = status(i, p.data, p.asOf);
    if (/Waiting|Rework/.test(s)) result.push(s);
    for (const [k, label] of [
      ["MATERIAL_CERT", "Missing Material Certificate"],
      ["QC_DIMENSION", "Missing QC Dimension Check"],
    ])
      if (
        !p.data.documentMetadata.some((x) => x.itemId === i.id && x.kind === k)
      )
        result.push(label);
    return result;
  };
  const startAction = (i: Item, issue: string): void => {
    if (
      editing &&
      !window.confirm("มีบันทึกประชุมยังไม่บันทึก ต้องการเปลี่ยนรายการหรือไม่?")
    )
      return;
    setErr("");
    setEditingOriginal(undefined);
    setEditing({
      id: crypto.randomUUID(),
      itemId: i.id,
      meetingDate: p.asOf,
      issue,
      discussion: "",
      decision: "",
      action: "",
      owner: "",
      dueDate: null,
      status: "Open",
      updatedBy: p.user,
    });
  };
  const saveAction = async (): Promise<void> => {
    if (!editing) return;
    if (
      !editing.owner.trim() ||
      !editing.action.trim() ||
      !editing.meetingDate
    ) {
      setErr("กรุณาระบุผู้รับผิดชอบ Action และ Meeting Date");
      return;
    }
    const d = JSON.parse(JSON.stringify(p.data));
    const old = d.meetingActions.find(
      (a: MeetingAction) => a.id === editing.id,
    );
    if (JSON.stringify(old) !== editingOriginal) {
      setErr(
        "บันทึกนี้เปลี่ยนในข้อมูลล่าสุดแล้ว ฉบับร่างยังอยู่ กรุณาคัดลอก Draft แล้วกดยกเลิกเพื่อเปิดค่าล่าสุดและแก้ไขใหม่",
      );
      return;
    }
    d.meetingActions = d.meetingActions.filter(
      (a: MeetingAction) => a.id !== editing.id,
    );
    d.meetingActions.push({ ...editing, updatedBy: p.user });
    d.auditEvents.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      by: p.user,
      entityId: editing.itemId,
      action: "Meeting decision / action update",
      before: JSON.stringify(old || null),
      after: JSON.stringify(editing),
    });
    if (await p.save(d)) setEditing(null);
  };
  const itemTable = (items: Item[]): React.ReactElement => (
    <div className="mb-table-scroll">
      <table>
        <thead>
          <tr>
            {[
              "Item",
              "Supplier",
              "Delivery Plan",
              "Delivery Actual",
              "Status",
              "Delay Reason",
            ].map((v) => (
              <th key={v}>{v}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                <button className="mb-link" onClick={() => p.openItem(i.id)}>
                  {i.id}
                </button>
              </td>
              <td>
                {p.data.suppliers.find((s) => s.id === i.supplierId)?.name}
              </td>
              <td>{thaiDate(forecast(i))}</td>
              <td>{thaiDate(i.actual.deliveryDate)}</td>
              <td>
                <Badge value={status(i, p.data, p.asOf)} />
              </td>
              <td>{i.delayReason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <Empty />}
    </div>
  );
  return (
    <>
      <div className="mb-section-head">
        <div>
          <h2>Weekly Delivery Control Board</h2>
          <p>Purchasing × Production Planning • แผน / ยืนยัน / สิ่งที่ต้องติดตาม</p>
        </div>
        <button
          onClick={() =>
            download(
              `delivery-handover-${p.asOf}.csv`,
              reportCsv(p.data, visible, p.asOf),
            )
          }
        >
          ↓ Export Report CSV
        </button>
      </div>
      <Kpis
        values={[
          { label: month ? "แผนส่งมอบเดือนนี้" : "แผนส่งมอบในช่วงที่แสดง", value: plannedThisMonth },
          { label: "Actual Delivered", value: m.delivered },
          { label: "Ready / Waiting Truck", value: m.ready + m.waitingTruck },
          { label: "Waiting for Pair", value: m.waitingPair },
          { label: "At Risk / Delayed", value: m.delayed },
        ]}
      />
      <section className="mb-panel">
        <div className="mb-filters">
          <label>
            เดือน
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setWeek(0);
              }}
            />
          </label>
          <button onClick={() => { setMonth(""); setWeek(0); }}>
            แสดงทุกเดือน
          </button>
          <label>
            มุมมอง
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="weekly">Weekly Board</option>
              <option value="list">List</option>
            </select>
          </label>
          <label>
            เลือกสัปดาห์
            <select
              value={week}
              onChange={(e) => setWeek(Number(e.target.value))}
            >
              <option value={0}>ทุกสัปดาห์</option>
              {[1, 2, 3, 4, 5].map((w) => (
                <option key={w} value={w}>
                  W{w}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mb-legend">
          สีรายรายการ:
          <button className="mb-status-filter" aria-pressed={!selectedStatus} onClick={() => setSelectedStatus("")}>ทุกสถานะ</button>
          {["Ready for Delivery", "Planned / Expected", "Waiting for Truck", "Delayed", "Delivered"].map(s => (
            <button key={s} className="mb-status-filter" aria-label={`กรองสถานะ ${s}`}
              aria-pressed={selectedStatus === s}
              onClick={() => setSelectedStatus(selectedStatus === s ? "" : s)}>
              <Badge value={s} />
            </button>
          ))}
        </div>
        <p>ยอดสรุป: แผนตาม Delivery Plan • ส่งจริงตาม Delivery Actual ถึงวันที่ {thaiDate(p.asOf)}</p>
        {view === "weekly" ? (
          <div className="mb-table-scroll">
            <table className="mb-monthly-board" aria-label="แผนส่งมอบรายเดือนและสัปดาห์">
              <thead>
                <tr>
                  <th scope="col">เดือน / สัปดาห์</th>
                  {[1, 2, 3, 4, 5].map(w => (
                    <th scope="col" key={w}>W{w} | {(w - 1) * 7 + 1}–{w === 5 ? "สิ้นเดือน" : w * 7}</th>
                  ))}
                  {itemTypes.map(type => <th scope="col" key={type}>{typeLabels[type]}<small>แผน / ส่งจริง</small></th>)}
                </tr>
              </thead>
              <tbody>
            {months.map((boardMonth) => {
              const monthItems = scope.filter(i => boardDate(i)!.startsWith(boardMonth));
              const monthPlans = plannedScope.filter(i => forecast(i)!.startsWith(boardMonth));
              const monthActuals = actualScope.filter(i => i.actual.deliveryDate!.startsWith(boardMonth));
              return (
            <tr key={boardMonth}>
              <th scope="row">
                {monthLabel(boardMonth)}
                {deliveryCounts(monthPlans, monthActuals)}
              </th>
            {[1, 2, 3, 4, 5].map((w) => (
              <td
                className={`mb-week ${month === boardMonth && week === w ? "selected" : ""}`}
                key={w}
              >
                <button
                  className="mb-week-head"
                  onClick={() => {
                    setMonth(boardMonth);
                    setWeek(month === boardMonth && week === w ? 0 : w);
                  }}
                >
                  W{w}
                  <small>
                    {(w - 1) * 7 + 1}–{w === 5 ? "End" : w * 7}
                  </small>
                </button>
                {monthItems
                  .filter((i) => weekOf(boardDate(i)!) === w)
                  .map((i) => {
                    const s = boardStatus(i);
                    const deliveryDelta = i.actual.deliveryDate && i.baseline.deliveryDate
                      ? Math.round((Date.parse(i.actual.deliveryDate) - Date.parse(i.baseline.deliveryDate)) / 86400000)
                      : null;
                    return (
                      <button
                        key={i.id}
                        className={`mb-board-card ${tone(s)}`}
                        onClick={() => p.openItem(i.id)}
                      >
                        <strong className={`mb-item-type-${i.itemType.toLowerCase()}`}>{i.id}</strong>
                        <span>{s === "Delivered" ? "✓ Delivered" : s}</span>
                        <small>{i.actual.deliveryDate
                          ? `Plan ${i.baseline.deliveryDate ? actualLabel(i.baseline.deliveryDate) : "—"} (Actual ${actualLabel(i.actual.deliveryDate)})`
                          : thaiDate(boardDate(i))}</small>
                        {deliveryDelta !== null && (
                          <small className={`mb-delivery-timing ${deliveryDelta > 0 ? "mb-delivery-late" : "mb-delivery-on-time"}`}>
                            {deliveryDelta < 0 ? `ส่งก่อนแผน ${Math.abs(deliveryDelta)} วัน`
                              : deliveryDelta > 0 ? `ส่งช้ากว่าแผน ${deliveryDelta} วัน` : "ส่งตรงแผน"}
                          </small>
                        )}
                      </button>
                    );
                  })}
                {!monthItems.some((i) => weekOf(boardDate(i)!) === w) && (
                  <div className="mb-no-items">No Items</div>
                )}
              </td>
            ))}
              {itemTypes.map(type => (
                <td className="mb-board-total" key={type}>{deliveryCounts(
                  monthPlans.filter(i => i.itemType === type),
                  monthActuals.filter(i => i.itemType === type),
                )}</td>
              ))}
            </tr>
              );
            })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">รวมช่วงที่แสดง{deliveryCounts(plannedScope, actualScope)}</th>
                  {[1, 2, 3, 4, 5].map(w => <td className="mb-board-total" key={w}>{deliveryCounts(
                    plannedScope.filter(i => weekOf(forecast(i)!) === w),
                    actualScope.filter(i => weekOf(i.actual.deliveryDate!) === w),
                  )}</td>)}
                  {itemTypes.map(type => <td className="mb-board-total" key={type}>{deliveryCounts(
                    plannedScope.filter(i => i.itemType === type),
                    actualScope.filter(i => i.itemType === type),
                  )}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          itemTable(visible)
        )}
        {week > 0 && view === "weekly" && (
          <>
            <h3>W{week} • รายละเอียดส่งมอบ</h3>
            {itemTable(visible)}
          </>
        )}
      </section>
      <section className="mb-panel">
        <h2>Action Required</h2>
        <div className="mb-issues">
          {visible
            .filter((i) => issues(i).length)
            .map((i) => (
              <article className="mb-issue" key={i.id}>
                <button className="mb-link" onClick={() => p.openItem(i.id)}>
                  {i.id}
                </button>
                <p>{issues(i).join(" • ")}</p>
                <button
                  disabled={!p.canWrite || p.busy}
                  onClick={() => startAction(i, issues(i).join("; "))}
                >
                  เพิ่ม Meeting Action
                </button>
              </article>
            ))}
        </div>
        {!visible.length && <Empty />}
      </section>
      {editing && (
        <section className="mb-panel">
          <h2>Meeting Decision • {editing.itemId}</h2>
          <div className="mb-form">
            {(
              [
                "meetingDate",
                "issue",
                "discussion",
                "decision",
                "action",
                "owner",
                "dueDate",
              ] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    meetingDate: "Meeting Date",
                    issue: "Issue",
                    discussion: "Discussion",
                    decision: "Decision",
                    action: "Action Required",
                    owner: "Responsible Person",
                    dueDate: "Due Date",
                  }[key]
                }
                {/Date/.test(key) ? (
                  <DateInput
                    value={editing[key]}
                    onChange={(value) =>
                      setEditing({
                        ...editing,
                        [key]: key === "dueDate" ? value : value || "",
                      })
                    }
                  />
                ) : (
                  <input
                    type="text"
                    value={editing[key] || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, [key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
            <label>
              Action Status
              <select
                value={editing.status}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    status: e.target.value as MeetingAction["status"],
                  })
                }
              >
                {["Open", "In Progress", "Completed", "Cancelled"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          {err && <p role="alert">{err}</p>}
          <div className="mb-actions">
            <button
              className="primary"
              disabled={p.busy || !p.canWrite}
              onClick={() => {
                void saveAction();
              }}
            >
              บันทึก Meeting Action
            </button>
            <button onClick={() => setEditing(null)}>ยกเลิก</button>
          </div>
        </section>
      )}
      <section className="mb-panel">
        <h2>Planning Meeting Notes & Actions</h2>
        <p>
          ประวัติยังอยู่หลังอัปเดต Supplier • แสดงตาม Item filters และสัปดาห์ที่เลือก
          ทุกวันที่ประชุม
        </p>
        <div className="mb-table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Meeting / Item",
                  "Issue / Discussion",
                  "Decision / Action",
                  "Responsible",
                  "Due Date",
                  "Status",
                  "Edit",
                ].map((v) => (
                  <th key={v}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.data.meetingActions
                .filter((a) => visible.some((i) => i.id === a.itemId))
                .map((a) => (
                  <tr key={a.id}>
                    <td>
                      {thaiDate(a.meetingDate)}
                      <small>{a.itemId}</small>
                    </td>
                    <td>
                      {a.issue}
                      <small>{a.discussion}</small>
                    </td>
                    <td>
                      {a.decision}
                      <small>{a.action}</small>
                    </td>
                    <td>{a.owner}</td>
                    <td>{thaiDate(a.dueDate)}</td>
                    <td>{a.status}</td>
                    <td>
                      <button
                        disabled={!p.canWrite || p.busy}
                        onClick={() => {
                          if (
                            !editing ||
                            window.confirm(
                              "มีบันทึกประชุมยังไม่บันทึก ต้องการเปลี่ยนรายการหรือไม่?",
                            )
                          ) {
                            setEditingOriginal(JSON.stringify(a));
                            setErr("");
                            setEditing({ ...a });
                          }
                        }}
                      >
                        แก้ไข
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <label>
          เพิ่มบันทึกสำหรับ Item
          <select
            aria-label="New meeting item"
            disabled={!p.canWrite || p.busy}
            value=""
            onChange={(e) => {
              const i = visible.find((x) => x.id === e.target.value);
              if (i) startAction(i, "Planning coordination");
            }}
          >
            <option value="">เลือกรายการ</option>
            {visible.map((i) => (
              <option key={i.id}>{i.id}</option>
            ))}
          </select>
        </label>
      </section>
    </>
  );
}
