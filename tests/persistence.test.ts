import { it, expect } from "vitest";
import { emptyData } from "../src/models/schema";
import { SharePointRepository } from "../src/repositories/SharePointRepository";
const config = {
  siteUrl: "https://tenant.sharepoint.com/sites/p",
  libraryPath: "/sites/p/Documents",
  dataFolder: "Purchasing/data",
  documentFolder: "Purchasing/documents",
  writerEnabled: true,
};
it("saves only after checkout, compares latest, checks in and confirms persisted values", async () => {
  let data = emptyData();
  const calls: string[] = [];
  const transport = async (
    url: string,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push(`${init?.method || "GET"} ${url}`);
    if (url.includes("CheckOutType")) return Response.json({ CheckOutType: 2 });
    if (url.endsWith("/$value")) {
      if (init?.method === "POST") {
        data = JSON.parse(String(init.body));
        return new Response("", { status: 200 });
      }
      return Response.json(data);
    }
    return new Response("", { status: 200 });
  };
  const repo = new SharePointRepository(config, transport);
  const base = await repo.load();
  const next = structuredClone(base.data);
  next.settings.requireDocumentsForReady = true;
  const saved = await repo.save(base, next);
  expect(saved.data.revision).toBe(1);
  expect(saved.data.settings.requireDocumentsForReady).toBe(true);
  const write = calls.findIndex(
    (x) => x.startsWith("POST") && x.endsWith("/$value"),
  );
  expect(calls.findIndex((x) => x.includes("CheckOut()"))).toBeLessThan(write);
  expect(calls.findIndex((x) => x.includes("CheckIn("))).toBeGreaterThan(write);
});
it("refuses pre-existing checkout without attempting to write", async () => {
  const calls: string[] = [];
  const repo = new SharePointRepository(config, async (url) => {
    calls.push(url);
    return Response.json({ CheckOutType: 0 });
  });
  const data = emptyData();
  await expect(
    repo.save({ data, token: JSON.stringify(data) }, data),
  ).rejects.toThrow(/Check out/);
  expect(calls).toHaveLength(1);
});
it("does not release checkout after a successful PUT whose check-in failed", async () => {
  const data = emptyData();
  const calls: string[] = [];
  const repo = new SharePointRepository(config, async (url, init) => {
    calls.push(url);
    if (url.includes("CheckOutType")) return Response.json({ CheckOutType: 2 });
    if (url.includes("CheckIn(")) return new Response("", { status: 503 });
    if (url.endsWith("/$value") && !init?.method) return Response.json(data);
    return new Response("", { status: 200 });
  });
  await expect(
    repo.save({ data, token: JSON.stringify(data) }, data),
  ).rejects.toThrow(/503/);
  expect(calls.some((x) => x.includes("UndoCheckOut"))).toBe(false);
});
it("production writes default to disabled until administrator acceptance", async () => {
  const repo = new SharePointRepository(
    { ...config, writerEnabled: false },
    async () => {
      throw new Error("Should not call SharePoint");
    },
  );
  const data = emptyData();
  expect(await repo.canWrite()).toBe(false);
  await expect(repo.save({ data, token: "" }, data)).rejects.toThrow(
    /disabled/,
  );
});
it("checks newly uploaded PDF revisions in when library requires checkout", async () => {
  const calls: string[] = [];
  const repo = new SharePointRepository(config, async (url) => {
    calls.push(url);
    if (url.includes("effectiveBasePermissions"))
      return Response.json({ Low: 6 });
    if (url.includes("?$select=CheckOutType"))
      return Response.json({ CheckOutType: 0 });
    return new Response("", { status: 200 });
  });
  const url = await repo.upload(
    "L-001",
    new File(["%PDF-1.7\nhello"], "cert.pdf", { type: "application/pdf" }),
    "MATERIAL_CERT",
    "1",
  );
  expect(url).toContain("/documents/L-001/MATERIAL_CERT_1_");
  expect(calls.some((x) => x.includes("overwrite=false"))).toBe(true);
  expect(calls.some((x) => x.includes("CheckIn("))).toBe(true);
});
