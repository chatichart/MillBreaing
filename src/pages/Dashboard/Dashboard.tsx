import * as React from "react";
import { PageProps, Kpis, Empty } from "../../components/Common";
import { curve, metrics } from "../../domain/rules";
export default function Dashboard(p: PageProps): React.ReactElement {
  const [aggregation, setAggregation] = React.useState<"weekly" | "monthly">(
    "weekly",
  );
  const m = metrics(p.data, p.items, p.asOf);
  const points = curve(p.data, p.items, aggregation, p.asOf);
  const line = (key: "planned" | "actual"): string =>
    points
      .map((v, n) =>
        v[key] === null
          ? ""
          : `${n === 0 ? "M" : "L"}${70 + (n / Math.max(1, points.length - 1)) * 850},${260 - (v[key] || 0) * 2.1}`,
      )
      .join(" ");
  return (
    <>
      <Kpis
        values={[
          { label: "รายการทั้งหมด", value: m.total },
          { label: "แผนส่งมอบถึงวันนี้", value: m.planned },
          { label: "ส่งมอบยืนยันแล้ว", value: m.delivered },
          {
            label: "Delivery Achievement",
            value: `${m.achievement.toFixed(1)}%`,
            hint: "Confirmed delivered / planned to date",
          },
          { label: "ผลิตเสร็จ / QC Pass", value: m.completed },
          { label: "พร้อมส่ง", value: m.ready },
          { label: "รอชิ้นส่วนคู่", value: m.waitingPair },
          { label: "รอรถรับ", value: m.waitingTruck },
          { label: "ล่าช้า", value: m.delayed },
        ]}
      />
      <section className="mb-panel">
        <div className="mb-section-head">
          <div>
            <h2>Delivery S-Curve</h2>
            <p>
              แผนเดิมเทียบผลส่งมอบยืนยัน • Denominator:{" "}
              {p.items.filter((i) => i.baseline.deliveryDate).length} baseline
              items • ไม่รวมรายการที่ยังไม่มี baseline date
            </p>
          </div>
          <select
            aria-label="Curve aggregation"
            value={aggregation}
            onChange={(e) =>
              setAggregation(e.target.value as "weekly" | "monthly")
            }
          >
            <option value="weekly">รายสัปดาห์ W1–W5</option>
            <option value="monthly">รายเดือน</option>
          </select>
        </div>
        {!points.length ? (
          <Empty>นำเข้าแผนที่มีวันส่งมอบเพื่อแสดง S-Curve</Empty>
        ) : (
          <>
            <div className="mb-chart">
              <svg
                viewBox="0 0 960 310"
                role="img"
                aria-label="Cumulative planned and confirmed actual delivery percentage"
              >
                {[0, 25, 50, 75, 100].map((v) => (
                  <g key={v}>
                    <line
                      x1="70"
                      x2="920"
                      y1={260 - v * 2.1}
                      y2={260 - v * 2.1}
                      stroke="#e4eaf1"
                    />
                    <text x="20" y={265 - v * 2.1}>
                      {v}%
                    </text>
                  </g>
                ))}
                <path
                  d={line("planned")}
                  fill="none"
                  stroke="#2675db"
                  strokeWidth="3"
                />
                <path
                  d={line("actual")}
                  fill="none"
                  stroke="#15856c"
                  strokeWidth="3"
                />
                {points
                  .filter(
                    (_, n) =>
                      n % Math.max(1, Math.ceil(points.length / 7)) === 0,
                  )
                  .map((v) => (
                    <text
                      key={v.label}
                      x={
                        70 +
                        (points.indexOf(v) / Math.max(1, points.length - 1)) *
                          850
                      }
                      y="293"
                      textAnchor="middle"
                    >
                      {v.label}
                    </text>
                  ))}
              </svg>
            </div>
            <div className="mb-legend">
              <span className="mb-dot planned" />
              Original Plan <span className="mb-dot ready" />
              Confirmed Actual
            </div>
            <details>
              <summary>ตารางข้อมูล S-Curve</summary>
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Planned %</th>
                    <th>Actual %</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((v) => (
                    <tr key={v.label}>
                      <td>{v.label}</td>
                      <td>{v.planned.toFixed(1)}</td>
                      <td>{v.actual?.toFixed(1) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </section>
      <div className="mb-two">
        <section className="mb-panel">
          <h2>Delivery by Supplier</h2>
          {p.data.suppliers.map((s) => {
            const v = metrics(
              p.data,
              p.items.filter((i) => i.supplierId === s.id),
              p.asOf,
            );
            return (
              <div className="mb-supplier" key={s.id}>
                <strong>{s.name}</strong>
                <progress value={v.delivered} max={v.total || 1} />
                <span>
                  {v.delivered} / {v.total} ส่งมอบ • ล่าช้า {v.delayed}
                </span>
              </div>
            );
          })}
        </section>
        <section className="mb-panel">
          <h2>Delivery Readiness</h2>
          {[
            { label: "Ready for Delivery", n: m.ready },
            { label: "Delivered", n: m.delivered },
            { label: "Waiting for Truck", n: m.waitingTruck },
            { label: "Waiting for Pair", n: m.waitingPair },
          ].map((v) => (
            <div className="mb-bar" key={v.label}>
              <span>{v.label}</span>
              <progress value={v.n} max={m.total || 1} />
              <strong>{v.n}</strong>
            </div>
          ))}
          <p>
            Complete pairs delivered: <b>{m.pairs}</b> • แยกจาก KPI รายชิ้น
          </p>
        </section>
      </div>
    </>
  );
}
