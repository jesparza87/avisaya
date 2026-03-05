import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import jwt from "jsonwebtoken";

jest.mock("../db");
jest.mock("../lib/socket");

import { db } from "../db";
import { getIo } from "../lib/socket";
import ordersRouter from "../routes/orders";

const JWT_SECRET = "test-secret";
process.env.JWT_SECRET = JWT_SECRET;

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/orders", ordersRouter);

const mockDb = db as jest.Mocked<typeof db>;
const mockGetIo = getIo as jest.MockedFunction<typeof getIo>;

function makeToken(venueId: string) {
  return jwt.sign(
    { id: "user-id", email: "a@b.com", venue_id: venueId, role: "admin" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

function setupIoMock() {
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  mockGetIo.mockReturnValue({ to: mockTo } as never);
  return { mockTo, mockEmit };
}

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
  mockDb.orderBy.mockReturnThis();
});

describe("POST /api/orders", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).post("/api/orders").send({ label: "Mesa 1" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when label is missing", async () => {
    const token = makeToken("venue-id");
    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", `token=${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/label/i);
  });

  it("returns 400 when label is empty string", async () => {
    const token = makeToken("venue-id");
    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", `token=${token}`)
      .send({ label: "   " });
    expect(res.status).toBe(400);
  });

  it("returns 201 on valid order creation", async () => {
    const token = makeToken("venue-id");
    const order = {
      id: "order-id",
      venue_id: "venue-id",
      token: "tok",
      label: "Mesa 1",
      status: "waiting",
      created_at: new Date().toISOString(),
      notified_at: null,
    };
    mockDb.returning.mockResolvedValueOnce([order]);

    const res = await request(app)
      .post("/api/orders")
      .set("Cookie", `token=${token}`)
      .send({ label: "Mesa 1" });

    expect(res.status).toBe(201);
    expect(res.body.label).toBe("Mesa 1");
  });
});

describe("GET /api/orders", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(401);
  });

  it("returns 200 with list of orders", async () => {
    const token = makeToken("venue-id");
    const orders = [
      { id: "o1", venue_id: "venue-id", label: "Mesa 1", status: "waiting" },
    ];
    mockDb.orderBy.mockResolvedValueOnce(orders);

    const res = await request(app)
      .get("/api/orders")
      .set("Cookie", `token=${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/orders/token/:token", () => {
  it("returns 404 when order not found", async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const res = await request(app).get("/api/orders/token/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 200 with order when found", async () => {
    const order = {
      id: "o1",
      label: "Mesa 1",
      status: "waiting",
      created_at: new Date().toISOString(),
      venue_id: "venue-id",
    };
    mockDb.limit.mockResolvedValueOnce([order]);

    const res = await request(app).get("/api/orders/token/some-token");
    expect(res.status).toBe(200);
    expect(res.body.label).toBe("Mesa 1");
  });
});

describe("PATCH /api/orders/:id/ready", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).patch("/api/orders/order-id/ready");
    expect(res.status).toBe(401);
  });

  it("returns 404 when order not found", async () => {
    const token = makeToken("venue-id");
    mockDb.returning.mockResolvedValueOnce([]);

    const res = await request(app)
      .patch("/api/orders/nonexistent/ready")
      .set("Cookie", `token=${token}`);
    expect(res.status).toBe(404);
  });

  it("returns 200 and emits socket events on success", async () => {
    const token = makeToken("venue-id");
    const updated = {
      id: "order-id",
      venue_id: "venue-id",
      token: "order-token",
      label: "Mesa 1",
      status: "ready",
      created_at: new Date().toISOString(),
      notified_at: new Date().toISOString(),
    };
    mockDb.returning.mockResolvedValueOnce([updated]);
    const { mockTo, mockEmit } = setupIoMock();

    const res = await request(app)
      .patch("/api/orders/order-id/ready")
      .set("Cookie", `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(mockTo).toHaveBeenCalledWith("venue-id");
    expect(mockTo).toHaveBeenCalledWith("order-token");
    expect(mockEmit).toHaveBeenCalledWith("order:updated", expect.objectContaining({ status: "ready" }));
  });
});

describe("PATCH /api/orders/:id/collected", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).patch("/api/orders/order-id/collected");
    expect(res.status).toBe(401);
  });

  it("returns 404 when order not found", async () => {
    const token = makeToken("venue-id");
    mockDb.returning.mockResolvedValueOnce([]);

    const res = await request(app)
      .patch("/api/orders/nonexistent/collected")
      .set("Cookie", `token=${token}`);
    expect(res.status).toBe(404);
  });

  it("returns 200 and emits socket events on success", async () => {
    const token = makeToken("venue-id");
    const updated = {
      id: "order-id",
      venue_id: "venue-id",
      token: "order-token",
      label: "Mesa 1",
      status: "collected",
      created_at: new Date().toISOString(),
      notified_at: null,
    };
    mockDb.returning.mockResolvedValueOnce([updated]);
    const { mockTo, mockEmit } = setupIoMock();

    const res = await request(app)
      .patch("/api/orders/order-id/collected")
      .set("Cookie", `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("collected");
    expect(mockTo).toHaveBeenCalledWith("venue-id");
    expect(mockTo).toHaveBeenCalledWith("order-token");
    expect(mockEmit).toHaveBeenCalledWith("order:updated", expect.objectContaining({ status: "collected" }));
  });
});

describe("DELETE /api/orders/:id", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).delete("/api/orders/order-id");
    expect(res.status).toBe(401);
  });

  it("returns 404 when order not found", async () => {
    const token = makeToken("venue-id");
    mockDb.limit.mockResolvedValueOnce([]);

    const res = await request(app)
      .delete("/api/orders/nonexistent")
      .set("Cookie", `token=${token}`);
    expect(res.status).toBe(404);
  });

  it("returns 400 when order status is ready", async () => {
    const token = makeToken("venue-id");
    mockDb.limit.mockResolvedValueOnce([
      { id: "order-id", status: "ready", venue_id: "venue-id" },
    ]);

    const res = await request(app)
      .delete("/api/orders/order-id")
      .set("Cookie", `token=${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ready/i);
  });

  it("returns 200 on successful deletion of waiting order", async () => {
    const token = makeToken("venue-id");
    mockDb.limit.mockResolvedValueOnce([
      { id: "order-id", status: "waiting", venue_id: "venue-id" },
    ]);

    const res = await request(app)
      .delete("/api/orders/order-id")
      .set("Cookie", `token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 200 on successful deletion of collected order", async () => {
    const token = makeToken("venue-id");
    mockDb.limit.mockResolvedValueOnce([
      { id: "order-id", status: "collected", venue_id: "venue-id" },
    ]);

    const res = await request(app)
      .delete("/api/orders/order-id")
      .set("Cookie", `token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
