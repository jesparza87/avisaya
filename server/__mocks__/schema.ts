/**
 * Mock schema — mirrors the column names from server/schema.ts so tests
 * can reference them without a real database connection.
 */

export const push_subscriptions = {
  id: "id",
  order_id: "order_id",
  endpoint: "endpoint",
  p256dh: "p256dh",
  auth_key: "auth_key",
  created_at: "created_at",
};

export const venues = {
  id: "id",
  name: "name",
  slug: "slug",
  plan: "plan",
  owner_id: "owner_id",
  created_at: "created_at",
};

export const users = {
  id: "id",
  email: "email",
  password_hash: "password_hash",
  venue_id: "venue_id",
  role: "role",
  created_at: "created_at",
};

export const orders = {
  id: "id",
  venue_id: "venue_id",
  token: "token",
  label: "label",
  status: "status",
  created_at: "created_at",
  notified_at: "notified_at",
};
