import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";

// Mock modules before importing routes
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
  },
}));

jest.mock("../schema", () => ({
  users: "users",
  venues: "venues",
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed_password"),
  compare: jest.fn(),
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn().mockReturnValue("mock_jwt_token"),
  verify: jest.fn(),
}));

jest.mock("../middleware/auth", () => ({
  verifyJWT: (req: any, _res: any, next: any) => {
    req.user = { id: "user-id", email: "a@b.com", venue_id: "venue-id", role: "admin" };
    next();
  },
}));

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((_col: any, _val: any) => "eq_condition"),
}));

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req: any, _res: any, next: any) => next())
);

import authRoutes from "../routes/auth";
import { db } from "../db";
import bcrypt from "bcryptjs";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);

const mockDb = db as any;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "test_secret";
  // Reset chain mocks
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
});

describe("POST /api/auth/register", () => {
  it("returns 400 if required fields are missing", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 400 if password is too short", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com", password: "short", venueName: "My Bar" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contraseña/i);
  });

  it("returns 409 if email already exists", async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: "existing-user" }]);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "existing@b.com", password: "password123", venueName: "My Bar" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it("returns 409 if venue slug already exists", async () => {
    mockDb.limit
      .mockResolvedValueOnce([])                        // no existing user
      .mockResolvedValueOnce([{ id: "existing-venue" }]); // slug taken
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new@b.com", password: "password123", venueName: "My Bar" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/similar name/i);
  });

  it("returns 201 on successful registration", async () => {
    const mockVenue = { id: "venue-id", name: "My Bar", slug: "my-bar" };
    const mockUser = { id: "user-id", email: "new@b.com", venue_id: "venue-id", role: "admin" };

    mockDb.limit
      .mockResolvedValueOnce([]) // no existing user
      .mockResolvedValueOnce([]); // no existing slug
    mockDb.returning
      .mockResolvedValueOnce([mockVenue]) // venue insert
      .mockResolvedValueOnce([mockUser]); // user insert
    // update venue owner_id — chain returns nothing
    mockDb.where.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new@b.com", password: "password123", venueName: "My Bar" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("new@b.com");
  });
});

describe("POST /api/auth/login", () => {
  it("returns 400 if fields are missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
  });

  it("returns 401 if user not found", async () => {
    mockDb.limit.mockResolvedValueOnce([]);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "notfound@b.com", password: "password123" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it("returns 401 if password is wrong", async () => {
    mockDb.limit.mockResolvedValueOnce([
      { id: "user-id", email: "a@b.com", password_hash: "hashed", venue_id: "v1", role: "admin" },
    ]);
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.com", password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it("returns 200 and sets cookie on valid login", async () => {
    mockDb.limit.mockResolvedValueOnce([
      { id: "user-id", email: "a@b.com", password_hash: "hashed", venue_id: "v1", role: "admin" },
    ]);
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.com", password: "correctpassword" });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("a@b.com");
    expect(res.headers["set-cookie"]).toBeDefined();
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the current user from JWT middleware", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("a@b.com");
  });
});
