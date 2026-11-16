import { AppData } from "../models/schema";
export interface Snapshot {
  data: AppData;
  token: string;
}
export interface Repository {
  readonly mode: "preview" | "sharepoint" | "postgres" | "demo";
  load(): Promise<Snapshot>;
  save(base: Snapshot, next: AppData): Promise<Snapshot>;
  canWrite(): Promise<boolean>;
  upload(
    itemId: string,
    file: File,
    kind: string,
    revision: string,
  ): Promise<string>;
}
export class ConflictError extends Error {
  constructor(public current: Snapshot) {
    super("ข้อมูลเปลี่ยนโดยผู้ใช้อื่น กรุณาโหลดล่าสุดแล้วนำการแก้ไขกลับมาใช้ (ฉบับร่างยังอยู่)");
    this.name = "ConflictError";
  }
}
