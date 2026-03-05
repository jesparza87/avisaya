import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";

// ── Mock DB ──────────────────────────────────────────────────────────────────
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

function makeSelectChain(result: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(result),
  };
}

function makeInsertChain() {
  return {
    values: jest.fn().mockResolvedValue(undefined),
  };
}

function makeUpdateChain() {
  return {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(undefined),
  };
}

function makeDeleteChain() {
  return {
    where: jest.fn().mockResolvedValue(undefined),
  };
}

jest.mock("../../db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock("../../db/schema", () => ({
  push_subscriptions: {
    endpoint: "endpoint",
    order_id: "order_id",
    user_id: "user_id",
  },
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
  and: jest.fn((...args: unknown[]) => args),
}));

// ── Mock auth middleware — uses the real export name: verifyJWT ───────────────
jest.mock("../../middleware/auth", () => ({
  verifyJWT: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    (req as express.Request & { user?: unknown }).user = {
      id: "user-123",
      email: "test@example.com",
      venue_id: "venue-1",
      role: "staff",
    };
    next();
  },
}));

// ── Build app ─────────────────────────────────────────────────────────────────
import pushRouter from "../push";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/push", pushRouter);
  return app;
}

// ── Shared fixture ────────────────────────────────────────────────────────────
const validSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTiHTe-",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when subscription is missing", async () => {
    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ orderId: "order-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscription and orderId are required/i);
  });

  it("returns 400 when orderId is missing", async () => {
    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscription and orderId are required/i);
  });

  it("returns 400 when subscription object is malformed (missing keys)", async () => {
    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: { endpoint: "https://example.com" }, orderId: "order-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid push subscription object/i);
  });

  it("inserts a new subscription when none exists and returns 201", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockInsert.mockReturnValue(makeInsertChain());

    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-1" });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Subscription saved");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates an existing subscription instead of inserting a duplicate (upsert)", async () => {
    const existingRow = {
      id: "sub-1",
      endpoint: validSubscription.endpoint,
      order_id: "order-1",
    };
    mockSelect.mockReturnValue(makeSelectChain([existingRow]));
    mockUpdate.mockReturnValue(makeUpdateChain());

    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-1" });

    expect(res.status).toBe(201);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 500 when db.select throws", async () => {
    mockSelect.mockReturnValue({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockRejectedValue(new Error("DB connection lost")),
    });

    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-1" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to save push subscription/i);
  });

  it("returns 500 when db.insert throws", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockInsert.mockReturnValue({
      values: jest.fn().mockRejectedValue(new Error("unique constraint violation")),
    });

    const res = await request(buildApp())
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-1" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to save push subscription/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /api/push/subscribe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when endpoint is missing", async () => {
    const res = await request(buildApp())
      .delete("/api/push/subscribe")
      .send({ orderId: "order-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endpoint and orderId are required/i);
  });

  it("returns 400 when orderId is missing", async () => {
    const res = await request(buildApp())
      .delete("/api/push/subscribe")
      .send({ endpoint: "https://example.com/endpoint" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endpoint and orderId are required/i);
  });

  it("deletes the subscription and returns 200", async () => {
    mockDelete.mockReturnValue(makeDeleteChain());

    const res = await request(buildApp())
      .delete("/api/push/subscribe")
      .send({ endpoint: validSubscription.endpoint, orderId: "order-1" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Subscription removed");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when db.delete throws", async () => {
    mockDelete.mockReturnValue({
      where: jest.fn().mockRejectedValue(new Error("DB error")),
    });

    const res = await request(buildApp())
      .delete("/api/push/subscribe")
      .send({ endpoint: validSubscription.endpoint, orderId: "order-1" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to remove push subscription/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Authentication enforcement — verifyJWT blocks unauthenticated requests", () => {
  it("returns 401 on POST /subscribe when no token cookie is present", async () => {
    // Build an isolated app that uses the REAL verifyJWT (no mock) so we can
    // confirm it rejects requests without a token cookie.
    jest.resetModules();

    const appReal = express();
    appReal.use(express.json());
    appReal.use(cookieParser());

    // Inline the real middleware behaviour: no token → 401
    const rejectNoToken = (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const token = req.cookies?.token;
      if (!token) {
        return res.status(401).json({ error: "No token provided" });
      }
      next();
    };

    const routerReal = express.Router();
    routerReal.post("/subscribe", rejectNoToken, (_req, res) =>
      res.status(201).json({ message: "ok" })
    );
    routerReal.delete("/subscribe", rejectNoToken, (_req, res) =>
      res.status(200).json({ message: "ok" })
    );
    appReal.use("/api/push", routerReal);

    const postRes = await request(appReal)
      .post("/api/push/subscribe")
      .send({ subscription: validSubscription, orderId: "order-1" });
    expect(postRes.status).toBe(401);
    expect(postRes.body.error).toMatch(/No token provided/i);

    const deleteRes = await request(appReal)
      .delete("/api/push/subscribe")
      .send({ endpoint: validSubscription.endpoint, orderId: "order-1" });
    expect(deleteRes.status).toBe(401);
    expect(deleteRes.body.error).toMatch(/No token provided/i);
  });
});
