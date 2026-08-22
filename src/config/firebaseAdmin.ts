import admin from "firebase-admin";
import logger from "../utils/logger";

// Push notifications are optional in dev/CI - don't crash the whole server
// on boot just because FIREBASE_* env vars aren't set yet. Everything that
// calls admin.messaging() must check isFirebaseConfigured first (see
// helpers/sendPushNotification.ts).
export const isFirebaseConfigured = !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_CLIENT_EMAIL
);

if (!admin.apps.length) {
    if (isFirebaseConfigured) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            }),
        });
    } else {
        logger.warn(
            "[firebaseAdmin] FIREBASE_PROJECT_ID/FIREBASE_PRIVATE_KEY/FIREBASE_CLIENT_EMAIL not set - push notifications are disabled until configured."
        );
    }
}

export default admin;
