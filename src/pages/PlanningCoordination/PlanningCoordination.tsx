import DateInput from "../../components/DateInput";
import * as React from "react";
import { PageProps, Badge, Empty, Kpis } from "../../components/Common";
import { Item, MeetingAction } from "../../models/schema";
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
  const [month, setMonth] = React.useState(p.asOf.slice(0, 7));
  const [week, setWeek] = React.useState(0);
  const [view, setView] = React.useState("weekly");
  const [editing, setEditing] = React.useState<MeetingAction | null>(null);
  const [editingOriginal, setEditingOriginal] = React.useState<
    string | undefined
  >();
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    p.onDirty(!!editing);
    return () => p.onDirty(false);
  }, [!!editing, p.onDirty]);
  const boardDate = (i: Item): string | null => forecast(i);
  const scope = p.items.filter((i) => boardDate(i)?.startsWith(month));
  const visible = scope.filter((i) => !week || weekOf(boardDate(i)!) === week);
  const m = metrics(p.data, scope, p.asOf);
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
          { label: "แผนส่งมอบเดือนนี้", value: scope.length },
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
          สีรายรายการ: <Badge value="Ready for Delivery" />
          <Badge value="Planned / Expected" />
          <Badge value="Waiting for Truck" />
          <Badge value="Delayed" />
          <Badge value="Delivered" />
        </div>
        {view === "weekly" ? (
          <div className="mb-board">
            {[1, 2, 3, 4, 5].map((w) => (
              <section
                className={`mb-week ${week === w ? "selected" : ""}`}
                key={w}
              >
                <button
                  className="mb-week-head"
                  onClick={() => setWeek(week === w ? 0 : w)}
                >
                  W{w}
                  <small>
                    {(w - 1) * 7 + 1}–{w === 5 ? "End" : w * 7}
                  </small>
                </button>
                {scope
                  .filter((i) => weekOf(boardDate(i)!) === w)
                  .map((i) => {
                    let s = status(i, p.data, p.asOf);
                    if (
                      s !== "Delivered" &&
                      !/Waiting|Rework/.test(s) &&
                      delayDays(i, p.asOf) > 0
                    )
                      s = "At Risk / Delayed";
                    else if (
                      s === "Not Started" ||
                      s === "Casting" ||
                      s === "QC + Finishing"
                    )
                      s = "Planned / Expected";
                    return (
                      <button
                        key={i.id}
                        className={`mb-board-card ${tone(s)}`}
                        onClick={() => p.openItem(i.id)}
                      >
                        <strong>{i.id}</strong>
                        <span>{s === "Delivered" ? "✓ Delivered" : s}</span>
                        <small>{thaiDate(boardDate(i))}</small>
                      </button>
                    );
                  })}
                {!scope.some((i) => weekOf(boardDate(i)!) === w) && (
                  <div className="mb-no-items">No Items</div>
                )}
              </section>
            ))}
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
