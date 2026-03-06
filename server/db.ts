import dotenv from "dotenv";
dotenv.config();

// Lazily initialise the real DB connection so that importing this module in a
// Jest test environment (where DATABASE_URL is not set) does NOT throw at
// module-load time. The actual connection is only established the first time
// `db` is used, which never happens in unit tests because the module is
// replaced by server/__mocks__/db.ts via Jest moduleNameMapper.
//
// Type-only imports are erased at compile time and do not cause the real
// modules to be loaded eagerly. The require() calls inside createDb() are
// intentional: they keep the lazy-init pattern while avoiding top-level
// side-effectful imports that would attempt a DB connection at module load.

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schemaTypes from "./schema";

type DrizzleDb = PostgresJsDatabase<typeof schemaTypes>;

let _db: DrizzleDb | null = null;

function createDb(): DrizzleDb {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  // require() is used here deliberately to defer module loading until the
  // first actual DB access. eslint-disable comments are intentional.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const postgres = require("postgres") as typeof import("postgres");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    return getDb()[prop as keyof DrizzleDb];
  },
});
