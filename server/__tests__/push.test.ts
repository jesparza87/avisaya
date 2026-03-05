import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { db } from "../db";
import pushRoutes from "../routes/push";

// db is auto-mocked via moduleNameMapper → server/__mocks__/db.ts

const JWT_SECRET = process.env.JWT_SECRET!;

function makeToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      id: "user-1",
      email: "test@example.com",
      venue_id: "venue-1",
      role: "admin",
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/push", pushRoutes);
  return app;
}

const validSubscription = {
  endpoint: "https://push.example.com/sub/abc123",
  keys: { p256dh: "key-p256dh", auth: "key-auth" },
};

describe("POST /api/push/subscribe", () => {
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    // Restore default chaining behaviour after clearAllMocks
    (db.select as jest.Mock).mockReturnThis();
    (db.from as jest.Mock).mockReturnThis();
    (db.where as jest.Mock).mockReturnThis();
    (db.limit as jest.Mock).mockResolvedValue([]);
    (db.insert as jest.Mock).mockReturnThis();
    (db.values as jest.Mock).mockReturnThis();
    (db.returning as jest.Mock).mockResolvedValue([]);
    (db.update as jest.Mock).mockReturnThis();
    (db.set as jest.Mock).mockReturnThis();
  });

  it("returns 401 when no JWT is provided", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-1" });

    expect(res.status).toBe(401);
  });

  it("returns 400 when subscription is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ orderId: "order-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscription and orderId are required/i);
  });

  it("returns 400 when orderId is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: validSubscription });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscription and orderId are required/i);
  });

  it("returns 400 when subscription object is malformed (missing keys)", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: { endpoint: "https://example.com" }, orderId: "order-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid push subscription/i);
  });

  it("returns 403 when order does not belong to the authenticated user", async () => {
    // Order ownership check returns empty → order not found / not owned
    (db.limit as jest.Mock).mockResolvedValueOnce([]);

    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: validSubscription, orderId: "order-999" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/order not found/i);
  });

  it("inserts a new subscription when none exists for this endpoint+orderId", async () => {
    // First limit call: order ownership check → found
    (db.limit as jest.Mock)
      .mockResolvedValueOnce([{ id: "order-1", user_id: "user-1" }])
      // Second limit call: existing subscription check → not found
      .mockResolvedValueOnce([]);

    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: validSubscription, orderId: "order-1" });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Subscription saved");
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates an existing subscription when endpoint+orderId already exists", async () => {
    // First limit call: order ownership check → found
    (db.limit as jest.Mock)
      .mockResolvedValueOnce([{ id: "order-1", user_id: "user-1" }])
      // Second limit call: existing subscription check → found
      .mockResolvedValueOnce([{ id: "sub-1" }]);

    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: validSubscription, orderId: "order-1" });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Subscription saved");
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/push/subscribe", () => {
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    (db.select as jest.Mock).mockReturnThis();
    (db.from as jest.Mock).mockReturnThis();
    (db.where as jest.Mock).mockReturnThis();
    (db.limit as jest.Mock).mockResolvedValue([]);
    (db.delete as jest.Mock).mockReturnThis();
  });

  it("returns 401 when no JWT is provided", async () => {
    const res = await request(app)
      .delete("/api/push/subscribe")
      .send({ endpoint: "https://push.example.com/sub/abc123", orderId: "order-1" });

    expect(res.status).toBe(401);
  });

  it("returns 400 when endpoint is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ orderId: "order-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endpoint and orderId are required/i);
  });

  it("returns 400 when orderId is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ endpoint: "https://push.example.com/sub/abc123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endpoint and orderId are required/i);
  });

  it("returns 403 when order does not belong to the authenticated user", async () => {
    (db.limit as jest.Mock).mockResolvedValueOnce([]);

    const token = makeToken();
    const res = await request(app)
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ endpoint: "https://push.example.com/sub/abc123", orderId: "order-999" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/order not found/i);
  });

  it("deletes the subscription when order belongs to the authenticated user", async () => {
    // Order ownership check → found
    (db.limit as jest.Mock).mockResolvedValueOnce([{ id: "order-1", user_id: "user-1" }]);

    const token = makeToken();
    const res = await request(app)
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ endpoint: "https://push.example.com/sub/abc123", orderId: "order-1" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Subscription removed");
    expect(db.delete).toHaveBeenCalled();
  });
});
