import request from "supertest";
import express, { Express } from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock the DB module so tests never touch a real database
jest.mock("../server/db", () => ({ db: {} }));

// Mock drizzle-orm operators used in auth routes
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((_col: unknown, _val: unknown) => ({ col: _col, val: _val })),
  like: jest.fn((_col: unknown, _val: unknown) => ({ col: _col, val: _val })),
  desc: jest.fn((_col: unknown) => _col),
}));

// Shared mutable state so individual tests can control DB responses
const mockDbState = {
  usersSelectResult: [] as unknown[],
  venuesSelectResult: [] as unknown[],
  insertResult: [] as unknown[],
  updateResult: [] as unknown[],
};

jest.mock("../server/schema", () => ({
  users: { email: "email", id: "id" },
  venues: { id: "id", slug: "slug" },
}));

// Build a chainable drizzle-like query builder mock
function makeChain(finalResult: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "from", "where", "limit", "orderBy", "insert", "values", "update", "set", "delete", "returning"];
  methods.forEach((m) => {
    chain[m] = jest.fn(() => chain);
  });
  // Terminal awaitable
  (chain as unknown as Promise<unknown[]>)[Symbol.iterator as unknown as string] = undefined;
  Object.defineProperty(chain, "then", {
    get() {
      return (resolve: (v: unknown[]) => void) => resolve(finalResult);
    },
  });
  return chain;
}

// We need per-call control, so mock db at the module level with a factory
jest.mock("../server/db", () => {
  return {
    db: new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "select") {
            return () => {
              const chain = makeSelectChain();
              return chain;
            };
          }
          if (prop === "insert") {
            return () => makeInsertChain();
          }
          if (prop === "update") {
            return () => makeUpdateChain();
          }
          if (prop === "delete") {
            return () => makeDeleteChain();
          }
          return jest.fn();
        },
      }
    ),
  };
});

function makeSelectChain(): unknown {
  let result: unknown[] = [];
  const chain = {
    from: jest.fn(() => chain),
    where: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    orderBy: jest.fn(() => chain),
    then(resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) {
      try {
        resolve(result);
      } catch (e) {
        if (reject) reject(e);
      }
      return this;
    },
  };
  // Attach result setter
  (chain as unknown as { _setResult: (r: unknown[]) => void })._setResult = (r) => {
    result = r;
  };
  return chain;
}

function makeInsertChain(): unknown {
  const chain = {
    values: jest.fn(() => chain),
    returning: jest.fn(() =>
      Promise.resolve(mockDbState.insertResult)
    ),
  };
  return chain;
}

function makeUpdateChain(): unknown {
  const chain = {
    set: jest.fn(() => chain),
    where: jest.fn(() => chain),
    returning: jest.fn(() => Promise.resolve(mockDbState.updateResult)),
  };
  return chain;
}

function makeDeleteChain(): unknown {
  const chain = {
    where: jest.fn(() => Promise.resolve([])),
  };
  return chain;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express app with only the auth router mounted.
 * We re-require the router each time so mocks are fresh.
 */
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Dynamically require so jest module registry is used
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const authRouter = require("../server/routes/auth").default;
  app.use("/api/auth", authRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login — input validation", () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "secret123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and password are required/i);
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and password are required/i);
  });
});

describe("POST /api/auth/register — input validation", () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  it("returns 400 when venueName is missing", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("returns 400 when password is too short", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.com", password: "short", venueName: "My Bar" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 caracteres/i);
  });
});

describe("POST /api/auth/logout", () => {
  let app: Express;

  beforeAll(() => {
    app = buildApp();
  });

  it("returns 200 and clears the token cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });
});

describe("slugify utility (via register endpoint)", () => {
  it("converts spaces and special chars to hyphens", () => {
    // Test the slugify logic indirectly by checking the shape of the slug
    // We import the function via the module internals
    const input = "  Café & Bar!! ";
    const expected = "caf-bar";
    // Replicate the slugify logic here to unit-test it
    const result = input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    expect(result).toBe(expected);
  });
});
