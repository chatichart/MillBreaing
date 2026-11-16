# Mill Bearing — Purchasing Supplier Tracking

**จำนวนตั้งต้นที่ผู้ใช้ยืนยันจากภาพ:** Load 50 (`L-001`–`L-050`), Bottom 10 (`B-001`–`B-010`), AL Cover 20 (`A-001`–`A-020`), Unload 20 (`U-001`–`U-020`) รวม 100 รายการ ไม่มีการเดาวันที่หรือจับคู่จากเลขลำดับ Local Preview จะเติมเฉพาะ ID ที่ขาดและเก็บข้อมูลเดิม/backup ไว้ ใช้ `docs/fixtures/data.initial-100.json` สำหรับเริ่มต้น SharePoint ใหม่ หรือ import `docs/fixtures/initial-items-100.csv` หลังตรวจ preview; ห้ามเขียนทับไฟล์ Production ที่มีอยู่

**อัปเดตล่าสุด:** หน้า Item Detail มี Filter ประเภทสินค้าก่อนเลือก Item ID และเปิดให้กรอก Original Plan ได้ชั่วคราวจนกว่าผู้ใช้จะสั่งปิดอีกครั้ง (`src/config/workflow.ts`) รวมถึง Delivery Plan ที่ใช้เป็นแผนตั้งต้น ทุกการบันทึกยังมี audit และไม่เติม Actual อัตโนมัติ

เว็บแอปติดตามผู้ผลิตของ Realsoluplus: SPFx 1.24.1 + React 18.3.1 + TypeScript 5.8, จัดเก็บ JSON และ PDF ใน SharePoint Online ด้วยบัญชี Microsoft 365 ปัจจุบัน

พัฒนาใน `D:\AI\Mill Bearing` ตามคำสั่งผู้ใช้ เก็บ `Agent.md` ต้นฉบับไว้ครบถ้วน ข้อกำหนดล่าสุด: **ตัด Drawing ออก** เพราะออก PO แล้ว และ **Delivery มีเพียง Plan กับ Actual** แผนเดิมยังเก็บในประวัติเพื่อรายงาน

## เริ่มใช้งาน Local Preview

```powershell
npm ci
npm run preview
```

เปิด <http://127.0.0.1:5173/> มีสี่หน้าหลัก: Dashboard, Supplier Tracking, Item Detail และ Planning Coordination (Weekly Delivery Control Board)

Preview ตั้งต้นตามจำนวนที่ยืนยัน 100 รายการ และ Actual ของรายการใหม่ว่างทั้งหมด บันทึกเฉพาะ localStorage ของ browser ใช้แยกจาก SharePoint ไม่อัปโหลดหรือจำลองความสำเร็จของเอกสาร Production seed อยู่ที่ `docs/fixtures/data.empty.json` และไม่มีรายการสินค้า ไม่มี Actual ห้ามนำ preview seed ไปตั้ง Production

## การทำงาน

- Dashboard: KPI รายชิ้น, Delivery S-Curve รายเดือน/สัปดาห์, supplier performance และสรุปรอรถ/รอคู่ สูตร Actual ใช้วันที่รับสินค้าจริงที่ Purchasing บันทึก ไม่ใช้ผลิตเสร็จแทนส่งมอบ
- Supplier Tracking: ค้นหาและกรอง, เรียง Plan/ความล่าช้า, Plan/Actual ของ Casting–Finishing–QC–Delivery และ Quick Follow-up
- Item Detail: Actual milestone ที่เว้นว่างได้, QC Pass/Fail/Rework, Delivery Plan/Actual, readiness, supplier correction, delay/follow-up, pairing แบบกำหนดเอง, PDF Material Certificate/QC Dimension Check หลาย revision และ audit history
- Planning Coordination: W1 (1–7), W2 (8–14), W3 (15–21), W4 (22–28), W5 (29–สิ้นเดือน), รายการ/board, drill-down, meeting decisions/action owner/due/status และ export CSV ตาม filters พร้อมวันที่รายงาน
- CSV/XLSX/normalized PDF JSON import มี preview และ validation ไม่เติมข้อมูลที่ขาด ไม่แก้วันที่ผิดเงียบ ๆ ไม่ลบรายการเก่า และไม่เปลี่ยน Actual
- ทุกวันที่จัดเก็บใช้ ISO Gregorian; แสดง dd/mm/yyyy ปี ค.ศ. และใช้ Asia/Bangkok
- SharePoint repository: checkout, ตรวจ snapshot หลัง lock, audit, check-in, ยืนยัน persisted values ก่อนแจ้งสำเร็จ; ป้องกัน stale overwrite และเก็บ draft เมื่อ conflict
- PDF แยกจาก JSON, unique filenames ไม่ทับ revision เดิม; ตรวจชื่อไฟล์ ลายเซ็น PDF และขนาด 20 MB (ไม่ใช่ antivirus)

Original baseline และ current Delivery Plan แยกกันภายใน ผู้ใช้เห็น Delivery Plan/Actual เท่านั้น การเปลี่ยน Plan ไม่เปลี่ยนเส้น Original Plan ใน S-Curve; การเปลี่ยน baseline ผ่าน explicit import revision พร้อมเหตุผลและ audit เท่านั้น

## ตรวจสอบและสร้างแพ็กเกจ

```powershell
npm test
npm run typecheck
npm run build
npm run build:preview
```

`npm test` ใช้ Vitest (domain, imports, persistence/checkout failures, PDF validation, UI/read-only/draft workflows) ส่วน Heft/Jest ที่มากับ generator ไม่มี Jest tests จึงต้องรัน Vitest แยก

SPFx package: `sharepoint/solution/mill-bearing.sppkg` / preview build: `dist-preview/`

Production application source: `src/webparts/millBearing/MillBearingWebPart.ts` → `src/components/App.tsx`; Vite preview entry แยกที่ `src/preview.tsx` ไม่ถูกรวมเป็น SPFx entry

## ต้องทำก่อน Production

ยังไม่มี tenant/site configuration และไม่มี source schedules จึงยังไม่ทดสอบหรืออ้างว่าติดตั้งบน SharePoint สำเร็จ เปิด production writes เป็น false โดยเริ่มต้น ต้องเตรียม App Catalog, Library, version history, checkout policies, permissions และทดสอบด้วย tenant จริง

**โหมดเขียนที่รองรับสำหรับเริ่มใช้งาน: designated single active writer session เท่านั้น** Checkout อิง identity และ Web Locks จำกัด browser origin เดียว ไม่รับประกันการเขียนพร้อมกันจากหลายอุปกรณ์โดยใช้ identity เดียว ต้องคง read-only จนผู้ดูแลยอมรับกระบวนการ serialization; multi-editor rollout ต้องพิสูจน์ lock semantics หรือเพิ่ม coordinator ที่เหมาะกับ tenant ก่อน

อ่านขั้นตอนทั้งหมดใน [Deployment & recovery](docs/DEPLOYMENT.md), [Import guide](docs/IMPORT.md), [Verification record](docs/VERIFICATION.md), และ [ตัวอย่าง config](config/sharepoint.example.json)

ไม่มี PostgreSQL, backend login, SharePoint Lists หรือ Dokploy deployment เพราะข้อกำหนดแอปนี้เลือก SharePoint Web Part โดยเฉพาะ ไม่ใช้ OneDrive sync เป็นฐานข้อมูล Production

## ข้อจำกัดและงานสิ่งแวดล้อม

- ยังไม่ได้รับ PlanRev.pdf หรือแผน Unload จึงไม่สร้างจำนวน/วันที่ตามการคาดเดา
- ต้องตรวจ SharePoint save/reload, cross-user และ same-user multi-device concurrency, ACL, upload/check-in/download และ backup restore ด้วย tenant จริงตาม checklist
- Backup เป็นขั้นตอนผู้ดูแล ยังไม่มี scheduled backup ที่สร้างใน tenant
- PDF upload ใน preview จงใจแจ้งว่าต้องเชื่อม SharePoint ไม่สร้าง URL หลอกว่า upload สำเร็จ
- Dependency audit สำหรับ production ไม่มี advisory ณ การตรวจรอบนี้; dev toolchain มี advisories ที่บันทึกใน docs/npm-audit.json โปรดตรวจใหม่ก่อน deployment
- หากใช้ OneDrive ในอนาคต ให้ยกเว้น node_modules/temp/lib/dist จากการ sync ตามนโยบายบริษัท และอย่าใช้ sync เป็น concurrency control

## Item Detail Table View

สลับ Form View / Table View ได้โดยรักษาฉบับร่างไว้ในแต่ละมุมมอง Table View ใช้ตัวกรองประเภทสินค้าร่วมกัน แก้ไขได้เฉพาะ Casting Original, Finishing Original, QC Original และ Delivery Plan บันทึกหลายรายการครั้งเดียวพร้อม audit โดยไม่แตะ Actual, Supplier หรือ supplier revisions ตรวจ baseline ล่าสุดก่อนบันทึกเพื่อไม่เขียนทับการแก้ไขจากผู้อื่น Original edit policy ยังคงเปิดจนกว่าผู้ใช้สั่งปิด

ช่องวันที่และการแสดงวันที่ทุกหน้าใช้ dd/mm/yyyy ปี ค.ศ. รวมถึง CSV report (เช่น 01/12/2026) ปฏิเสธวันที่ไม่มีจริงหรือกรอกไม่ครบ และ Cancel คืนค่าที่บันทึกไว้ ค่าภายใน JSON/API และ source import ยังคง ISO YYYY-MM-DD เพื่อคำนวณและตรวจ schema อย่างปลอดภัย ตัวเลือกเดือนเป็นตัวกรองรายเดือน ไม่ใช่วันส่งมอบ
