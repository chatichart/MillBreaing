import * as React from "react";
import { PageProps, Empty } from "../../components/Common";
import DateInput from "../../components/DateInput";
import { Item, AppData, typeLabels, dataSchema } from "../../models/schema";
import { ORIGINAL_PLAN_EDITABLE } from "../../config/workflow";
const columns = [
  ["castingDate", "Casting Original"],
  ["finishingDate", "Finishing Original"],
  ["qcDate", "QC Original"],
  ["deliveryDate", "Delivery Plan"],
] as const;
type Dates = Pick<
  Item["baseline"],
  "castingDate" | "finishingDate" | "qcDate" | "deliveryDate"
>;
interface Edit {
  before: Dates;
  values: Dates;
}
export default function OriginalPlanTable(p: PageProps): React.ReactElement {
  const [resetVersion, setResetVersion] = React.useState(0);
  const [invalidCells, setInvalidCells] = React.useState<Set<string>>(
    new Set(),
  );
  const [edits, setEdits] = React.useState<Record<string, Edit>>({});
  const [error, setError] = React.useState("");
  const dirty = Object.keys(edits).length > 0 || invalidCells.size > 0;
  React.useEffect(() => {
    p.onDirty(dirty);
    return () => p.onDirty(false);
  }, [dirty, p.onDirty]);
  const update = (i: Item, key: keyof Dates, value: string | null): void => {
    setEdits((previous) => {
      const next = { ...previous };
      const edit = next[i.id] || {
        before: { ...i.baseline },
        values: { ...i.baseline },
      };
      next[i.id] = {
        before: edit.before,
        values: { ...edit.values, [key]: value },
      };
      if (columns.every(([k]) => next[i.id].before[k] === next[i.id].values[k]))
        delete next[i.id];
      return next;
    });
  };
  const save = async (): Promise<void> => {
    setError("");
    try {
      const next: AppData = JSON.parse(JSON.stringify(p.data));
      for (const [id, edit] of Object.entries(edits)) {
        const i = next.items.find((x) => x.id === id);
        if (!i) throw new Error(`${id}: ไม่พบรายการล่าสุด`);
        const before = JSON.stringify(i);
        for (const [key] of columns) {
          if (edit.before[key] === edit.values[key]) continue;
          if (i.baseline[key] !== edit.before[key])
            throw new Error(
              `${id}: ${key} ถูกเปลี่ยนโดยผู้อื่น กรุณาตรวจค่าล่าสุดก่อนบันทึก`,
            );
          i.baseline[key] = edit.values[key];
        }
        i.updatedAt = new Date().toISOString();
        i.updatedBy = p.user;
        next.auditEvents.push({
          id: crypto.randomUUID(),
          at: i.updatedAt,
          by: p.user,
          entityId: id,
          action: "Original Plan table update",
          before,
          after: JSON.stringify(i),
        });
      }
      dataSchema.parse(next);
      if (await p.save(next)) {
        setEdits({});
        setResetVersion((v) => v + 1);
        setInvalidCells(new Set());
      }
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <section className="mb-panel">
      <h2>Original Plan • Table View</h2>
      <p>แก้ไขเฉพาะ 4 วันที่ • dd/mm/yyyy • ปี ค.ศ. • {p.items.length} รายการ</p>
      {error && (
        <p className="mb-error" role="alert">
          {error}
        </p>
      )}
      <div className="mb-actions" style={{ marginTop: 0, marginBottom: 16 }}>
        <button
          className="primary"
          disabled={!dirty || !p.canWrite || p.busy || !ORIGINAL_PLAN_EDITABLE}
          onClick={() => {
            void save();
          }}
        >
          บันทึก Original ({Object.keys(edits).length} รายการ)
        </button>
        <button
          disabled={!dirty || p.busy}
          onClick={() => {
            setEdits({});
            setError("");
            setResetVersion((v) => v + 1);
            setInvalidCells(new Set());
          }}
        >
          ยกเลิกการแก้ไขตาราง
        </button>
      </div>
      <div className="mb-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Item ID</th>
              <th>ประเภทสินค้า</th>
              <th>Supplier</th>
              {columns.map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.items.map((i) => (
              <tr key={i.id}>
                <td>{i.id}</td>
                <td>{typeLabels[i.itemType]}</td>
                <td>
                  {p.data.suppliers.find((s) => s.id === i.supplierId)?.name}
                </td>
                {columns.map(([key, label]) => (
                  <td key={key}>
                    <DateInput
                      key={`${i.id}:${key}:${resetVersion}`}
                      onInvalidChange={(invalid) =>
                        setInvalidCells((previous) => {
                          const next = new Set(previous);
                          const id = `${i.id}:${key}`;
                          if (invalid) next.add(id);
                          else next.delete(id);
                          return next;
                        })
                      }
                      label={`${i.id} ${label}`}
                      value={
                        edits[i.id] ? edits[i.id].values[key] : i.baseline[key]
                      }
                      disabled={
                        !p.canWrite || p.busy || !ORIGINAL_PLAN_EDITABLE
                      }
                      onChange={(v) => update(i, key, v)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!p.items.length && <Empty />}
      </div>
    </section>
  );
}
