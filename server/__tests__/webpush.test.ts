// Unit tests for server/lib/webpush.
//
// This file imports the REAL webpush module (not the mock) by using a path
// that does NOT match the moduleNameMapper pattern for lib/webpush.
// Instead we mock the underlying 'web-push' npm package directly so that
// initVapid and sendPushNotification code paths are fully exercised.

jest.mock("web-push");

// Import after jest.mock so the module receives the mocked web-push
import webpush from "web-push";
import { initVapid, sendPushNotification } from "../lib/webpush";

const mockedWebpush = webpush as jest.Mocked<typeof webpush>;

describe("initVapid", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockedWebpush.setVapidDetails = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when VAPID_SUBJECT is missing", () => {
    delete process.env.VAPID_SUBJECT;
    expect(() => initVapid()).toThrow(/VAPID_SUBJECT/);
  });

  it("throws when VAPID_PUBLIC_KEY is missing", () => {
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    delete process.env.VAPID_PUBLIC_KEY;
    expect(() => initVapid()).toThrow(/VAPID_PUBLIC_KEY/);
  });

  it("throws when VAPID_PRIVATE_KEY is missing", () => {
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    process.env.VAPID_PUBLIC_KEY = "pub-key";
    delete process.env.VAPID_PRIVATE_KEY;
    expect(() => initVapid()).toThrow(/VAPID_PRIVATE_KEY/);
  });

  it("calls webpush.setVapidDetails with the correct arguments when all vars are set", () => {
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    process.env.VAPID_PUBLIC_KEY = "pub-key";
    process.env.VAPID_PRIVATE_KEY = "priv-key";

    initVapid();

    expect(mockedWebpush.setVapidDetails).toHaveBeenCalledTimes(1);
    expect(mockedWebpush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "pub-key",
      "priv-key"
    );
  });
});

describe("sendPushNotification", () => {
  beforeEach(() => {
    mockedWebpush.sendNotification = jest.fn().mockResolvedValue({} as never);
  });

  const subscription: webpush.PushSubscription = {
    endpoint: "https://push.example.com/sub/abc",
    keys: { p256dh: "p256dh-key", auth: "auth-key" },
  };

  it("calls webpush.sendNotification with the subscription and JSON-serialised payload", async () => {
    const payload = { title: "Your order is ready!", orderId: "order-1" };

    await sendPushNotification(subscription, payload);

    expect(mockedWebpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(mockedWebpush.sendNotification).toHaveBeenCalledWith(
      subscription,
      JSON.stringify(payload)
    );
  });

  it("propagates errors thrown by webpush.sendNotification", async () => {
    mockedWebpush.sendNotification = jest
      .fn()
      .mockRejectedValue(new Error("Push delivery failed"));

    await expect(
      sendPushNotification(subscription, { title: "Test" })
    ).rejects.toThrow("Push delivery failed");
  });

  it("serialises nested payload objects correctly", async () => {
    const payload = { event: "order:ready", data: { orderId: "o-42", table: 7 } };

    await sendPushNotification(subscription, payload);

    expect(mockedWebpush.sendNotification).toHaveBeenCalledWith(
      subscription,
      '{"event":"order:ready","data":{"orderId":"o-42","table":7}}'
    );
  });
});
