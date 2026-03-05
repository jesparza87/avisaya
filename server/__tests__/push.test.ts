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
  },
}));

jest.mock("../schema", () => ({
  push_subscriptions: "push_subscriptions",
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
}));

import pushRoutes from "../routes/push";
import { db } from "../db";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/push", pushRoutes);

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
});

const validSubscription = {
  endpoint: "https://push.example.com/endpoint",
  keys: {
    p256dh: "p256dh_key_value",
    auth: "auth_key_value",
  },
};

describe("POST /api/push/subscribe", () => {
  it("returns 400 if subscription is missing", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ orderId: "order-id" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 400 if orderId is missing", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 400 if subscription object is invalid (missing keys)", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({
        subscription: { endpoint: "https://example.com" },
        orderId: "order-id",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid push subscription/i);
  });

  it("inserts new subscription and returns 201", async () => {
    mockDb.limit.mockResolvedValueOnce([]); // no existing subscription
    mockDb.returning.mockResolvedValueOnce([{ id: "sub-id" }]);
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-id" });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/saved/i);
  });

  it("updates existing subscription and returns 201", async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: "existing-sub" }]); // existing found
    mockDb.where.mockResolvedValueOnce(undefined); // update resolves
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-id" });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/saved/i);
  });
});

describe("DELETE /api/push/subscribe", () => {
  it("returns 400 if endpoint is missing", async () => {
    const res = await request(app)
      .delete("/api/push/subscribe")
      .send({ orderId: "order-id" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 400 if orderId is missing", async () => {
    const res = await request(app)
      .delete("/api/push/subscribe")
      .send({ endpoint: "https://push.example.com/endpoint" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("deletes subscription and returns 200", async () => {
    mockDb.where.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .delete("/api/push/subscribe")
      .send({
        endpoint: "https://push.example.com/endpoint",
        orderId: "order-id",
      });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removed/i);
  });
});
