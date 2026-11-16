import { Repository, Snapshot, ConflictError } from "./types";
import { AppData, dataSchema } from "../models/schema";
import { previewData } from "../mock/seed";
import { validatePdf } from "../services/documents";
import { addInitialItems, INITIAL_COUNTS_ACTION } from "../domain/initialItems";
export class PreviewRepository implements Repository {
  public readonly mode = "preview" as const;
  private key = "realsoluplus-mill-bearing-preview-v1";
  public async load(): Promise<Snapshot> {
    return navigator.locks
      ? navigator.locks.request(this.key, async () => this.loadUnlocked())
      : this.loadUnlocked();
  }
  private loadUnlocked(): Snapshot {
    const raw = localStorage.getItem(this.key);
    let data = dataSchema.parse(raw ? JSON.parse(raw) : previewData());
    if (!data.auditEvents.some((a) => a.action === INITIAL_COUNTS_ACTION)) {
      if (
        raw &&
        !localStorage.getItem("realsoluplus-mill-bearing-before-initial-counts")
      )
        localStorage.setItem(
          "realsoluplus-mill-bearing-before-initial-counts",
          raw,
        );
      const before = data.items.length;
      data = addInitialItems(data);
      data.revision += 1;
      data.auditEvents.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        by: "Local initialization (user-confirmed quantities)",
        entityId: "MILL-BEARING",
        action: INITIAL_COUNTS_ACTION,
        before: JSON.stringify({ items: before }),
        after: JSON.stringify({ items: data.items.length }),
      });
      data = dataSchema.parse(data);
      localStorage.setItem(this.key, JSON.stringify(data));
    }
    return { data, token: JSON.stringify(data) };
  }
  public async canWrite(): Promise<boolean> {
    return true;
  }
  public async save(base: Snapshot, next: AppData): Promise<Snapshot> {
    const run = async (): Promise<Snapshot> => {
      const current = this.loadUnlocked();
      if (current.token !== base.token) throw new ConflictError(current);
      const data = dataSchema.parse({
        ...next,
        revision: current.data.revision + 1,
      });
      localStorage.setItem(this.key, JSON.stringify(data));
      return { data, token: JSON.stringify(data) };
    };
    return navigator.locks ? navigator.locks.request(this.key, run) : run();
  }
  public async upload(
    _id: string,
    file: File,
    _kind: string,
    _rev: string,
  ): Promise<string> {
    await validatePdf(file);
    throw new Error(
      "PDF upload ต้องเชื่อมต่อ SharePoint; preview ไม่เก็บเอกสาร production",
    );
  }
}
