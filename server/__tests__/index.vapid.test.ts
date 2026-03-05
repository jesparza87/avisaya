/**
 * Verifies that importing the app in NODE_ENV=test does NOT call process.exit(1)
 * even when VAPID env vars are absent.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";

delete process.env.VAPID_SUBJECT;
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

jest.mock("web-push", () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn() }));
jest.mock("../lib/socket", () => ({ setIo: jest.fn(), getIo: jest.fn() }));
jest.mock("../db", () => require("../__mocks__/db"));
jest.mock("../schema", () => require("../__mocks__/schema"));

// Stub route modules to avoid their transitive imports
jest.mock("../routes/orders", () => {
  const { Router } = require("express");
  return { default: Router() };
});
jest.mock("../routes/push", () => {
  const { Router } = require("express");
  return { default: Router() };
});
jest.mock("../routes/auth", () => {
  const { Router } = require("express");
  return { default: Router() };
});

const exitSpy = jest
  .spyOn(process, "exit")
  .mockImplementation((() => {}) as () => never);

describe("server/index.ts — VAPID guard in test environment", () => {
  it("does not call process.exit when VAPID vars are missing in NODE_ENV=test", async () => {
    await expect(import("../index")).resolves.toBeDefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
