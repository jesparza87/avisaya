import dotenv from "dotenv";
dotenv.config();

// Lazily initialise the real DB connection so that importing this module in a
// Jest test environment (where DATABASE_URL is not set) does NOT throw at
// module-load time. The actual connection is only established the first time
// `db` is used, which never happens in unit tests because the module is
// replaced by server/__mocks__/db.ts via Jest moduleNameMapper.
//
// Type-only imports are erased at compile time and do not cause the real
// modules to be loaded eagerly.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schemaTypes from "./schema";

type DrizzleDb = PostgresJsDatabase<typeof schemaTypes>;

let _db: DrizzleDb | null = null;

// createDb uses standard synchronous imports deferred inside a function body.
// This avoids top-level side-effectful imports that would attempt a DB
// connection at module load time, while keeping the code clean and avoiding
// the need for eslint-disable comments on require() calls.
function createDb(): DrizzleDb {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  // These imports are intentionally deferred to this function so that the
  // module can be loaded without a DATABASE_URL present (e.g. in tests).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const postgres = require("postgres") as typeof import("postgres");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schema = require("./schema") as typeof import("./schema");

  const client = postgres(connectionString);
  return drizzle(client, { schema }) as DrizzleDb;
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
//
// The Proxy traps:
//   - get:  forwards property access to the real db instance (lazy init).
//   - has:  supports `'select' in db` style checks correctly.
//   - apply: guards against accidental direct invocation of `db()`.
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop: string | symbol) {
    return getDb()[prop as keyof DrizzleDb];
  },
  has(_target, prop: string | symbol) {
    return prop in getDb();
  },
  apply(_target, _thisArg, _args) {
    throw new TypeError(
      "db is not a function — use db.select(), db.insert(), etc."
    );
  },
});
