import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  plan: text("plan").default("free").notNull(),
  owner_id: uuid("owner_id"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  password_hash: text("password_hash").notNull(),
  venue_id: uuid("venue_id").references(() => venues.id),
  role: text("role").default("admin").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  venue_id: uuid("venue_id").references(() => venues.id).notNull(),
  token: uuid("token").unique().defaultRandom().notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  status: text("status").default("waiting").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  notified_at: timestamp("notified_at"),
});

export const push_subscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  order_id: uuid("order_id").references(() => orders.id).notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth_key: text("auth_key").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});
