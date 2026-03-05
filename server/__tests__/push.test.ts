import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";

jest.mock("../db");

import { db } from "../db";
import pushRouter from "../routes/push";

const JWT_SECRET = "test-secret";
process.env.JWT_SECRET = JWT_SECRET;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/push", pushRouter);

const mockDb = db as jest.Mocked<typeof db>;

function makeToken(userId = "user-id") {
  return jwt.sign(
    { id: userId, email: "a@b.com", venue_id: "venue-id", role: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

const validSubscription = {
  endpoint: "https://push.example.com/sub/1",
  keys: {
    p256dh: "p256dh-key",
    auth: "auth-key",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.returning.mockResolvedValue([]);
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
  mockDb.delete.mockReturnThis();
});

describe("POST /api/push/subscribe", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-id" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when subscription is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ orderId: "order-id" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 400 when orderId is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: validSubscription });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 400 when subscription object is missing keys", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: { endpoint: "https://example.com" }, orderId: "order-id" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid push subscription/i);
  });

  it("returns 400 when subscription keys are incomplete", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({
        subscription: { endpoint: "https://example.com", keys: { p256dh: "key" } },
        orderId: "order-id",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid push subscription/i);
  });

  it("returns 201 and inserts new subscription when none exists", async () => {
    const token = makeToken();
    mockDb.limit.mockResolvedValueOnce([]); // no existing subscription

    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: validSubscription, orderId: "order-id" });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/saved/i);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("returns 201 and updates existing subscription when one exists", async () => {
    const token = makeToken();
    mockDb.limit.mockResolvedValueOnce([{ id: "existing-sub-id" }]);

    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: validSubscription, orderId: "order-id" });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/saved/i);
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/push/subscribe", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app)
      .delete("/api/push/subscribe")
      .send({ endpoint: "https://push.example.com/sub/1", orderId: "order-id" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when endpoint is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ orderId: "order-id" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 400 when orderId is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ endpoint: "https://push.example.com/sub/1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 200 on successful deletion", async () => {
    const token = makeToken();

    const res = await request(app)
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ endpoint: "https://push.example.com/sub/1", orderId: "order-id" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removed/i);
    expect(mockDb.delete).toHaveBeenCalled();
  });
});
