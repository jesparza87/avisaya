import request from "supertest";
import express from "express";
import analyticsRouter from "../analytics";

// Use the mock db
jest.mock("../../db");

const { db } = require("../../db");

// Helper to build a minimal AuthRequest-like middleware
function fakeAuth(venueId: string | null = "venue-123") {
  return (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", email: "test@test.com", venue_id: venueId, role: "admin" };
    next();
  };
}

// Mock the authenticate middleware
jest.mock("../../middleware/auth", () => ({
  authenticate: (req: any, _res: any, next: any) => {
    // Will be overridden per test via app setup
    next();
  },
}));

function buildApp(venueId: string | null = "venue-123") {
  const app = express();
  app.use(express.json());
  // Inject user directly, bypassing JWT
  app.use((req: any, _res, next) => {
    req.user = { id: "user-1", email: "test@test.com", venue_id: venueId, role: "admin" };
    next();
  });
  app.use("/api/analytics", analyticsRouter);
  return app;
}

// ─── /history ────────────────────────────────────────────────────────────────

describe("GET /api/analytics/history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when user has no venue", async () => {
    const app = buildApp(null);
    const res = await request(app).get("/api/analytics/history");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "No venue associated with user" });
  });

  it("returns 400 for an invalid timezone", async () => {
    const app = buildApp();
    const res = await request(app).get(
      "/api/analytics/history?tz=Not/AReal_Zone"
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid timezone" });
  });

  it("returns history array with correct length (default 7 days)", async () => {
    // db mock: each select call returns [{ count: 3 }]
    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue([{ count: 3 }]);

    const app = buildApp();
    const res = await request(app).get("/api/analytics/history");

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(7);
    res.body.history.forEach((entry: any) => {
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("count", 3);
      // date should be in YYYY-MM-DD format
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("respects the days query param", async () => {
    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue([{ count: 0 }]);

    const app = buildApp();
    const res = await request(app).get("/api/analytics/history?days=14");

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(14);
  });

  it("caps days at 90", async () => {
    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue([{ count: 1 }]);

    const app = buildApp();
    const res = await request(app).get("/api/analytics/history?days=200");

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(90);
  });

  it("defaults to 7 days for invalid days param", async () => {
    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue([{ count: 0 }]);

    const app = buildApp();
    const res = await request(app).get("/api/analytics/history?days=abc");

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(7);
  });

  it("accepts a valid IANA timezone", async () => {
    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue([{ count: 5 }]);

    const app = buildApp();
    const res = await request(app).get(
      "/api/analytics/history?tz=America/New_York"
    );

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(7);
  });

  it("returns 500 on db error", async () => {
    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockRejectedValue(new Error("DB failure"));

    const app = buildApp();
    const res = await request(app).get("/api/analytics/history");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
  });
});

// ─── /stats ──────────────────────────────────────────────────────────────────

describe("GET /api/analytics/stats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when user has no venue", async () => {
    const app = buildApp(null);
    const res = await request(app).get("/api/analytics/stats");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "No venue associated with user" });
  });

  it("returns 400 for an invalid timezone", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/analytics/stats?tz=Fake/Zone");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid timezone" });
  });

  it("returns correct stats when there are no orders today", async () => {
    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue([]);

    const app = buildApp();
    const res = await request(app).get("/api/analytics/stats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total_today: 0,
      collected_today: 0,
      pending_today: 0,
      notified_today: 0,
      avg_wait_seconds: null,
    });
  });

  it("counts orders by status correctly", async () => {
    const now = new Date().toISOString();
    const mockOrders = [
      { status: "pending", created_at: now, notified_at: null },
      { status: "pending", created_at: now, notified_at: null },
      { status: "notified", created_at: now, notified_at: now },
      { status: "collected", created_at: now, notified_at: now },
      { status: "collected", created_at: now, notified_at: now },
      { status: "collected", created_at: now, notified_at: now },
    ];

    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue(mockOrders);

    const app = buildApp();
    const res = await request(app).get("/api/analytics/stats");

    expect(res.status).toBe(200);
    expect(res.body.total_today).toBe(6);
    expect(res.body.collected_today).toBe(3);
    expect(res.body.pending_today).toBe(2);
    expect(res.body.notified_today).toBe(1);
  });

  it("calculates avg_wait_seconds correctly", async () => {
    const createdAt = new Date("2026-01-01T10:00:00.000Z").toISOString();
    const notifiedAt = new Date("2026-01-01T10:05:00.000Z").toISOString(); // 300s later

    const mockOrders = [
      { status: "notified", created_at: createdAt, notified_at: notifiedAt },
    ];

    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue(mockOrders);

    const app = buildApp();
    const res = await request(app).get("/api/analytics/stats");

    expect(res.status).toBe(200);
    expect(res.body.avg_wait_seconds).toBe(300);
  });

  it("calculates avg_wait_seconds as average across multiple orders", async () => {
    const base = new Date("2026-01-01T10:00:00.000Z");
    const mockOrders = [
      {
        status: "notified",
        created_at: base.toISOString(),
        notified_at: new Date(base.getTime() + 60_000).toISOString(), // 60s
      },
      {
        status: "collected",
        created_at: base.toISOString(),
        notified_at: new Date(base.getTime() + 180_000).toISOString(), // 180s
      },
    ];

    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue(mockOrders);

    const app = buildApp();
    const res = await request(app).get("/api/analytics/stats");

    expect(res.status).toBe(200);
    // avg of 60 and 180 = 120
    expect(res.body.avg_wait_seconds).toBe(120);
  });

  it("returns avg_wait_seconds as null when no orders have notified_at", async () => {
    const now = new Date().toISOString();
    const mockOrders = [
      { status: "pending", created_at: now, notified_at: null },
      { status: "pending", created_at: now, notified_at: null },
    ];

    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue(mockOrders);

    const app = buildApp();
    const res = await request(app).get("/api/analytics/stats");

    expect(res.status).toBe(200);
    expect(res.body.avg_wait_seconds).toBeNull();
  });

  it("accepts a valid IANA timezone", async () => {
    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockResolvedValue([]);

    const app = buildApp();
    const res = await request(app).get(
      "/api/analytics/stats?tz=Europe/Madrid"
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total_today");
  });

  it("returns 500 on db error", async () => {
    db.select.mockReturnValue(db);
    db.from.mockReturnValue(db);
    db.where.mockRejectedValue(new Error("DB failure"));

    const app = buildApp();
    const res = await request(app).get("/api/analytics/stats");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
  });
});
