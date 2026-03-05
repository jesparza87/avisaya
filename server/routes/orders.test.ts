import { parseDayBoundsInTimezone } from "./orders";

// ---------------------------------------------------------------------------
// parseDayBoundsInTimezone — unit tests
// No database or HTTP server required.
// ---------------------------------------------------------------------------

describe("parseDayBoundsInTimezone", () => {
  // ── Valid inputs — UTC ────────────────────────────────────────────────────

  test("returns non-null for a valid date in UTC", () => {
    const result = parseDayBoundsInTimezone("2024-06-15", "UTC");
    expect(result).not.toBeNull();
  });

  test("start is midnight UTC when timezone is UTC", () => {
    const result = parseDayBoundsInTimezone("2024-06-15", "UTC")!;
    expect(result.start.toISOString()).toBe("2024-06-15T00:00:00.000Z");
  });

  test("end is 23:59:59.999 UTC when timezone is UTC", () => {
    const result = parseDayBoundsInTimezone("2024-06-15", "UTC")!;
    expect(result.end.toISOString()).toBe("2024-06-15T23:59:59.999Z");
  });

  // ── Valid inputs — Europe/Madrid (UTC+2 CEST in summer) ──────────────────

  test("start is offset correctly for Europe/Madrid in summer (UTC+2)", () => {
    // Midnight local (00:00 Madrid CEST) = 22:00 previous day UTC
    const result = parseDayBoundsInTimezone("2024-06-15", "Europe/Madrid")!;
    expect(result).not.toBeNull();
    expect(result.start.toISOString()).toBe("2024-06-14T22:00:00.000Z");
  });

  test("end is offset correctly for Europe/Madrid in summer (UTC+2)", () => {
    const result = parseDayBoundsInTimezone("2024-06-15", "Europe/Madrid")!;
    expect(result.end.toISOString()).toBe("2024-06-15T21:59:59.999Z");
  });

  // ── Valid inputs — America/New_York (UTC-5 EST in winter) ────────────────

  test("start is offset correctly for America/New_York in winter (UTC-5)", () => {
    // Midnight local (00:00 EST) = 05:00 UTC same day
    const result = parseDayBoundsInTimezone("2024-01-15", "America/New_York")!;
    expect(result).not.toBeNull();
    expect(result.start.toISOString()).toBe("2024-01-15T05:00:00.000Z");
  });

  test("end is offset correctly for America/New_York in winter (UTC-5)", () => {
    const result = parseDayBoundsInTimezone("2024-01-15", "America/New_York")!;
    expect(result.end.toISOString()).toBe("2024-01-16T04:59:59.999Z");
  });

  // ── Valid inputs — America/New_York (UTC-4 EDT in summer) ────────────────

  test("start is offset correctly for America/New_York in summer (UTC-4)", () => {
    // Midnight local (00:00 EDT) = 04:00 UTC same day
    const result = parseDayBoundsInTimezone("2024-06-15", "America/New_York")!;
    expect(result).not.toBeNull();
    expect(result.start.toISOString()).toBe("2024-06-15T04:00:00.000Z");
  });

  // ── Valid inputs — Asia/Tokyo (UTC+9) ────────────────────────────────────

  test("start is offset correctly for Asia/Tokyo (UTC+9)", () => {
    // Midnight local (00:00 JST) = 15:00 previous day UTC
    const result = parseDayBoundsInTimezone("2024-06-15", "Asia/Tokyo")!;
    expect(result).not.toBeNull();
    expect(result.start.toISOString()).toBe("2024-06-14T15:00:00.000Z");
  });

  test("end is offset correctly for Asia/Tokyo (UTC+9)", () => {
    const result = parseDayBoundsInTimezone("2024-06-15", "Asia/Tokyo")!;
    expect(result.end.toISOString()).toBe("2024-06-15T14:59:59.999Z");
  });

  // ── Invalid date strings — must return null ───────────────────────────────

  test("returns null for invalid month 13 (passes regex but invalid calendar)", () => {
    const result = parseDayBoundsInTimezone("2024-13-01", "UTC");
    expect(result).toBeNull();
  });

  test("returns null for invalid day 45 (passes regex but invalid calendar)", () => {
    const result = parseDayBoundsInTimezone("2024-01-45", "UTC");
    expect(result).toBeNull();
  });

  test("returns null for month 00", () => {
    const result = parseDayBoundsInTimezone("2024-00-15", "UTC");
    expect(result).toBeNull();
  });

  test("returns null for day 00", () => {
    const result = parseDayBoundsInTimezone("2024-06-00", "UTC");
    expect(result).toBeNull();
  });

  test("returns null for wrong format — no dashes", () => {
    const result = parseDayBoundsInTimezone("20240615", "UTC");
    expect(result).toBeNull();
  });

  test("returns null for empty string", () => {
    const result = parseDayBoundsInTimezone("", "UTC");
    expect(result).toBeNull();
  });

  test("returns null for partial date (YYYY-MM only)", () => {
    const result = parseDayBoundsInTimezone("2024-06", "UTC");
    expect(result).toBeNull();
  });

  test("returns null for non-numeric date string", () => {
    const result = parseDayBoundsInTimezone("abcd-ef-gh", "UTC");
    expect(result).toBeNull();
  });

  test("returns null for date with extra characters", () => {
    const result = parseDayBoundsInTimezone("2024-06-15T00:00:00", "UTC");
    expect(result).toBeNull();
  });

  // ── Invariants ────────────────────────────────────────────────────────────

  test("start is always strictly before end for multiple timezones", () => {
    const timezones = [
      "UTC",
      "Europe/Madrid",
      "America/New_York",
      "Asia/Tokyo",
      "Pacific/Auckland",
      "America/Los_Angeles",
    ];
    for (const tz of timezones) {
      const result = parseDayBoundsInTimezone("2024-06-15", tz)!;
      expect(result).not.toBeNull();
      expect(result.start.getTime()).toBeLessThan(result.end.getTime());
    }
  });

  test("start and end span exactly 86399999 ms (23h 59m 59.999s) in UTC", () => {
    const result = parseDayBoundsInTimezone("2024-06-15", "UTC")!;
    const diffMs = result.end.getTime() - result.start.getTime();
    expect(diffMs).toBe(86_399_999);
  });

  test("start and end span exactly 86399999 ms in a non-UTC timezone", () => {
    const result = parseDayBoundsInTimezone("2024-06-15", "America/New_York")!;
    const diffMs = result.end.getTime() - result.start.getTime();
    expect(diffMs).toBe(86_399_999);
  });

  test("returns a valid Date object (not NaN) for start and end", () => {
    const result = parseDayBoundsInTimezone("2024-06-15", "UTC")!;
    expect(isNaN(result.start.getTime())).toBe(false);
    expect(isNaN(result.end.getTime())).toBe(false);
  });
});
