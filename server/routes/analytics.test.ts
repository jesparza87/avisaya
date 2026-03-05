import { getUtcOffsetMs, getLocalDateString, startOfDayInTz, endOfDayInTz } from "./analytics";

describe("getUtcOffsetMs", () => {
  it("returns 0 for UTC", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    expect(getUtcOffsetMs(date, "UTC")).toBe(0);
  });

  it("returns correct offset for America/New_York in summer (EDT = UTC-4)", () => {
    // June 15 is in EDT (UTC-4), so offset should be -4 * 3600 * 1000
    const date = new Date("2024-06-15T12:00:00Z");
    const offsetMs = getUtcOffsetMs(date, "America/New_York");
    expect(offsetMs).toBe(-4 * 60 * 60 * 1000);
  });

  it("returns correct offset for America/New_York in winter (EST = UTC-5)", () => {
    // January 15 is in EST (UTC-5), so offset should be -5 * 3600 * 1000
    const date = new Date("2024-01-15T12:00:00Z");
    const offsetMs = getUtcOffsetMs(date, "America/New_York");
    expect(offsetMs).toBe(-5 * 60 * 60 * 1000);
  });

  it("returns correct offset for Europe/Madrid in summer (CEST = UTC+2)", () => {
    const date = new Date("2024-07-01T12:00:00Z");
    const offsetMs = getUtcOffsetMs(date, "Europe/Madrid");
    expect(offsetMs).toBe(2 * 60 * 60 * 1000);
  });

  it("returns correct offset for Europe/Madrid in winter (CET = UTC+1)", () => {
    const date = new Date("2024-01-01T12:00:00Z");
    const offsetMs = getUtcOffsetMs(date, "Europe/Madrid");
    expect(offsetMs).toBe(1 * 60 * 60 * 1000);
  });

  it("returns correct offset for Asia/Kolkata (IST = UTC+5:30)", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const offsetMs = getUtcOffsetMs(date, "Asia/Kolkata");
    expect(offsetMs).toBe((5 * 60 + 30) * 60 * 1000);
  });
});

describe("getLocalDateString", () => {
  it("returns YYYY-MM-DD in UTC", () => {
    const date = new Date("2024-06-15T23:00:00Z");
    expect(getLocalDateString(date, "UTC")).toBe("2024-06-15");
  });

  it("returns next day for UTC+2 when UTC time is 23:00", () => {
    // 2024-06-15T23:00:00Z is 2024-06-16T01:00:00 in Europe/Madrid (CEST = UTC+2)
    const date = new Date("2024-06-15T23:00:00Z");
    expect(getLocalDateString(date, "Europe/Madrid")).toBe("2024-06-16");
  });

  it("returns previous day for UTC-5 when UTC time is 02:00", () => {
    // 2024-06-15T02:00:00Z is 2024-06-14T21:00:00 in America/New_York (EDT = UTC-4)
    // Wait — EDT is UTC-4, so 02:00 UTC = 22:00 previous day? No: 02:00 - 4h = -2h = 22:00 previous day
    const date = new Date("2024-06-15T02:00:00Z");
    expect(getLocalDateString(date, "America/New_York")).toBe("2024-06-14");
  });
});

describe("startOfDayInTz", () => {
  it("returns midnight UTC for UTC timezone", () => {
    const date = new Date("2024-06-15T14:30:00Z");
    const start = startOfDayInTz(date, "UTC");
    expect(start.toISOString()).toBe("2024-06-15T00:00:00.000Z");
  });

  it("returns correct UTC time for start of day in UTC+2", () => {
    // Start of 2024-06-15 in Europe/Madrid (CEST = UTC+2) is 2024-06-14T22:00:00Z
    const date = new Date("2024-06-15T14:30:00Z");
    const start = startOfDayInTz(date, "Europe/Madrid");
    expect(start.toISOString()).toBe("2024-06-14T22:00:00.000Z");
  });

  it("returns correct UTC time for start of day in UTC-5", () => {
    // Start of 2024-01-15 in America/New_York (EST = UTC-5) is 2024-01-15T05:00:00Z
    const date = new Date("2024-01-15T14:30:00Z");
    const start = startOfDayInTz(date, "America/New_York");
    expect(start.toISOString()).toBe("2024-01-15T05:00:00.000Z");
  });
});

describe("endOfDayInTz", () => {
  it("returns 23:59:59.999 UTC for UTC timezone", () => {
    const date = new Date("2024-06-15T14:30:00Z");
    const end = endOfDayInTz(date, "UTC");
    expect(end.toISOString()).toBe("2024-06-15T23:59:59.999Z");
  });

  it("returns correct UTC time for end of day in UTC+2", () => {
    // End of 2024-06-15 in Europe/Madrid (CEST = UTC+2) is 2024-06-15T21:59:59.999Z
    const date = new Date("2024-06-15T14:30:00Z");
    const end = endOfDayInTz(date, "Europe/Madrid");
    expect(end.toISOString()).toBe("2024-06-15T21:59:59.999Z");
  });
});
