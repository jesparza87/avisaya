import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db";
import authRoutes from "../routes/auth";

// db is auto-mocked via moduleNameMapper → server/__mocks__/db.ts

const JWT_SECRET = process.env.JWT_SECRET!;

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRoutes);
  return app;
}

describe("POST /api/auth/register", () => {
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
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

  it("returns 400 when venueName is missing", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com", password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/venueName/i);
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ password: "password123", venueName: "My Bar" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com", password: "short", venueName: "My Bar" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contraseña/i);
  });

  it("returns 409 when email is already registered", async () => {
    // Email lookup returns an existing user
    (db.limit as jest.Mock).mockResolvedValueOnce([{ id: "existing-user" }]);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "taken@example.com", password: "password123", venueName: "My Bar" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it("creates a venue and user and returns 201", async () => {
    // Email lookup → not found
    (db.limit as jest.Mock).mockResolvedValueOnce([]);

    // uniqueSlug: the where() call for the LIKE query must resolve to an array
    // (not return `this`). We queue one resolved value for that specific call.
    (db.where as jest.Mock)
      .mockResolvedValueOnce([]) // slug LIKE query → no conflicts
      .mockReturnThis();         // all subsequent where() calls chain normally

    // venue insert returning
    (db.returning as jest.Mock)
      .mockResolvedValueOnce([{ id: "venue-1", slug: "my-bar" }])
      // user insert returning
      .mockResolvedValueOnce([
        { id: "user-1", email: "new@example.com", venue_id: "venue-1", role: "admin" },
      ]);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new@example.com", password: "password123", venueName: "My Bar" });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Registration successful");
    expect(res.body.user.email).toBe("new@example.com");
  });

  it("generates a unique slug when base slug is already taken", async () => {
    // Email lookup → not found
    (db.limit as jest.Mock).mockResolvedValueOnce([]);

    // uniqueSlug: LIKE query returns existing slugs including the base
    (db.where as jest.Mock)
      .mockResolvedValueOnce([{ slug: "my-bar" }, { slug: "my-bar-2" }])
      .mockReturnThis();

    (db.returning as jest.Mock)
      .mockResolvedValueOnce([{ id: "venue-2", slug: "my-bar-3" }])
      .mockResolvedValueOnce([
        { id: "user-2", email: "new2@example.com", venue_id: "venue-2", role: "admin" },
      ]);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new2@example.com", password: "password123", venueName: "My Bar" });

    expect(res.status).toBe(201);
    // The slug passed to insert should be "my-bar-3"
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "my-bar-3" })
    );
  });
});

describe("POST /api/auth/login", () => {
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    (db.select as jest.Mock).mockReturnThis();
    (db.from as jest.Mock).mockReturnThis();
    (db.where as jest.Mock).mockReturnThis();
    (db.limit as jest.Mock).mockResolvedValue([]);
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and password are required/i);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and password are required/i);
  });

  it("returns 401 when user is not found", async () => {
    (db.limit as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it("returns 401 when password is wrong", async () => {
    const hash = await bcrypt.hash("correct-password", 1);
    (db.limit as jest.Mock).mockResolvedValueOnce([
      {
        id: "user-1",
        email: "a@b.com",
        password_hash: hash,
        venue_id: "v-1",
        role: "admin",
      },
    ]);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it("returns 200 and sets an httpOnly cookie on valid credentials", async () => {
    const hash = await bcrypt.hash("correct-password", 1);
    (db.limit as jest.Mock).mockResolvedValueOnce([
      {
        id: "user-1",
        email: "a@b.com",
        password_hash: hash,
        venue_id: "v-1",
        role: "admin",
      },
    ]);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@b.com", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("a@b.com");

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.startsWith("token="))).toBe(true);
    expect(cookies.some((c: string) => c.includes("HttpOnly"))).toBe(true);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears the token cookie", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Logged out successfully");

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies).toBeDefined();
    // Cookie should be cleared (Expires in the past or Max-Age=0)
    expect(
      cookies.some(
        (c: string) =>
          c.startsWith("token=") &&
          (c.includes("Expires=Thu, 01 Jan 1970") || c.includes("Max-Age=0"))
      )
    ).toBe(true);
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 when no token is provided", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 200 with user payload when a valid token is provided", async () => {
    const app = buildApp();
    const token = jwt.sign(
      { id: "user-1", email: "a@b.com", venue_id: "v-1", role: "admin" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("a@b.com");
  });

  it("returns 401 when token is expired", async () => {
    const app = buildApp();
    const token = jwt.sign(
      { id: "user-1", email: "a@b.com", venue_id: "v-1", role: "admin" },
      JWT_SECRET,
      { expiresIn: "-1s" } // already expired
    );

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `token=${token}`);

    expect(res.status).toBe(401);
  });
});
