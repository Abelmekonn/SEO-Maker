import { DAY_MS, WEEK_MS, quotaFrom, rollingWindow } from "@seo-maker/db";
import { describe, expect, it } from "vitest";

/**
 * Free's AI allowance: 2 generations per rolling 24 hours, 10 per 7 days.
 * The window math is pure; the ledger that feeds it is covered by
 * usage.db.test.ts against a real database.
 */

const now = new Date("2026-09-25T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const HOUR = 60 * 60 * 1000;
const FREE = { daily: 2, weekly: 10 };

describe("rollingWindow", () => {
  it("counts only records inside the window", () => {
    const window = rollingWindow([ago(DAY_MS + HOUR), ago(2 * HOUR)], DAY_MS, 2, now);
    expect(window.used).toBe(1);
    expect(window.remaining).toBe(1);
    expect(window.resetsAt).toBeNull();
  });

  it("frees the next unit when the oldest counted record ages out", () => {
    const window = rollingWindow([ago(10 * HOUR), ago(2 * HOUR)], DAY_MS, 2, now);
    expect(window.remaining).toBe(0);
    expect(window.resetsAt?.toISOString()).toBe(new Date(ago(10 * HOUR).getTime() + DAY_MS).toISOString());
  });

  it("waits for enough records to age out when usage is above the limit", () => {
    // Three used against a limit of two, after a downgrade: the second-oldest
    // has to age out before one is free again.
    const window = rollingWindow([ago(20 * HOUR), ago(10 * HOUR), ago(1 * HOUR)], DAY_MS, 2, now);
    expect(window.remaining).toBe(0);
    expect(window.resetsAt?.getTime()).toBe(ago(10 * HOUR).getTime() + DAY_MS);
  });

  it("reports no limit and no reset for an uncapped plan", () => {
    const window = rollingWindow([ago(HOUR)], DAY_MS, null, now);
    expect(window).toEqual({ used: 1, limit: null, remaining: null, resetsAt: null });
  });
});

describe("quotaFrom", () => {
  it("allows a fresh Free user two today and ten this week", () => {
    const quota = quotaFrom([], FREE, now);
    expect(quota.daily.remaining).toBe(2);
    expect(quota.weekly.remaining).toBe(10);
    expect(quota.exhausted).toBeNull();
  });

  it("stops a Free user after two in a day", () => {
    const quota = quotaFrom([ago(3 * HOUR), ago(HOUR)], FREE, now);
    expect(quota.exhausted).toBe("daily");
  });

  it("stops a Free user after ten in a week even with today unused", () => {
    const times = Array.from({ length: 10 }, (_, index) => ago(DAY_MS + HOUR + index * (DAY_MS / 2)));
    const quota = quotaFrom(times, FREE, now);
    expect(quota.daily.used).toBe(0);
    expect(quota.weekly.used).toBe(10);
    expect(quota.exhausted).toBe("weekly");
  });

  it("drops records older than a week", () => {
    const quota = quotaFrom([ago(WEEK_MS + HOUR)], FREE, now);
    expect(quota.weekly.used).toBe(0);
  });
});
