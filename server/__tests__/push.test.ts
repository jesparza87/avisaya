/**
 * Tests for POST /api/push/subscribe and DELETE /api/push/subscribe.
 *
 * Covers:
 *  - Auth enforcement on DELETE
 *  - Input validation on both endpoints
 *  - Correct column names (auth_key, not auth) on insert/update
 *  - Ownership enforcement on DELETE via venue_id join on orders
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";

jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({}),
}));

jest.mock("../lib/socket", () => ({
  getIo: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
  setIo: jest.fn(),
}));

// Point db and schema imports at mocks
jest.mock("../db", () => require("../__mocks__/db"));
jest.mock("../schema", () => require("../__mocks__/schema"));

import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const SECRET = "test-secret";

function makeToken(userId = "user-1", venueId = "venue-1") {
  return jwt.sign(
    { id: userId, email: "test@test.com", venue_id: venueId, role: "admin" },
    SECRET
  );
}

// Import after mocks are set up
import { db } from "../__mocks__/db";
import pushRoutes from "../routes/push";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/push", pushRoutes);
  return app;
}

const validSubscription = {
  endpoint: "https://push.example.com/sub/1",
  keys: { p256dh: "p256dh-value", auth: "auth-value" },
};

// ---------------------------------------------------------------------------
// POST /api/push/subscribe
// ---------------------------------------------------------------------------
describe("POST /api/push/subscribe", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 400 when subscription is missing", async () => {
    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ orderId: "order-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscription and orderId are required/);
  });

  it("returns 400 when orderId is missing", async () => {
    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscription and orderId are required/);
  });

  it("returns 400 when subscription object is invalid (missing keys)", async () => {
    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: { endpoint: "https://x.com" }, orderId: "order-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid push subscription/);
  });

  it("returns 404 when order does not exist", async () => {
    // DB returns no order
    const orderChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    (db.select as jest.Mock).mockReturnValueOnce(orderChain);

    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "nonexistent" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Order not found/);
  });

  it("inserts a new subscription using auth_key column when none exists", async () => {
    // First select: order lookup — returns a valid order
    const orderChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: "order-1", venue_id: "venue-1" }]),
    };
    // Second select: existing subscription lookup — returns nothing
    const subChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    (db.select as jest.Mock)
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(subChain);

    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockResolvedValue([]),
    };
    (db.insert as jest.Mock).mockReturnValueOnce(insertChain);

    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-1" });

    expect(res.status).toBe(201);
    // Must use auth_key (schema column name), not auth
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        auth_key: validSubscription.keys.auth,
        p256dh: validSubscription.keys.p256dh,
        endpoint: validSubscription.endpoint,
        order_id: "order-1",
      })
    );
    // Must NOT include user_id (column does not exist in schema)
    expect(insertChain.values).not.toHaveBeenCalledWith(
      expect.objectContaining({ user_id: expect.anything() })
    );
  });

  it("updates keys using auth_key column when subscription already exists", async () => {
    const orderChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: "order-1", venue_id: "venue-1" }]),
    };
    const subChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        { endpoint: validSubscription.endpoint, order_id: "order-1" },
      ]),
    };
    (db.select as jest.Mock)
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(subChain);

    const updateChain = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
    };
    (db.update as jest.Mock).mockReturnValueOnce(updateChain);

    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-1" });

    expect(res.status).toBe(201);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        auth_key: validSubscription.keys.auth,
        p256dh: validSubscription.keys.p256dh,
      })
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/push/subscribe
// ---------------------------------------------------------------------------
describe("DELETE /api/push/subscribe", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when no token is provided", async () => {
    const res = await request(buildApp())
      .delete("/api/push/subscribe")
      .send({ endpoint: "https://x.com", orderId: "order-1" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when endpoint is missing", async () => {
    const token = makeToken();
    const res = await request(buildApp())
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ orderId: "order-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endpoint and orderId are required/);
  });

  it("returns 400 when orderId is missing", async () => {
    const token = makeToken();
    const res = await request(buildApp())
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ endpoint: "https://x.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endpoint and orderId are required/);
  });

  it("returns 403 when order does not belong to the user's venue", async () => {
    // Order lookup returns nothing — order not in this venue
    const orderChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    (db.select as jest.Mock).mockReturnValueOnce(orderChain);

    const token = makeToken("user-1", "venue-1");
    const res = await request(buildApp())
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ endpoint: "https://push.example.com/sub/1", orderId: "order-other-venue" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/);
  });

  it("deletes subscription when order belongs to the user's venue", async () => {
    // Order lookup returns a matching order
    const orderChain = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: "order-1", venue_id: "venue-1" }]),
    };
    (db.select as jest.Mock).mockReturnValueOnce(orderChain);

    const deleteChain = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
    };
    (db.delete as jest.Mock).mockReturnValueOnce(deleteChain);

    const token = makeToken("user-1", "venue-1");
    const res = await request(buildApp())
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ endpoint: "https://push.example.com/sub/1", orderId: "order-1" });

    expect(res.status).toBe(200);
    expect(deleteChain.where).toHaveBeenCalled();
  });
});
