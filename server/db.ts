import dotenv from "dotenv";
dotenv.config();

// Lazily initialise the real DB connection so that importing this module in a
// Jest test environment (where DATABASE_URL is not set) does NOT throw at
// module-load time.  The actual connection is only established the first time
// `db` is used, which never happens in unit tests because the module is
// replaced by server/__mocks__/db.ts via Jest moduleNameMapper.

let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const { drizzle } = require("drizzle-orm/postgres-js");
  const postgres = require("postgres");
  const schema = require("./schema");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

// Export a Proxy so that existing code using `db.select()...` continues to
// work without any changes — the real connection is only created on first
// property access.
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof createDb>];
  },
});
