import DateInput from "./DateInput";
import * as React from "react";
import { AppData, Item, itemTypes, typeLabels } from "../models/schema";
import { Filters, statuses, tone } from "../domain/rules";
export interface PageProps {
  data: AppData;
  items: Item[];
  asOf: string;
  canWrite: boolean;
  busy: boolean;
  user: string;
  onDirty: (dirty: boolean) => void;
  openItem: (id: string) => void;
  save: (next: AppData) => Promise<boolean>;
  getSavedData?: () => AppData | undefined;
}
export function Badge({ value }: { value: string }): React.ReactElement {
  return (
    <span className={`mb-badge ${tone(value)}`}>
      {value === "Delivered" ? "✓ " : ""}
      {value}
    </span>
  );
}
export function Empty({
  children = "ยังไม่มีข้อมูลในขอบเขตที่เลือก",
}: {
  children?: React.ReactNode;
}): React.ReactElement {
  return <div className="mb-empty">{children}</div>;
}
export function FiltersBar({
  data,
  value,
  onChange,
  dates = false,
}: {
  data: AppData;
  value: Filters;
  onChange: (f: Filters) => void;
  dates?: boolean;
}): React.ReactElement {
  return (
    <div className="mb-filters">
      <label>
        ค้นหา
        <input
          placeholder="Item ID / รายละเอียด"
          value={value.search || ""}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
        />
      </label>
      <label>
        ผู้ผลิต
        <select
          value={value.supplier || ""}
          onChange={(e) => onChange({ ...value, supplier: e.target.value })}
        >
          <option value="">ผู้ผลิตทั้งหมด</option>
          {data.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        ประเภท
        <select
          value={value.type || ""}
          onChange={(e) => onChange({ ...value, type: e.target.value })}
        >
          <option value="">ทุกประเภท</option>
          {itemTypes.map((t) => (
            <option key={t} value={t}>
              {typeLabels[t]}
            </option>
          ))}
        </select>
      </label>
      <label>
        สถานะ
        <select
          value={value.status || ""}
          onChange={(e) => onChange({ ...value, status: e.target.value })}
        >
          <option value="">ทุกสถานะ</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {dates && (
        <>
          <label>
            เดือน Baseline
            <input
              type="month"
              value={value.month || ""}
              onChange={(e) => onChange({ ...value, month: e.target.value })}
            />
          </label>
          <label>
            ตั้งแต่
            <DateInput
              value={value.from}
              onChange={(v) => onChange({ ...value, from: v || "" })}
            />
          </label>
          <label>
            ถึง
            <DateInput
              value={value.to}
              onChange={(v) => onChange({ ...value, to: v || "" })}
            />
          </label>
        </>
      )}
      <label className="mb-check">
        <input
          type="checkbox"
          checked={!!value.delayed}
          onChange={(e) => onChange({ ...value, delayed: e.target.checked })}
        />
        เฉพาะล่าช้า
      </label>
      <button onClick={() => onChange({})}>ล้างตัวกรอง</button>
    </div>
  );
}
export function Kpis({
  values,
}: {
  values: { label: string; value: React.ReactNode; hint?: string }[];
}): React.ReactElement {
  return (
    <div className="mb-kpis">
      {values.map((v) => (
        <div className="mb-kpi" key={v.label}>
          <span>{v.label}</span>
          <strong>{v.value}</strong>
          {v.hint && <small>{v.hint}</small>}
        </div>
      ))}
    </div>
  );
}
