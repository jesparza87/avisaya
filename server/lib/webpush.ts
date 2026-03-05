import webpush from "web-push";

/**
 * Initialises the VAPID details required by web-push.
 * Throws if the required environment variables are not set so the caller can
 * decide whether to abort (production) or skip (test).
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
 * Sends a push notification to a single subscription.
 */
export async function sendPushNotification(
  subscription: webpush.PushSubscription,
  payload: object
): Promise<void> {
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
