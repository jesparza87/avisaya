// Manual mock for server/db — used by Jest via moduleNameMapper.
// Simulates Drizzle ORM's fluent query-builder chain more accurately.
// Each "terminal" method (limit, returning) returns a jest.fn() that resolves
// to an empty array by default; tests can override per-call with mockResolvedValueOnce.

type MockFn = jest.Mock;

interface ChainableMock {
  select: MockFn;
  from: MockFn;
  where: MockFn;
  limit: MockFn;
  insert: MockFn;
  values: MockFn;
  returning: MockFn;
  update: MockFn;
  set: MockFn;
  delete: MockFn;
  // Allow index access for the Proxy in db.ts
  [key: string]: MockFn;
}

// Terminal methods resolve to a value; all others return `this` for chaining.
const TERMINAL_METHODS = new Set(["limit", "returning"]);

function makeChain(): ChainableMock {
  const chain: ChainableMock = {
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn().mockResolvedValue([]),
    insert: jest.fn(),
    values: jest.fn(),
    returning: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
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
