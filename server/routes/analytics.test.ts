import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// ---------------------------------------------------------------------------
// Mock the DB module before importing the router so the router picks up mocks.
// ---------------------------------------------------------------------------
jest.mock("../db", () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock("../middleware/auth", () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", email: "test@test.com", venue_id: "venue-1", role: "owner" };
    next();
  },
}));

import { db } from "../db";
import analyticsRouter, {
  getUtcOffsetMs,
  startOfDayInTz,
  endOfDayInTz,
} from "./analytics";

// ---------------------------------------------------------------------------
// Helper: build a chainable mock that resolves with `rows`.
// ---------------------------------------------------------------------------
function buildDbMock(rows: object[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockResolvedValue(rows),
  };
  (db.select as jest.Mock).mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// App fixture
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use("/api/analytics", analyticsRouter);

// ===========================================================================
// Unit tests — timezone utility functions
// ===========================================================================

describe("getUtcOffsetMs", () => {
  it("returns 0 for UTC", () => {
    const utcMs = Date.UTC(2024, 5, 15, 12, 0, 0); // 2024-06-15 12:00 UTC
    expect(getUtcOffsetMs(utcMs, "UTC")).toBe(0);
  });

  it("returns +3600000 for Europe/Madrid in summer (CEST = UTC+2)", () => {
    // 2024-06-15 is summer time in Spain → UTC+2 = +7200000 ms
    const utcMs = Date.UTC(2024, 5, 15, 12, 0, 0);
    const offset = getUtcOffsetMs(utcMs, "Europe/Madrid");
    expect(offset).toBe(7_200_000);
  });

  it("returns +3600000 for Europe/Madrid in winter (CET = UTC+1)", () => {
    // 2024-01-15 is winter time in Spain → UTC+1 = +3600000 ms
    const utcMs = Date.UTC(2024, 0, 15, 12, 0, 0);
    const offset = getUtcOffsetMs(utcMs, "Europe/Madrid");
    expect(offset).toBe(3_600_000);
  });

  it("returns negative offset for America/New_York in winter (EST = UTC-5)", () => {
    const utcMs = Date.UTC(2024, 0, 15, 12, 0, 0);
    const offset = getUtcOffsetMs(utcMs, "America/New_York");
    expect(offset).toBe(-5 * 3_600_000);
  });

  it("returns negative offset for America/New_York in summer (EDT = UTC-4)", () => {
    const utcMs = Date.UTC(2024, 5, 15, 12, 0, 0);
    const offset = getUtcOffsetMs(utcMs, "America/New_York");
    expect(offset).toBe(-4 * 3_600_000);
  });
});

describe("startOfDayInTz", () => {
  it("returns midnight UTC for UTC timezone", () => {
    const utcMs = Date.UTC(2024, 5, 15, 14, 30, 0); // 2024-06-15 14:30 UTC
    const result = startOfDayInTz(utcMs, "UTC");
    expect(result).toBe(Date.UTC(2024, 5, 15, 0, 0, 0));
  });

  it("returns correct UTC instant for midnight in Europe/Madrid (summer)", () => {
    // Summer: UTC+2, so local midnight = UTC 22:00 of the previous day
    const utcMs = Date.UTC(2024, 5, 15, 14, 30, 0); // 2024-06-15 14:30 UTC
    const result = startOfDayInTz(utcMs, "Europe/Madrid");
    // Local midnight 2024-06-15 00:00 CEST = 2024-06-14 22:00 UTC
    expect(result).toBe(Date.UTC(2024, 5, 14, 22, 0, 0));
  });

  it("returns correct UTC instant for midnight in America/New_York (winter)", () => {
    // Winter: UTC-5, so local midnight = UTC 05:00 same day
    const utcMs = Date.UTC(2024, 0, 15, 14, 30, 0); // 2024-01-15 14:30 UTC
    const result = startOfDayInTz(utcMs, "America/New_York");
    // Local midnight 2024-01-15 00:00 EST = 2024-01-15 05:00 UTC
    expect(result).toBe(Date.UTC(2024, 0, 15, 5, 0, 0));
  });
});

describe("endOfDayInTz", () => {
  it("returns one ms before next midnight UTC for UTC timezone", () => {
    const utcMs = Date.UTC(2024, 5, 15, 14, 30, 0);
    const result = endOfDayInTz(utcMs, "UTC");
    expect(result).toBe(Date.UTC(2024, 5, 15, 0, 0, 0) + 86_400_000 - 1);
  });

  it("is exactly 86399999 ms after startOfDayInTz", () => {
    const utcMs = Date.UTC(2024, 5, 15, 14, 30, 0);
    const start = startOfDayInTz(utcMs, "Europe/Madrid");
    const end = endOfDayInTz(utcMs, "Europe/Madrid");
    expect(end - start).toBe(86_400_000 - 1);
  });
});

// ===========================================================================
// Integration tests — GET /api/analytics/summary
// ===========================================================================

describe("GET /api/analytics/summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with aggregated counts", async () => {
    buildDbMock([
      { status: "pending", count: "3" },
      { status: "done", count: "7" },
    ]);

    const res = await request(app)
      .get("/api/analytics/summary")
      .query({ tz: "UTC", date: "2024-06-15" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      date: "2024-06-15",
      tz: "UTC",
      totalOrders: 10,
      pendingOrders: 3,
      doneOrders: 7,
    });
  });

  it("returns 200 with zeros when no orders exist", async () => {
    buildDbMock([]);

    const res = await request(app)
      .get("/api/analytics/summary")
      .query({ tz: "UTC", date: "2024-06-15" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalOrders: 0,
      pendingOrders: 0,
      doneOrders: 0,
    });
  });

  it("defaults tz to UTC when not provided", async () => {
    buildDbMock([]);

    const res = await request(app)
      .get("/api/analytics/summary")
      .query({ date: "2024-06-15" });

    expect(res.status).toBe(200);
    expect(res.body.tz).toBe("UTC");
  });

  it("returns 400 for an invalid timezone", async () => {
    const res = await request(app)
      .get("/api/analytics/summary")
      .query({ tz: "Not/AReal_Timezone", date: "2024-06-15" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid timezone/);
  });

  it("returns 400 for an invalid date", async () => {
    const res = await request(app)
      .get("/api/analytics/summary")
      .query({ tz: "UTC", date: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid date/);
  });

  it("returns 500 when the DB throws", async () => {
    const chain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockRejectedValue(new Error("DB connection lost")),
    };
    (db.select as jest.Mock).mockReturnValue(chain);

    const res = await request(app)
      .get("/api/analytics/summary")
      .query({ tz: "UTC", date: "2024-06-15" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
  });

  it("counts only pending and done statuses correctly when other statuses exist", async () => {
    buildDbMock([
      { status: "pending", count: "2" },
      { status: "done", count: "5" },
      { status: "cancelled", count: "1" },
    ]);

    const res = await request(app)
      .get("/api/analytics/summary")
      .query({ tz: "UTC", date: "2024-06-15" });

    expect(res.status).toBe(200);
    expect(res.body.totalOrders).toBe(8);
    expect(res.body.pendingOrders).toBe(2);
    expect(res.body.doneOrders).toBe(5);
  });
});
