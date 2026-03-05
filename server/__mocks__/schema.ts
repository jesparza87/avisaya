// Minimal schema mock — exports the table symbols used by route handlers.
// Actual column definitions are not needed for unit tests because the db
// is also mocked and never executes real SQL.

export const push_subscriptions = "push_subscriptions" as unknown as Record<string, unknown>;
export const users = "users" as unknown as Record<string, unknown>;
export const venues = "venues" as unknown as Record<string, unknown>;
export const orders = "orders" as unknown as Record<string, unknown>;
