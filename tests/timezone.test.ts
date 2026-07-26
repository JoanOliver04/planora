import { describe, expect, it } from "vitest";
import { localDate, localWeek } from "@/lib/dates/timezone";
describe("timezone dates", () => {
  it("uses Madrid local day across UTC midnight", () => {
    expect(localDate("Europe/Madrid", new Date("2026-07-26T22:30:00Z"))).toBe(
      "2026-07-27",
    );
  });
  it("uses Monday week boundaries", () => {
    const w = localWeek("Europe/Madrid", new Date("2026-07-29T12:00:00Z"));
    expect(w.start).toBe("2026-07-27");
    expect(w.end).toBe("2026-08-02");
    expect(w.days).toHaveLength(7);
  });
  it("handles winter offset", () =>
    expect(localDate("Europe/Madrid", new Date("2026-01-01T23:30:00Z"))).toBe(
      "2026-01-02",
    ));
});
