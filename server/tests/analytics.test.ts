import request from "supertest";
import app from "../index";
import { db } from "../lib/db";
import { orders } from "../../shared/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET || "secret";
const VENUE_ID = "venue-analytics-test";
const USER_ID = "user-analytics-test";

/**
 * Create a signed JWT and return it as a cookie string that supertest can
 * attach via .set("Cookie", ...).  The middleware reads req.cookies?.token
 * (set by cookie-parser from the "Cookie" header).
 */
function makeAuthCookie(venueId: string | null = VENUE_ID): string {
  const token = jwt.sign(
    { id: USER_ID, email: "test@example.com", venue_id: venueId, role: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
  return `token=${token}`;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

type OrderInsert = typeof orders.$inferInsert;

async function seedOrder(overrides: Partial<OrderInsert> = {}): Promise<OrderInsert> {
  const base: OrderInsert = {
    id: `order-${Math.random().toString(36).slice(2)}`,
    venue_id: VENUE_ID,
    token: Math.random().toString(36).slice(2),
    label: "Test order",
    status: "collected",
    created_at: new Date(),
    notified_at: null,
  };
  const row = { ...base, ...overrides };
  await db.insert(orders).values(row);
  return row;
}

async function cleanOrders(): Promise<void> {
  await db.delete(orders).where(eq(orders.venue_id, VENUE_ID));
}

// ---------------------------------------------------------------------------
// Tests — GET /api/analytics/history
// ---------------------------------------------------------------------------

describe("GET /api/analytics/history", () => {
  beforeEach(async () => {
    await cleanOrders();
  });

  afterAll(async () => {
    await cleanOrders();
  });

  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get("/api/analytics/history");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no venue_id", async () => {
    const res = await request(app)
      .get("/api/analytics/history")
      .set("Cookie", makeAuthCookie(null));
    expect(res.status).toBe(403);
  });

  it("returns an empty array when there are no orders for the day", async () => {
    const res = await request(app)
      .get("/api/analytics/history?date=2000-01-01&tzOffset=0")
      .set("Cookie", makeAuthCookie());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns orders created on the requested date (UTC)", async () => {
    await seedOrder({
      created_at: new Date("2024-06-15T10:00:00.000Z"),
      status: "collected",
    });

    const res = await request(app)
      .get("/api/analytics/history?date=2024-06-15&tzOffset=0")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].status).toBe("collected");
  });

  it("returns orders of all statuses (waiting, ready, collected) for the day", async () => {
    const base = new Date("2024-07-01T08:00:00.000Z");
    await seedOrder({ created_at: base, status: "waiting" });
    await seedOrder({ created_at: new Date(base.getTime() + 1000), status: "ready" });
    await seedOrder({ created_at: new Date(base.getTime() + 2000), status: "collected" });

    const res = await request(app)
      .get("/api/analytics/history?date=2024-07-01&tzOffset=0")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
    const statuses: string[] = res.body.map((o: OrderInsert) => o.status).sort();
    expect(statuses).toEqual(["collected", "ready", "waiting"]);
  });

  it("does NOT return orders from a different day", async () => {
    // One millisecond before the day starts
    await seedOrder({
      created_at: new Date("2024-06-14T23:59:59.999Z"),
      status: "collected",
    });
    // One millisecond after the next-midnight upper bound
    await seedOrder({
      created_at: new Date("2024-06-16T00:00:00.001Z"),
      status: "collected",
    });

    const res = await request(app)
      .get("/api/analytics/history?date=2024-06-15&tzOffset=0")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it("includes an order created exactly at midnight (00:00:00.000Z) of the requested day", async () => {
    await seedOrder({
      created_at: new Date("2024-06-15T00:00:00.000Z"),
      status: "collected",
    });

    const res = await request(app)
      .get("/api/analytics/history?date=2024-06-15&tzOffset=0")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it("respects tzOffset — shifts day boundary for non-UTC clients (UTC+2)", async () => {
    // UTC+2 client sends tzOffset=-120.
    // Local "2024-06-15 00:00" = UTC 2024-06-14T22:00:00Z
    // Local "2024-06-15 23:59" = UTC 2024-06-15T21:59:59Z
    // UTC window: [2024-06-14T22:00Z, 2024-06-15T22:00Z]

    // Inside the local day (UTC 22:30 on the 14th = local 00:30 on the 15th)
    await seedOrder({
      created_at: new Date("2024-06-14T22:30:00.000Z"),
      status: "collected",
    });
    // Outside the local day (UTC 21:59 on the 14th = local 23:59 on the 14th)
    await seedOrder({
      created_at: new Date("2024-06-14T21:59:59.999Z"),
      status: "collected",
    });

    const res = await request(app)
      .get("/api/analytics/history?date=2024-06-15&tzOffset=-120")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(new Date(res.body[0].created_at).toISOString()).toBe(
      "2024-06-14T22:30:00.000Z"
    );
  });

  it("does not return orders from a different venue", async () => {
    const otherId = "order-other-venue-hist";
    await db.insert(orders).values({
      id: otherId,
      venue_id: "other-venue-id",
      token: "other-token-hist",
      label: "Other venue order",
      status: "collected",
      created_at: new Date("2024-06-15T10:00:00.000Z"),
      notified_at: null,
    });

    const res = await request(app)
      .get("/api/analytics/history?date=2024-06-15&tzOffset=0")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body.every((o: OrderInsert) => o.venue_id === VENUE_ID)).toBe(true);

    await db.delete(orders).where(eq(orders.id, otherId));
  });
});

// ---------------------------------------------------------------------------
// Tests — GET /api/analytics/stats
// ---------------------------------------------------------------------------

describe("GET /api/analytics/stats", () => {
  beforeEach(async () => {
    await cleanOrders();
  });

  afterAll(async () => {
    await cleanOrders();
  });

  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get("/api/analytics/stats");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no venue_id", async () => {
    const res = await request(app)
      .get("/api/analytics/stats")
      .set("Cookie", makeAuthCookie(null));
    expect(res.status).toBe(403);
  });

  it("returns zero counts when there are no orders for the day", async () => {
    const res = await request(app)
      .get("/api/analytics/stats?date=2000-01-01&tzOffset=0")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      date: "2000-01-01",
      total: 0,
      collected: 0,
      waiting: 0,
      ready: 0,
    });
  });

  it("counts orders by status correctly", async () => {
    const base = new Date("2024-08-20T09:00:00.000Z");
    await seedOrder({ created_at: base, status: "waiting" });
    await seedOrder({ created_at: new Date(base.getTime() + 1000), status: "waiting" });
    await seedOrder({ created_at: new Date(base.getTime() + 2000), status: "ready" });
    await seedOrder({ created_at: new Date(base.getTime() + 3000), status: "collected" });
    await seedOrder({ created_at: new Date(base.getTime() + 4000), status: "collected" });
    await seedOrder({ created_at: new Date(base.getTime() + 5000), status: "collected" });

    const res = await request(app)
      .get("/api/analytics/stats?date=2024-08-20&tzOffset=0")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      date: "2024-08-20",
      total: 6,
      waiting: 2,
      ready: 1,
      collected: 3,
    });
  });

  it("history and stats return consistent total counts for the same day", async () => {
    const base = new Date("2024-09-10T12:00:00.000Z");
    await seedOrder({ created_at: base, status: "waiting" });
    await seedOrder({ created_at: new Date(base.getTime() + 1000), status: "collected" });

    const cookie = makeAuthCookie();
    const [historyRes, statsRes] = await Promise.all([
      request(app)
        .get("/api/analytics/history?date=2024-09-10&tzOffset=0")
        .set("Cookie", cookie),
      request(app)
        .get("/api/analytics/stats?date=2024-09-10&tzOffset=0")
        .set("Cookie", cookie),
    ]);

    expect(historyRes.status).toBe(200);
    expect(statsRes.status).toBe(200);
    expect(historyRes.body.length).toBe(statsRes.body.total);
  });

  it("does not count orders from a different day", async () => {
    await seedOrder({
      created_at: new Date("2024-08-19T23:59:59.999Z"),
      status: "collected",
    });
    await seedOrder({
      created_at: new Date("2024-08-21T00:00:00.001Z"),
      status: "collected",
    });

    const res = await request(app)
      .get("/api/analytics/stats?date=2024-08-20&tzOffset=0")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("respects tzOffset for stats (UTC+2)", async () => {
    // UTC+2 (tzOffset=-120): local 2024-09-01 = UTC window [2024-08-31T22:00Z, 2024-09-01T22:00Z]
    // Inside local day
    await seedOrder({
      created_at: new Date("2024-08-31T22:30:00.000Z"),
      status: "collected",
    });
    // Outside local day (before local midnight)
    await seedOrder({
      created_at: new Date("2024-08-31T21:59:59.999Z"),
      status: "collected",
    });

    const res = await request(app)
      .get("/api/analytics/stats?date=2024-09-01&tzOffset=-120")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.collected).toBe(1);
  });

  it("returns the requested date string in the response body", async () => {
    const res = await request(app)
      .get("/api/analytics/stats?date=2024-11-11&tzOffset=0")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body.date).toBe("2024-11-11");
  });

  it("does not count orders from a different venue", async () => {
    const otherId = "order-other-venue-stats";
    await db.insert(orders).values({
      id: otherId,
      venue_id: "other-venue-id",
      token: "other-token-stats",
      label: "Other venue order",
      status: "collected",
      created_at: new Date("2024-11-11T10:00:00.000Z"),
      notified_at: null,
    });

    const res = await request(app)
      .get("/api/analytics/stats?date=2024-11-11&tzOffset=0")
      .set("Cookie", makeAuthCookie());

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);

    await db.delete(orders).where(eq(orders.id, otherId));
  });
});
