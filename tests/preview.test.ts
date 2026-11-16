// @vitest-environment jsdom
import { it, expect } from "vitest";
import { PreviewRepository } from "../src/repositories/PreviewRepository";
import { emptyData, makeItem } from "../src/models/schema";
it("serializes initialization and saves under the same browser lock without nested acquisition", async () => {
  localStorage.clear();
  let active = false;
  const keys: string[] = [];
  const old = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (key: string, callback: () => Promise<unknown>) => {
        expect(active).toBe(false);
        active = true;
        keys.push(key);
        try {
          return await callback();
        } finally {
          active = false;
        }
      },
    },
  });
  try {
    const repo = new PreviewRepository();
    const base = await repo.load();
    await repo.save(base, base.data);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
  } finally {
    if (old) Object.defineProperty(navigator, "locks", old);
    else Reflect.deleteProperty(navigator, "locks");
  }
});
it("starts with the user-confirmed 50/10/20/20 items and no invented dates or pairings", async () => {
  localStorage.clear();
  const { data } = await new PreviewRepository().load();
  expect(data.items).toHaveLength(100);
  expect(
    ["LOAD", "BOTTOM", "AL_COVER", "UNLOAD"].map(
      (t) => data.items.filter((i) => i.itemType === t).length,
    ),
  ).toEqual([50, 10, 20, 20]);
  expect(
    data.items.every(
      (i) =>
        Object.values(i.baseline).every((v) => v === null) &&
        Object.values(i.actual).every((v) => v === null),
    ),
  ).toBe(true);
  expect(data.pairings).toEqual([]);
});
it("adds missing IDs without replacing saved dates, follow-ups, or documents", async () => {
  localStorage.clear();
  const d = emptyData(),
    i = makeItem("L-001", "LOAD");
  i.baseline.castingDate = "2026-11-01";
  i.baseline.deliveryDate = "2026-12-15";
  i.purchasingRemark = "Keep user work";
  d.items.push(i);
  localStorage.setItem(
    "realsoluplus-mill-bearing-preview-v1",
    JSON.stringify(d),
  );
  const { data } = await new PreviewRepository().load();
  expect(data.items).toHaveLength(100);
  expect(data.items.find((x) => x.id === i.id)).toEqual(i);
  expect(
    localStorage.getItem("realsoluplus-mill-bearing-before-initial-counts"),
  ).toBe(JSON.stringify(d));
});
it("initializes preview exactly once and persists an edit across fresh repository instances", async () => {
  localStorage.clear();
  const repo = new PreviewRepository();
  const base = await repo.load();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect((await repo.load()).token).toBe(base.token);
  const next = structuredClone(base.data);
  next.items[0].purchasingRemark = "Preview test only";
  await repo.save(base, next);
  expect(
    (await new PreviewRepository().load()).data.items[0].purchasingRemark,
  ).toBe("Preview test only");
});
