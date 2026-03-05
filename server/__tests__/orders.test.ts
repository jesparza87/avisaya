import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";

jest.mock("../db", () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
  },
}));

jest.mock("../schema", () => ({
  orders: "orders",
}));

jest.mock("../middleware/auth", () => ({
  verifyJWT: (req: any, _res: any, next: any) => {
    req.user = { id: "user-id", email: "a@b.com", venue_id: "venue-id", role: "admin" };
    next();
  },
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn(() => "eq_condition"),
  and: jest.fn(() => "and_condition"),
  desc: jest.fn(() => "desc_condition"),
}));

import ordersRoutes from "../routes/orders";
import { db } from "../db";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/orders", ordersRoutes);

const mockDb = db as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.delete.mockReturnThis();
  mockDb.orderBy.mockReturnThis();
});

describe("POST /api/orders", () => {
  it("returns 400 if label is missing", async () => {
    const res = await request(app).post("/api/orders").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label/i);
  });

  it("returns 400 if label is empty string", async () => {
    const res = await request(app).post("/api/orders").send({ label: "   " });
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful order creation", async () => {
    const mockOrder = {
      id: "order-id",
      venue_id: "venue-id",
      label: "Table 5",
      status: "waiting",
      token: "some-token",
      created_at: new Date().toISOString(),
    };
    mockDb.returning.mockResolvedValueOnce([mockOrder]);
    const res = await request(app).post("/api/orders").send({ label: "Table 5" });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe("Table 5");
  });
});

describe("GET /api/orders", () => {
  it("returns list of orders", async () => {
    const mockOrders = [
      { id: "order-1", label: "Table 1", status: "waiting", venue_id: "venue-id" },
    ];
    mockDb.limit.mockResolvedValueOnce(mockOrders);
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /api/orders/token/:token", () => {
  it("returns 404 if order not found", async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const res = await request(app).get("/api/orders/token/nonexistent-token");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns order if found", async () => {
    const mockOrder = { id: "order-id", label: "Table 5", status: "waiting" };
    mockDb.limit.mockResolvedValueOnce([mockOrder]);
    const res = await request(app).get("/api/orders/token/valid-token");
    expect(res.status).toBe(200);
    expect(res.body.label).toBe("Table 5");
  });
});

describe("PATCH /api/orders/:id/ready", () => {
  it("returns 404 if order not found", async () => {
    mockDb.returning.mockResolvedValueOnce([]);
    const res = await request(app).patch("/api/orders/nonexistent-id/ready");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns updated order with status ready", async () => {
    const mockOrder = {
      id: "order-id",
      status: "ready",
      notified_at: new Date().toISOString(),
    };
    mockDb.returning.mockResolvedValueOnce([mockOrder]);
    const res = await request(app).patch("/api/orders/order-id/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });
});

describe("PATCH /api/orders/:id/collected", () => {
  it("returns 404 if order not found", async () => {
    mockDb.returning.mockResolvedValueOnce([]);
    const res = await request(app).patch("/api/orders/nonexistent-id/collected");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns updated order with status collected", async () => {
    const mockOrder = { id: "order-id", status: "collected" };
    mockDb.returning.mockResolvedValueOnce([mockOrder]);
    const res = await request(app).patch("/api/orders/order-id/collected");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("collected");
  });
});

describe("DELETE /api/orders/:id", () => {
  it("returns 404 if order not found", async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const res = await request(app).delete("/api/orders/nonexistent-id");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 400 if order status is ready", async () => {
    mockDb.limit.mockResolvedValueOnce([
      { id: "order-id", status: "ready", venue_id: "venue-id" },
    ]);
    const res = await request(app).delete("/api/orders/order-id");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot delete/i);
  });

  it("returns success when order is deleted", async () => {
    mockDb.limit.mockResolvedValueOnce([
      { id: "order-id", status: "waiting", venue_id: "venue-id" },
    ]);
    mockDb.where.mockResolvedValueOnce(undefined);
    const res = await request(app).delete("/api/orders/order-id");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
