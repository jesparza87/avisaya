import webpush from "web-push";

let initialized = false;

/**
 * Initialise VAPID credentials from environment variables.
 * Must be called once at server startup before any push notifications are sent.
 * Throws if the required env vars are missing.
 */
export function initVapid(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@avisaya.app";

  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables are required"
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send a push notification to a single subscription.
 * Returns true on success, false if the subscription is expired/invalid (410/404).
 * Re-throws on unexpected errors.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionKeys,
  payload: PushPayload
): Promise<boolean> {
  if (!initialized) {
    throw new Error("VAPID not initialised — call initVapid() first");
  }

  const pushSubscription: webpush.PushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      // Subscription is no longer valid
      return false;
    }
    throw err;
  }
}
