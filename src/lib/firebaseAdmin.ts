import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const formatPrivateKey = (key: string | undefined): string | undefined => {
  if (!key) return undefined;
  return key.replace(/\\n/g, '\n');
};

export function initFirebaseAdmin(): App {
  const apps = getApps();
  const defaultApp = apps.find((app) => app.name === '[DEFAULT]');

  if (defaultApp) {
    return defaultApp;
  }

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ||
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  if (!databaseURL) {
    throw new Error('FIREBASE_DATABASE_URL environment variable is missing.');
  }

  try {
    const serviceAccountVar = process.env.SERVICE_ACCOUNT_JSON;

    if (serviceAccountVar) {
      const serviceAccount = JSON.parse(serviceAccountVar);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = formatPrivateKey(
          serviceAccount.private_key,
        );
      }

      return initializeApp({
        credential: cert(serviceAccount),
        databaseURL,
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      const keyPath = path.resolve(process.cwd(), 'serviceAccountKeyDev.json');

      if (fs.existsSync(keyPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        if (serviceAccount.private_key) {
          serviceAccount.private_key = formatPrivateKey(
            serviceAccount.private_key,
          );
        }
        return initializeApp({
          credential: cert(serviceAccount),
          databaseURL,
        });
      }
    }

    return initializeApp({ databaseURL });
  } catch (error: any) {
    throw new Error(`Firebase Admin Initialization Failed: ${error.message}`);
  }
}

export function getAdminDb() {
  const app = initFirebaseAdmin();
  return getDatabase(app);
}

export function getAdminAuth() {
  const app = initFirebaseAdmin();
  return getAuth(app);
}

export function getAdminFirestore() {
  const app = initFirebaseAdmin();
  return getFirestore(app);
}
