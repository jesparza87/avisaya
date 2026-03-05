import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import bcrypt from "bcryptjs";

jest.mock("../db");
import { db } from "../db";

import authRouter from "../routes/auth";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRouter);

const mockDb = db as jest.Mocked<typeof db>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "test-secret";
  mockDb.select.mockReturnThis();
  mockDb.from.mockReturnThis();
  mockDb.where.mockReturnThis();
  mockDb.limit.mockResolvedValue([]);
  mockDb.insert.mockReturnThis();
  mockDb.values.mockReturnThis();
  mockDb.returning.mockResolvedValue([]);
  mockDb.update.mockReturnThis();
  mockDb.set.mockReturnThis();
});

describe("POST /api/auth/register", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 400 when password is too short", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com", password: "short", venueName: "Bar" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contraseña/i);
  });

  it("returns 409 when email already exists", async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: "existing-id" }]);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "taken@b.com", password: "password123", venueName: "Bar" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it("returns 201 and creates user + venue on valid input", async () => {
    const venueId = "venue-uuid";
    const userId = "user-uuid";

    // Call sequence:
    // 1. Check existing user → []
    // 2. Check slug uniqueness → []
    // 3. Insert venue → [venue]
    // 4. Insert user → [user]
    mockDb.limit
      .mockResolvedValueOnce([]) // no existing user
      .mockResolvedValueOnce([]); // slug is unique

    mockDb.returning
      .mockResolvedValueOnce([{ id: venueId, name: "My Bar", slug: "my-bar", plan: "free" }])
      .mockResolvedValueOnce([
        { id: userId, email: "new@b.com", venue_id: venueId, role: "admin" },
      ]);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new@b.com", password: "password123", venueName: "My Bar" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("new@b.com");
  });

  it("appends numeric suffix to slug when base slug is taken", async () => {
    const venueId = "venue-uuid";
    const userId = "user-uuid";

    mockDb.limit
      .mockResolvedValueOnce([]) // no existing user
      .mockResolvedValueOnce([{ id: "other-venue" }]) // slug "my-bar" taken
      .mockResolvedValueOnce([]); // slug "my-bar-1" is free

    mockDb.returning
      .mockResolvedValueOnce([{ id: venueId, name: "My Bar", slug: "my-bar-1", plan: "free" }])
      .mockResolvedValueOnce([
        { id: userId, email: "new2@b.com", venue_id: venueId, role: "admin" },
      ]);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new2@b.com", password: "password123", venueName: "My Bar" });

    expect(res.status).toBe(201);
  });
});

describe("POST /api/auth/login", () => {
  it("returns 400 when fields are missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com" });
    expect(res.status).toBe(400);
  });

  it("returns 401 when user not found", async () => {
    mockDb.limit.mockResolvedValueOnce([]);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@b.com", password: "password123" });
    expect(res.status).toBe(401);
  });

  it("returns 401 when password is wrong", async () => {
    const hash = await bcrypt.hash("correct-password", 1);
    mockDb.limit.mockResolvedValueOnce([
      { id: "uid", email: "a@b.com", password_hash: hash, venue_id: "vid", role: "admin" },
    ]);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.com", password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("returns 200 and sets cookie on valid credentials", async () => {
    const hash = await bcrypt.hash("password123", 1);
    mockDb.limit.mockResolvedValueOnce([
      { id: "uid", email: "a@b.com", password_hash: hash, venue_id: "vid", role: "admin" },
    ]);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("a@b.com");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 500 when JWT_SECRET is not configured", async () => {
    const hash = await bcrypt.hash("password123", 1);
    mockDb.limit.mockResolvedValueOnce([
      { id: "uid", email: "a@b.com", password_hash: hash, venue_id: "vid", role: "admin" },
    ]);
    delete process.env.JWT_SECRET;

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.com", password: "password123" });

    expect(res.status).toBe(500);
    process.env.JWT_SECRET = "test-secret";
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
  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 200 with user when valid token cookie is provided", async () => {
    const jwtLib = require("jsonwebtoken");
    const token = jwtLib.sign(
      { id: "uid", email: "a@b.com", venue_id: "vid", role: "admin" },
      "test-secret",
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("a@b.com");
  });

  it("returns 401 when token is invalid", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", "token=invalid.token.here");

    expect(res.status).toBe(401);
  });
});
