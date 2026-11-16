import { it, expect } from "vitest";
import { parseDisplayDate, displayDate } from "../src/components/DateInput";
import { thaiDate } from "../src/domain/rules";
it("uses dd/mm/yyyy with Gregorian years and rejects impossible dates", () => {
  expect(displayDate("2026-12-01")).toBe("01/12/2026");
  expect(thaiDate("2026-12-01")).toBe("01/12/2026");
  expect(parseDisplayDate("29/02/2028")).toBe("2028-02-29");
  expect(parseDisplayDate("29/02/2027")).toBeNull();
  expect(parseDisplayDate("31/04/2026")).toBeNull();
  expect(parseDisplayDate("2026-12-01")).toBeNull();
});
