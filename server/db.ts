import dotenv from "dotenv";
dotenv.config();

// Lazily initialise the real DB connection so that importing this module in a
// Jest test environment (where DATABASE_URL is not set) does NOT throw at
// module-load time. The actual connection is only established the first time
// `db` is used, which never happens in unit tests because the module is
// replaced by server/__mocks__/db.ts via Jest moduleNameMapper.

type DrizzleDb = ReturnType<typeof createDb>;

let _db: DrizzleDb | null = null;

function createDb(): DrizzleDb {
  // Use require() only inside this function to keep the lazy-init pattern
  // while avoiding top-level require() mixed with ES imports elsewhere.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const postgres = require("postgres") as typeof import("postgres");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const schema = require("./schema") as typeof import("./schema");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

function getDb(): DrizzleDb {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// Export a Proxy so that existing code using `db.select()...` continues to
// work without any changes — the real connection is only created on first
// property access.
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    return getDb()[prop as keyof DrizzleDb];
  },
});
