import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";

export const COLLECTIONS = {
  USERS: "users",
  SECRETARIAS: "secretarias",
  EVENTOS: "eventos",
  MIDIAS: "midias",
  EVENTO_LOGS: "evento_logs",
  LOGIN_SLIDES: "login_slides",
  APP_SETTINGS: "app_settings",
} as const;

const globalForFirebase = globalThis as unknown as {
  __belmonteFirestoreDb?: Firestore;
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

function getFirebaseApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawPrivateKey) {
    throw new Error(
      "Credenciais do Firebase Admin ausentes. Configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no .env."
    );
  }

  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function getDb(): Firestore {
  if (globalForFirebase.__belmonteFirestoreDb) {
    return globalForFirebase.__belmonteFirestoreDb;
  }

  const app = getFirebaseApp();
  const db = admin.firestore(app);

  // Protege contra múltiplas chamadas de settings() entre chunks de API Routes e Server Components
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Já inicializado anteriormente neste processo
  }

  globalForFirebase.__belmonteFirestoreDb = db;
  return db;
}
