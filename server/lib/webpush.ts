import webpush from "web-push";

/**
 * Initialise VAPID details from environment variables.
 *
 * Throws if any required variable is missing so the server fails fast at
 * startup rather than silently sending unsigned push messages.
 *
 * In the test environment this module is replaced by
 * server/__mocks__/webpush.ts via Jest moduleNameMapper, so this function
 * is never called with real env vars during route tests.
 * The dedicated webpush unit test mocks 'web-push' directly and calls this
 * function to verify its behaviour.
 */
export function initVapid(): void {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    throw new Error(
      "VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must all be set"
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

/**
 * Send a push notification to a single subscription.
 *
 * @param subscription  PushSubscription object (endpoint + keys)
 * @param payload       JSON-serialisable payload
 */
export async function sendPushNotification(
  subscription: webpush.PushSubscription,
  payload: Record<string, unknown>
): Promise<void> {
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
