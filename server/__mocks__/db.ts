/**
 * In-memory mock for the db module.
 * Each method returns a chainable object that resolves to [] by default.
 * Individual tests override return values via mockReturnValueOnce.
 */

// Re-export schema symbols so moduleNameMapper for "../db" also satisfies
// any test that destructures schema tables from the db mock path.
export * from "./schema";

function makeChain(resolveValue: unknown = []) {
  const chain: Record<string, jest.Mock> = {};
  const methods = [
    "select",
    "from",
    "where",
    "limit",
    "insert",
    "values",
    "update",
    "set",
    "delete",
    "returning",
  ];
  for (const m of methods) {
    chain[m] = jest.fn(() => chain);
  }
  // Make the chain thenable so `await db.select()...` works
  (chain as unknown as { then: unknown }).then = (
    resolve: (v: unknown) => unknown
  ) => Promise.resolve(resolveValue).then(resolve);
  return chain;
}

export const db = {
  select: jest.fn(() => makeChain([])),
  insert: jest.fn(() => makeChain([])),
  update: jest.fn(() => makeChain([])),
  delete: jest.fn(() => makeChain([])),
};
