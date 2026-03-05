// Manual mock for server/db — used by Jest via moduleNameMapper.
// Simulates Drizzle ORM's fluent query-builder chain accurately.
// Each "terminal" method resolves to a value; all others return `this` for chaining.
// Tests can override per-call with mockResolvedValueOnce / mockReturnValueOnce.

type MockFn = jest.Mock;

interface ChainableMock {
  // Query builder entry points
  select: MockFn;
  insert: MockFn;
  update: MockFn;
  delete: MockFn;
  // Chaining methods
  from: MockFn;
  where: MockFn;
  set: MockFn;
  values: MockFn;
  orderBy: MockFn;
  groupBy: MockFn;
  leftJoin: MockFn;
  innerJoin: MockFn;
  offset: MockFn;
  // Terminal methods (resolve to a value)
  limit: MockFn;
  returning: MockFn;
  execute: MockFn;
  // Allow index access
  [key: string]: MockFn;
}

// Terminal methods resolve to a value; all others return `this` for chaining.
const TERMINAL_METHODS = new Set(["limit", "returning", "execute"]);

function makeChain(): ChainableMock {
  const chain: ChainableMock = {
    // Entry points
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    // Chaining methods
    from: jest.fn(),
    where: jest.fn(),
    set: jest.fn(),
    values: jest.fn(),
    orderBy: jest.fn(),
    groupBy: jest.fn(),
    leftJoin: jest.fn(),
    innerJoin: jest.fn(),
    offset: jest.fn(),
    // Terminal methods
    limit: jest.fn().mockResolvedValue([]),
    returning: jest.fn().mockResolvedValue([]),
    execute: jest.fn().mockResolvedValue([]),
  };

  // Wire up non-terminal methods to return the chain itself so that
  // db.select().from().where().limit() works as expected.
  for (const key of Object.keys(chain)) {
    if (!TERMINAL_METHODS.has(key)) {
      (chain[key] as MockFn).mockReturnValue(chain);
    }
  }

  return chain;
}

const mockDb = makeChain();

export const db = mockDb;

/**
 * Reset all mock functions to their default chaining / resolving behaviour.
 * Call this in beforeEach to prevent state leaking between tests.
 */
export function resetDbMocks(): void {
  for (const key of Object.keys(mockDb)) {
    const fn = mockDb[key] as MockFn;
    fn.mockReset();
    if (TERMINAL_METHODS.has(key)) {
      fn.mockResolvedValue([]);
    } else {
      fn.mockReturnValue(mockDb);
    }
  }
}

/**
 * Helper: make the next call to `db.limit()` resolve to the given rows.
 */
export function mockLimitResult(rows: unknown[]): void {
  (mockDb.limit as MockFn).mockResolvedValueOnce(rows);
}

/**
 * Helper: make the next call to `db.returning()` resolve to the given rows.
 */
export function mockReturningResult(rows: unknown[]): void {
  (mockDb.returning as MockFn).mockResolvedValueOnce(rows);
}

/**
 * Helper: make the next call to `db.execute()` resolve to the given rows.
 */
export function mockExecuteResult(rows: unknown[]): void {
  (mockDb.execute as MockFn).mockResolvedValueOnce(rows);
}
