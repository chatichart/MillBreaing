import { AppData, dataSchema } from "../models/schema";
import { Repository, Snapshot, ConflictError } from "./types";
import { validatePdf } from "../services/documents";
export { ConflictError } from "./types";
export interface SharePointConfig {
  siteUrl: string;
  libraryPath: string;
  dataFolder: string;
  documentFolder: string;
  writerEnabled: boolean;
}
export type Transport = (url: string, init?: RequestInit) => Promise<Response>;
const quoted = (s: string): string =>
  encodeURIComponent(s.replace(/'/g, "''")).replace(/'/g, "%27");
export class SharePointRepository implements Repository {
  public readonly mode = "sharepoint" as const;
  private file: string;
  public constructor(
    private config: SharePointConfig,
    private request: Transport,
  ) {
    const u = new URL(config.siteUrl);
    if (u.protocol !== "https:")
      throw new Error("SharePoint HTTPS site URL required");
    for (const p of [
      config.libraryPath,
      config.dataFolder,
      config.documentFolder,
    ])
      if (!p || p.includes("..") || /[#%?\\\r\n]/.test(p))
        throw new Error("Invalid SharePoint path");
    if (
      !config.libraryPath.startsWith("/") ||
      config.libraryPath.startsWith("//")
    )
      throw new Error("Library must be server relative");
    this.file = `${config.libraryPath}/${config.dataFolder}/data.json`.replace(
      /\/+/g,
      "/",
    );
  }
  private endpoint(path: string): string {
    return `${this.config.siteUrl.replace(/\/$/, "")}/_api/web/${path}`;
  }
  private fileEndpoint(path = this.file): string {
    return this.endpoint(
      `GetFileByServerRelativePath(decodedurl='${quoted(path)}')`,
    );
  }
  private async checked(url: string, init?: RequestInit): Promise<Response> {
    const r = await this.request(url, {
      ...init,
      headers: {
        Accept: "application/json;odata=nometadata",
        "Cache-Control": "no-cache",
        ...init?.headers,
      },
    });
    if (!r.ok)
      throw new Error(
        `SharePoint ${r.status}: ${r.status === 403 ? "ไม่มีสิทธิ์แก้ไข" : r.status === 404 ? "ไม่พบไฟล์ / กรุณาตั้งค่าคลังเอกสาร" : "การทำงานไม่สำเร็จ กรุณาตรวจสอบสถานะก่อนลองอีกครั้ง"}`,
      );
    return r;
  }
  public async load(): Promise<Snapshot> {
    const r = await this.checked(this.fileEndpoint() + "/$value");
    const data = dataSchema.parse(await r.json());
    return { data, token: JSON.stringify(data) };
  }
  public async canWrite(): Promise<boolean> {
    if (!this.config.writerEnabled) return false;
    const r = await this.checked(
      this.fileEndpoint() + "/ListItemAllFields/effectiveBasePermissions",
    );
    const p = await r.json();
    const low = Number(p.Low ?? p.EffectiveBasePermissions?.Low ?? 0);
    return (low & 2) === 2 && (low & 4) === 4;
  }
  public async save(base: Snapshot, next: AppData): Promise<Snapshot> {
    if (!this.config.writerEnabled)
      throw new Error(
        "Production writes disabled until serialization and permissions acceptance is verified",
      );
    const run = async (): Promise<Snapshot> => {
      dataSchema.parse(next);
      const info = await (
        await this.checked(this.fileEndpoint() + "?$select=CheckOutType")
      ).json();
      if (info.CheckOutType !== 2)
        throw new Error("data.json ถูก Check out อยู่แล้ว ห้ามข้ามการล็อก");
      let locked = false;
      let wrote = false;
      try {
        await this.checked(this.fileEndpoint() + "/CheckOut()", {
          method: "POST",
        });
        locked = true;
        const current = await this.load();
        if (current.token !== base.token) throw new ConflictError(current);
        const saved = dataSchema.parse({
          ...next,
          revision: current.data.revision + 1,
        });
        await this.checked(this.fileEndpoint() + "/$value", {
          method: "POST",
          headers: {
            "X-HTTP-Method": "PUT",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(saved),
        });
        wrote = true;
        await this.checked(
          this.fileEndpoint() +
            "/CheckIn(comment='Purchasing update',checkintype=1)",
          { method: "POST" },
        );
        locked = false;
        const persisted = await this.load();
        if (
          persisted.data.revision !== saved.revision ||
          persisted.token !== JSON.stringify(saved)
        )
          throw new Error(
            "Save confirmation mismatch. Reload before retrying.",
          );
        return persisted;
      } finally {
        if (locked) {
          if (!wrote)
            await this.checked(this.fileEndpoint() + "/UndoCheckOut()", {
              method: "POST",
            }); /* After a write/check-in error retain checkout for administrator recovery. */
        }
      }
    };
    const locks =
      typeof navigator !== "undefined"
        ? (
            navigator as Navigator & {
              locks?: {
                request: <T>(
                  key: string,
                  callback: () => Promise<T>,
                ) => Promise<T>;
              };
            }
          ).locks
        : undefined;
    return locks
      ? locks.request(`mill-bearing:${this.config.siteUrl}:${this.file}`, run)
      : run();
  }
  public async upload(
    itemId: string,
    file: File,
    kind: string,
    revision: string,
  ): Promise<string> {
    if (!(await this.canWrite())) throw new Error("ไม่มีสิทธิ์อัปโหลด");
    await validatePdf(file);
    if (
      !/^[LBAU]-\d{3,}$/.test(itemId) ||
      !/^[-\w.]{1,30}$/.test(revision) ||
      !/^\w+$/.test(kind)
    )
      throw new Error("Invalid document metadata");
    const folder = `${this.config.libraryPath}/${this.config.documentFolder}/${itemId}`;
    const exists = await this.request(
      this.endpoint(
        `GetFolderByServerRelativePath(decodedurl='${quoted(folder)}')`,
      ),
    );
    if (exists.status === 404)
      await this.checked(this.endpoint("folders"), {
        method: "POST",
        headers: { "Content-Type": "application/json;odata=nometadata" },
        body: JSON.stringify({ ServerRelativeUrl: folder }),
      });
    else if (!exists.ok) throw new Error(`SharePoint folder ${exists.status}`);
    const filename = `${kind}_${revision}_${crypto.randomUUID()}.pdf`;
    await this.checked(
      this.endpoint(
        `GetFolderByServerRelativePath(decodedurl='${quoted(folder)}')/Files/AddUsingPath(decodedurl='${quoted(filename)}',overwrite=false)`,
      ),
      {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      },
    );
    const path = `${folder}/${filename}`;
    try {
      const info = await (
        await this.checked(this.fileEndpoint(path) + "?$select=CheckOutType")
      ).json();
      if (info.CheckOutType === 0 || info.CheckOutType === 1) {
        await this.checked(
          this.fileEndpoint(path) +
            "/CheckIn(comment='Purchasing PDF revision',checkintype=1)",
          { method: "POST" },
        );
      } else if (info.CheckOutType !== 2) {
        throw new Error("Unable to verify PDF check-in state");
      }
    } catch (error) {
      throw new Error(
        `PDF uploaded at ${path}, but publishing was not confirmed: ${String(error)}. Retain this path for administrator recovery.`,
      );
    }
    return path;
  }
}
