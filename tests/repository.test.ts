import { it, expect } from "vitest";
import {
  SharePointRepository,
  ConflictError,
} from "../src/repositories/SharePointRepository";
import { emptyData } from "../src/models/schema";
import { validatePdf } from "../src/services/documents";

it("rejects changed snapshots after checkout without writing and releases checkout", async () => {
  const original = emptyData(),
    current = { ...emptyData(), revision: 2 };
  const calls: string[] = [];
  const transport = async (
    url: string,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push(`${init?.method || "GET"} ${url}`);
    if (url.includes("CheckOutType")) return Response.json({ CheckOutType: 2 });
    if (url.endsWith("/$value") && !init?.method) return Response.json(current);
    return new Response("", { status: 200 });
  };
  const repo = new SharePointRepository(
    {
      siteUrl: "https://tenant.sharepoint.com/sites/p",
      libraryPath: "/sites/p/Documents",
      dataFolder: "Purchasing/data",
      documentFolder: "Purchasing/documents",
      writerEnabled: true,
    },
    transport,
  );
  await expect(
    repo.save({ data: original, token: JSON.stringify(original) }, original),
  ).rejects.toBeInstanceOf(ConflictError);
  expect(calls.some((x) => x.includes("UndoCheckOut"))).toBe(true);
  expect(calls.some((x) => x.startsWith("POST") && x.endsWith("/$value"))).toBe(
    false,
  );
});
it("rejects unsafe PDF content, filename and size", async () => {
  await expect(
    validatePdf(new File(["not pdf"], "test.pdf", { type: "application/pdf" })),
  ).rejects.toThrow();
  await expect(
    validatePdf(
      new File(["%PDF-1.7"], "../test.pdf", { type: "application/pdf" }),
    ),
  ).rejects.toThrow();
  await expect(
    validatePdf(
      new File(["%PDF-1.7\nhello"], "test.pdf", { type: "application/pdf" }),
    ),
  ).resolves.toBeUndefined();
});
