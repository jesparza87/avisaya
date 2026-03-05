import webpush from "web-push";

/**
 * Initialise VAPID credentials from environment variables.
 * Throws if the required env vars are missing so the caller can decide
 * whether to abort (production) or warn (development).
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
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Send a push notification to a single subscription.
 * Returns true on success, false if the subscription is gone (410/404).
 * Re-throws on unexpected errors.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<boolean> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
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
