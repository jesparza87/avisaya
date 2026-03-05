import request from "supertest";
import express, { Express } from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const TEST_JWT_SECRET = "test-secret-for-orders";

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../server/db", () => ({ db: {} }));
jest.mock("../server/schema", () => ({
  orders: {
    id: "id",
    venue_id: "venue_id",
    token: "token",
    label: "label",
    status: "status",
    created_at: "created_at",
    notified_at: "notified_at",
  },
}));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((_a: unknown, _b: unknown) => "eq"),
  and: jest.fn((..._args: unknown[]) => "and"),
  desc: jest.fn((_a: unknown) => "desc"),
}));

// Mutable state for controlling DB responses per test
const mockDb = {
  selectRows: [] as unknown[],
  insertRows: [] as unknown[],
  updateRows: [] as unknown[],
  deleteRows: [] as unknown[],
};

jest.mock("../server/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      then(resolve: (v: unknown[]) => void) {
        resolve(mockDb.selectRows);
        return this;
      },
    })),
    insert: jest.fn(() => ({
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(() => Promise.resolve(mockDb.insertRows)),
    })),
    update: jest.fn(() => ({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn(() => Promise.resolve(mockDb.updateRows)),
    })),
    delete: jest.fn(() => ({
      where: jest.fn(() => Promise.resolve([])),
    })),
  },
}));

// Mock socket.io getIo
jest.mock("../server/lib/socket", () => ({
  getIo: jest.fn(() => ({
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(venueId = "venue-uuid-1") {
  return jwt.sign(
    { id: "user-uuid-1", email: "bar@example.com", venue_id: venueId, role: "admin" },
    TEST_JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function buildApp(): Express {
  // Override JWT_SECRET for middleware
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ordersRouter = require("../server/routes/orders").default;
  app.use("/api/orders", ordersRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/orders — create order", () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    mockDb.insertRows = [];
    mockDb.selectRows = [];
  });

  it("returns 401 when no auth cookie is provided", async () => {
    const res = await request(app).post("/api/orders").send({ label: "Table 5" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when label is missing", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", `token=${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label is required/i);
  });

  it("returns 400 when label is blank", async () => {
    const token = makeToken();
    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", `token=${token}`)
      .send({ label: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label is required/i);
  });

  it("returns 201 with the created order", async () => {
    const fakeOrder = {
      id: "order-uuid-1",
      venue_id: "venue-uuid-1",
      token: "tok-uuid-1",
      label: "Table 5",
      status: "waiting",
      created_at: new Date().toISOString(),
      notified_at: null,
    };
    mockDb.insertRows = [fakeOrder];

    const token = makeToken();
    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", `token=${token}`)
      .send({ label: "Table 5" });

    expect(res.status).toBe(201);
    expect(res.body.label).toBe("Table 5");
  });
});

describe("GET /api/orders — list orders", () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    mockDb.selectRows = [];
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(401);
  });

  it("returns 200 with an array of orders", async () => {
    mockDb.selectRows = [
      { id: "o1", label: "Table 1", status: "waiting" },
      { id: "o2", label: "Table 2", status: "ready" },
    ];

    const token = makeToken();
    const res = await request(app)
      .get("/api/orders")
      .set("Cookie", `token=${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });
});

describe("GET /api/orders/token/:token — public order lookup", () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    mockDb.selectRows = [];
  });

  it("returns 404 when order is not found", async () => {
    mockDb.selectRows = [];
    const res = await request(app).get("/api/orders/token/nonexistent-token");
    expect(res.status).toBe(404);
  });

  it("returns 200 with order data when found", async () => {
    const fakeOrder = {
      id: "order-uuid-1",
      label: "Table 3",
      status: "waiting",
      created_at: new Date().toISOString(),
      venue_id: "venue-uuid-1",
    };
    mockDb.selectRows = [fakeOrder];

    const res = await request(app).get("/api/orders/token/some-valid-token");
    expect(res.status).toBe(200);
    expect(res.body.label).toBe("Table 3");
  });
});

describe("DELETE /api/orders/:id — delete order", () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    mockDb.selectRows = [];
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/orders/some-id");
    expect(res.status).toBe(401);
  });

  it("returns 404 when order does not exist", async () => {
    mockDb.selectRows = [];
    const token = makeToken();
    const res = await request(app)
      .delete("/api/orders/nonexistent-id")
      .set("Cookie", `token=${token}`);
    expect(res.status).toBe(404);
  });

  it("returns 400 when order status is ready", async () => {
    mockDb.selectRows = [{ id: "order-uuid-1", status: "ready", venue_id: "venue-uuid-1" }];
    const token = makeToken();
    const res = await request(app)
      .delete("/api/orders/order-uuid-1")
      .set("Cookie", `token=${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot delete/i);
  });

  it("returns 200 when order is successfully deleted", async () => {
    mockDb.selectRows = [{ id: "order-uuid-1", status: "waiting", venue_id: "venue-uuid-1" }];
    const token = makeToken();
    const res = await request(app)
      .delete("/api/orders/order-uuid-1")
      .set("Cookie", `token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
