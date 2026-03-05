// Tests for server/lib/webpush — imports the real module, not the mock

describe("server/lib/webpush", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("initVapid", () => {
    it("throws when both VAPID keys are missing", async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;

      const { initVapid } = await import("../lib/webpush");
      expect(() => initVapid()).toThrow(/VAPID_PUBLIC_KEY/i);
    });

    it("throws when VAPID_PRIVATE_KEY is missing", async () => {
      process.env.VAPID_PUBLIC_KEY = "some-public-key";
      delete process.env.VAPID_PRIVATE_KEY;

      const { initVapid } = await import("../lib/webpush");
      expect(() => initVapid()).toThrow(/VAPID/i);
    });

    it("throws when VAPID_PUBLIC_KEY is missing", async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      process.env.VAPID_PRIVATE_KEY = "some-private-key";

      const { initVapid } = await import("../lib/webpush");
      expect(() => initVapid()).toThrow(/VAPID/i);
    });

    it("does not throw when both VAPID keys are present and valid", async () => {
      // Real VAPID-format keys (base64url encoded, correct length)
      process.env.VAPID_PUBLIC_KEY =
        "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
      process.env.VAPID_PRIVATE_KEY = "UUxI4O8-FbRouAevSmBQ6co_2zwqtxbs-jCsF3Ibjfk";
      process.env.VAPID_SUBJECT = "mailto:test@example.com";

      const { initVapid } = await import("../lib/webpush");
      expect(() => initVapid()).not.toThrow();
    });
  });

  describe("sendPushNotification", () => {
    it("returns false when subscription is expired (410)", async () => {
      const webpushModule = await import("web-push");
      jest.spyOn(webpushModule, "sendNotification").mockRejectedValueOnce(
        Object.assign(new Error("Gone"), { statusCode: 410 })
      );

      const { sendPushNotification } = await import("../lib/webpush");
      const result = await sendPushNotification(
        { endpoint: "https://push.example.com/sub/1", keys: { p256dh: "key", auth: "auth" } },
        { title: "Ready", body: "Pick up your order" }
      );

      expect(result).toBe(false);
    });

    it("returns false when subscription is not found (404)", async () => {
      const webpushModule = await import("web-push");
      jest.spyOn(webpushModule, "sendNotification").mockRejectedValueOnce(
        Object.assign(new Error("Not Found"), { statusCode: 404 })
      );

      const { sendPushNotification } = await import("../lib/webpush");
      const result = await sendPushNotification(
        { endpoint: "https://push.example.com/sub/1", keys: { p256dh: "key", auth: "auth" } },
        { title: "Ready", body: "Pick up your order" }
      );

      expect(result).toBe(false);
    });

    it("re-throws on unexpected server errors", async () => {
      const webpushModule = await import("web-push");
      jest.spyOn(webpushModule, "sendNotification").mockRejectedValueOnce(
        Object.assign(new Error("Internal Server Error"), { statusCode: 500 })
      );

      const { sendPushNotification } = await import("../lib/webpush");
      await expect(
        sendPushNotification(
          { endpoint: "https://push.example.com/sub/1", keys: { p256dh: "key", auth: "auth" } },
          { title: "Ready", body: "Pick up your order" }
        )
      ).rejects.toThrow("Internal Server Error");
    });

    it("returns true on successful send", async () => {
      const webpushModule = await import("web-push");
      jest.spyOn(webpushModule, "sendNotification").mockResolvedValueOnce({
        statusCode: 201,
        body: "",
        headers: {},
      });

      const { sendPushNotification } = await import("../lib/webpush");
      const result = await sendPushNotification(
        { endpoint: "https://push.example.com/sub/1", keys: { p256dh: "key", auth: "auth" } },
        { title: "Ready", body: "Pick up your order", url: "/order/123" }
      );

      expect(result).toBe(true);
    });
  });
});
