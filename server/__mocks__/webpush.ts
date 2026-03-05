// Mock for server/lib/webpush — prevents real VAPID / web-push calls in route tests.
// The webpush unit test (server/__tests__/webpush.test.ts) bypasses this mock by
// importing the real module and mocking the underlying 'web-push' package directly.

export const initVapid = jest.fn();

export const sendPushNotification = jest.fn().mockResolvedValue(undefined);
