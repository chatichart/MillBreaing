import { thaiDate } from "../domain/rules";
import * as React from "react";
import { PageProps } from "./Common";
import { ImportPreview, previewImport, applyImport } from "../domain/import";
import { readPlanFile } from "../services/planFiles";
import { download } from "../services/export";
export default function ImportPanel(p: PageProps): React.ReactElement {
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [error, setError] = React.useState("");
  const [mode, setMode] = React.useState<"FORECAST" | "BASELINE">("FORECAST");
  const [reason, setReason] = React.useState("");
  const [approved, setApproved] = React.useState(false);
  const pick = async (file: File): Promise<void> => {
    try {
      setError("");
      setApproved(false);
      setPreview(previewImport(await readPlanFile(file), p.data));
    } catch (e) {
      setError(String(e));
    }
  };
  const apply = async (): Promise<void> => {
    if (!preview) return;
    try {
      const next = applyImport(
        p.data,
        preview,
        mode,
        p.user,
        new Date().toISOString(),
        reason,
      );
      if (await p.save(next)) setPreview(null);
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <details className="mb-panel">
      <summary>
        นำเข้า Supplier Plan / เพิ่มรายการ • CSV, XLSX, normalized PDF JSON
      </summary>
      <p>
        ไม่มีไฟล์แผนอ้างอิงใน workspace • จะไม่เดาวันที่หรือจำนวน • Import Actual
        ไม่ได้รับอนุญาต
      </p>
      <button
        onClick={() =>
          download(
            "plan-template.csv",
            "id,itemType,description,supplierId,castingDate,finishingDate,qcDate,deliveryDate\r\n",
          )
        }
      >
        ดาวน์โหลด Template
      </button>
      <label>
        เลือกไฟล์แผน
        <input
          type="file"
          accept=".csv,.xlsx,.json"
          disabled={!p.canWrite || p.busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mb-error">
          {error}
        </p>
      )}
      {preview && (
        <>
          <p>
            {preview.rows.length} rows • {preview.errors.length} errors •{" "}
            {preview.warnings.length} warnings
          </p>
          {preview.errors.map((e, n) => (
            <p className="mb-error" key={n}>
              {e}
            </p>
          ))}
          {preview.warnings.map((e, n) => (
            <p key={n}>{e}</p>
          ))}
          <div className="mb-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Type</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, n) => (
                  <tr key={n}>
                    <td>{r.id}</td>
                    <td>{r.itemType}</td>
                    <td>{thaiDate(r.deliveryDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label>
            วิธีนำเข้า
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as "FORECAST" | "BASELINE");
                setApproved(false);
              }}
            >
              <option value="FORECAST">
                Forecast revision (รักษา baseline และ Actual)
              </option>
              <option value="BASELINE">Explicit baseline revision</option>
            </select>
          </label>
          {mode === "BASELINE" && (
            <>
              <label>
                เหตุผลแก้ไข Baseline
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="mb-check">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                ยืนยันการเปลี่ยนแปลง baseline โดยมี audit history
              </label>
            </>
          )}
          <button
            className="primary"
            disabled={
              !p.canWrite ||
              p.busy ||
              !!preview.errors.length ||
              (mode === "BASELINE" && (!approved || !reason.trim()))
            }
            onClick={() => {
              void apply();
            }}
          >
            ยืนยัน Import ที่แสดง
          </button>
        </>
      )}
    </details>
  );
}
