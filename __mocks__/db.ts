// Root-level manual mock for db — re-exports everything from server/__mocks__/db.ts
// so that any Jest moduleNameMapper entry pointing at either location gets the
// same consistent mock implementation with a single source of truth.
export {
  db,
  resetDbMocks,
  mockLimitResult,
  mockReturningResult,
  mockExecuteResult,
} from "../server/__mocks__/db";
