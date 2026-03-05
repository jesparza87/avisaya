import request from "supertest";
import express, { Express } from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const TEST_JWT_SECRET = "test-secret-for-push";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../server/db", () => ({ db: {} }));
jest.mock("../server/schema", () => ({
  push_subscriptions: {
    endpoint: "endpoint",
    order_id: "order_id",
    p256dh: "p256dh",
    auth_key: "auth_key",
    created_at: "created_at",
  },
}));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((_a: unknown, _b: unknown) => "eq"),
  and: jest.fn((..._args: unknown[]) => "and"),
}));

const mockPushDb = {
  selectRows: [] as unknown[],
  insertCalled: false,
  updateCalled: false,
  deleteCalled: false,
};

jest.mock("../server/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      then(resolve: (v: unknown[]) => void) {
        resolve(mockPushDb.selectRows);
        return this;
      },
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => {
        mockPushDb.insertCalled = true;
        return Promise.resolve([]);
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn().mockReturnThis(),
      where: jest.fn(() => {
        mockPushDb.updateCalled = true;
        return Promise.resolve([]);
      }),
    })),
    delete: jest.fn(() => ({
      where: jest.fn(() => {
        mockPushDb.deleteCalled = true;
        return Promise.resolve([]);
      }),
    })),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeToken() {
  return jwt.sign(
    { id: "user-uuid-1", email: "bar@example.com", venue_id: "venue-uuid-1", role: "admin" },
    TEST_JWT_SECRET,
    { expiresIn: "1h" }
  );
}

const VALID_SUBSCRIPTION = {
  endpoint: "https://push.example.com/sub/abc",
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTiHTjdy0",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
};

function buildApp(): Express {
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pushRouter = require("../server/routes/push").default;
  app.use("/api/push", pushRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/push/subscribe", () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    mockPushDb.selectRows = [];
    mockPushDb.insertCalled = false;
    mockPushDb.updateCalled = false;
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ subscription: VALID_SUBSCRIPTION, orderId: "order-uuid-1" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when subscription is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ orderId: "order-uuid-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscription and orderId are required/i);
  });

  it("returns 400 when orderId is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: VALID_SUBSCRIPTION });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscription and orderId are required/i);
  });

  it("returns 400 when subscription object is invalid (missing keys)", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: { endpoint: "https://example.com" }, orderId: "order-uuid-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid push subscription/i);
  });

  it("returns 201 and inserts a new subscription when none exists", async () => {
    mockPushDb.selectRows = []; // no existing subscription
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: VALID_SUBSCRIPTION, orderId: "order-uuid-1" });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/subscription saved/i);
  });

  it("returns 201 and updates when subscription already exists", async () => {
    mockPushDb.selectRows = [{ id: "existing-sub-id" }]; // existing subscription
    const token = makeToken();
    const res = await request(app)
      .post("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ subscription: VALID_SUBSCRIPTION, orderId: "order-uuid-1" });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/subscription saved/i);
  });
});

describe("DELETE /api/push/subscribe", () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    mockPushDb.deleteCalled = false;
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .delete("/api/push/subscribe")
      .send({ endpoint: "https://push.example.com/sub/abc", orderId: "order-uuid-1" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when endpoint is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ orderId: "order-uuid-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endpoint and orderId are required/i);
  });

  it("returns 400 when orderId is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ endpoint: "https://push.example.com/sub/abc" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endpoint and orderId are required/i);
  });

  it("returns 200 on successful deletion", async () => {
    const token = makeToken();
    const res = await request(app)
      .delete("/api/push/subscribe")
      .set("Cookie", `token=${token}`)
      .send({ endpoint: "https://push.example.com/sub/abc", orderId: "order-uuid-1" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/subscription removed/i);
  });
});
