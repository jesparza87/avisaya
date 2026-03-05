// Manual mock for server/lib/webpush — used by Jest via moduleNameMapper.
// Provides no-op implementations of all exported functions so that route
// tests can import without triggering real VAPID / web-push logic.

export const initVapid = jest.fn().mockImplementation(() => {
  // no-op: VAPID is not configured in the test environment
});

export const sendPushNotification = jest.fn().mockResolvedValue(undefined);
