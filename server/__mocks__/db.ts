// Manual mock for server/db — used by Jest via moduleNameMapper.
// All methods return jest.fn() so tests can override return values per-test.

const mockDb = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  returning: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
};

export const db = mockDb;

/**
 * Reset all mock functions to their default chaining behaviour.
 * Call this in beforeEach to prevent state leaking between tests.
 */
export function resetDbMocks(): void {
  (mockDb.select as jest.Mock).mockReset().mockReturnThis();
  (mockDb.from as jest.Mock).mockReset().mockReturnThis();
  (mockDb.where as jest.Mock).mockReset().mockReturnThis();
  (mockDb.limit as jest.Mock).mockReset().mockResolvedValue([]);
  (mockDb.insert as jest.Mock).mockReset().mockReturnThis();
  (mockDb.values as jest.Mock).mockReset().mockReturnThis();
  (mockDb.returning as jest.Mock).mockReset().mockResolvedValue([]);
  (mockDb.update as jest.Mock).mockReset().mockReturnThis();
  (mockDb.set as jest.Mock).mockReset().mockReturnThis();
  (mockDb.delete as jest.Mock).mockReset().mockReturnThis();
}
