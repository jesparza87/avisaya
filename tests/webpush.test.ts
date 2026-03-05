import { initVapid, sendPushNotification, PushPayload, PushSubscriptionKeys } from "../server/lib/webpush";

// Mock the web-push module
jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import webpush from "web-push";

const mockSetVapidDetails = webpush.setVapidDetails as jest.Mock;
const mockSendNotification = webpush.sendNotification as jest.Mock;

const VALID_SUBSCRIPTION: PushSubscriptionKeys = {
  endpoint: "https://push.example.com/sub/abc123",
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTiHTjdy0",
  auth: "tBHItJI5svbpez7KI4CCXg",
};

const VALID_PAYLOAD: PushPayload = {
  title: "¡Tu pedido está listo!",
  body: "Pasa a recogerlo",
  url: "/order/abc123",
};

describe("server/lib/webpush — initVapid", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    mockSetVapidDetails.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("throws when VAPID_PUBLIC_KEY is missing", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(() => initVapid()).toThrow(/VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY/i);
  });

  it("throws when VAPID_PRIVATE_KEY is missing", () => {
    process.env.VAPID_PUBLIC_KEY = "BPublicKey";
    delete process.env.VAPID_PRIVATE_KEY;
    expect(() => initVapid()).toThrow(/VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY/i);
  });

  it("calls webpush.setVapidDetails with correct args when both keys are present", () => {
    process.env.VAPID_PUBLIC_KEY = "BPublicKey";
    process.env.VAPID_PRIVATE_KEY = "PrivateKey";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";

    initVapid();

    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "BPublicKey",
      "PrivateKey"
    );
  });

  it("uses default subject when VAPID_SUBJECT is not set", () => {
    process.env.VAPID_PUBLIC_KEY = "BPublicKey";
    process.env.VAPID_PRIVATE_KEY = "PrivateKey";
    delete process.env.VAPID_SUBJECT;

    initVapid();

    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      "mailto:admin@avisaya.app",
      "BPublicKey",
      "PrivateKey"
    );
  });
});

describe("server/lib/webpush — sendPushNotification", () => {
  beforeEach(() => {
    mockSendNotification.mockClear();
    // Ensure VAPID is initialised for send tests
    process.env.VAPID_PUBLIC_KEY = "BPublicKey";
    process.env.VAPID_PRIVATE_KEY = "PrivateKey";
    initVapid();
  });

  it("calls webpush.sendNotification with correct subscription and payload", async () => {
    mockSendNotification.mockResolvedValueOnce({ statusCode: 201 });

    const result = await sendPushNotification(VALID_SUBSCRIPTION, VALID_PAYLOAD);

    expect(result).toBe(true);
    expect(mockSendNotification).toHaveBeenCalledWith(
      {
        endpoint: VALID_SUBSCRIPTION.endpoint,
        keys: {
          p256dh: VALID_SUBSCRIPTION.p256dh,
          auth: VALID_SUBSCRIPTION.auth,
        },
      },
      JSON.stringify(VALID_PAYLOAD)
    );
  });

  it("returns false when subscription is expired (410)", async () => {
    const err = Object.assign(new Error("Gone"), { statusCode: 410 });
    mockSendNotification.mockRejectedValueOnce(err);

    const result = await sendPushNotification(VALID_SUBSCRIPTION, VALID_PAYLOAD);
    expect(result).toBe(false);
  });

  it("returns false when subscription is not found (404)", async () => {
    const err = Object.assign(new Error("Not Found"), { statusCode: 404 });
    mockSendNotification.mockRejectedValueOnce(err);

    const result = await sendPushNotification(VALID_SUBSCRIPTION, VALID_PAYLOAD);
    expect(result).toBe(false);
  });

  it("re-throws on unexpected errors", async () => {
    const err = Object.assign(new Error("Server Error"), { statusCode: 500 });
    mockSendNotification.mockRejectedValueOnce(err);

    await expect(sendPushNotification(VALID_SUBSCRIPTION, VALID_PAYLOAD)).rejects.toThrow(
      "Server Error"
    );
  });
});
