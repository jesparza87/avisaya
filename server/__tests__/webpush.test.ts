/**
 * Tests for server/lib/webpush.ts
 *
 * Covers:
 *  - initVapid throws when env vars are missing
 *  - initVapid calls setVapidDetails with correct args when env vars are present
 *  - sendPushNotification calls webpush.sendNotification with JSON payload
 */

process.env.NODE_ENV = "test";

const mockSetVapidDetails = jest.fn();
const mockSendNotification = jest.fn().mockResolvedValue({ statusCode: 201 });

jest.mock("web-push", () => ({
  setVapidDetails: mockSetVapidDetails,
  sendNotification: mockSendNotification,
}));

import { initVapid, sendPushNotification } from "../lib/webpush";

describe("initVapid", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    mockSetVapidDetails.mockClear();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("throws when all VAPID env vars are missing", () => {
    delete process.env.VAPID_SUBJECT;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(() => initVapid()).toThrow(
      "VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must all be set"
    );
  });

  it("throws when only VAPID_SUBJECT is set", () => {
    process.env.VAPID_SUBJECT = "mailto:test@test.com";
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(() => initVapid()).toThrow();
  });

  it("calls setVapidDetails with correct arguments when all vars are present", () => {
    process.env.VAPID_SUBJECT = "mailto:test@test.com";
    process.env.VAPID_PUBLIC_KEY = "pub-key";
    process.env.VAPID_PRIVATE_KEY = "priv-key";
    initVapid();
    expect(mockSetVapidDetails).toHaveBeenCalledTimes(1);
    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      "mailto:test@test.com",
      "pub-key",
      "priv-key"
    );
  });
});

describe("sendPushNotification", () => {
  beforeEach(() => mockSendNotification.mockClear());

  it("calls webpush.sendNotification with JSON-stringified payload", async () => {
    const sub = {
      endpoint: "https://push.example.com/sub/1",
      keys: { p256dh: "p256dh-val", auth: "auth-val" },
    };
    const payload = { title: "Ready!", body: "Your order is ready" };
    await sendPushNotification(sub, payload);
    expect(mockSendNotification).toHaveBeenCalledWith(sub, JSON.stringify(payload));
  });

  it("propagates errors thrown by webpush.sendNotification", async () => {
    mockSendNotification.mockRejectedValueOnce(new Error("Push failed"));
    const sub = {
      endpoint: "https://push.example.com/sub/1",
      keys: { p256dh: "p256dh-val", auth: "auth-val" },
    };
    await expect(sendPushNotification(sub, { title: "x" })).rejects.toThrow("Push failed");
  });
});
