import admin from "../config/firebaseAdmin";

export interface SendPushNotificationOptions {
    tokens: string | string[];
    title: string;
    body: string;
    data?: Record<string, string | number | boolean>;
}

export interface SendPushNotificationResponse {
    successCount: number;
    failureCount: number;
    responses: admin.messaging.SendResponse[];
}

export const sendPushNotification = async ({
    tokens,
    title,
    body,
    data = {},
}: SendPushNotificationOptions): Promise<SendPushNotificationResponse> => {
    try {
        if (!tokens) {
            throw new Error("FCM token is required");
        }

        const tokenArray = Array.isArray(tokens) ? tokens : [tokens];

        const message: admin.messaging.MulticastMessage = {
            tokens: tokenArray,
            notification: {
                title,
                body,
            },
            data: Object.fromEntries(
                Object.entries(data).map(([key, value]) => [
                    key,
                    String(value), // FCM requires string values
                ])
            ),
        };

        const response = await admin
            .messaging()
            .sendEachForMulticast(message);

        console.log("Push Notification Response:", response);

        return {
            successCount: response.successCount,
            failureCount: response.failureCount,
            responses: response.responses,
        };
    } catch (error) {
        console.error("Error sending push notification:", error);
        throw error;
    }
};


/**
 * 
 * 
 await sendPushNotification({
  tokens: user.fcmToken,
  title: "Shaadi Reminder 🎉",
  body: "Kal Mehendi ceremony hai!",
  data: {
    eventId: "12345",
    type: "EVENT_REMINDER",
    weddingId: "98765",
    isImportant: true,
  },
});
 * 
 * 
 * 
 */
