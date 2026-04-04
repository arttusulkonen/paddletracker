import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

// Нормализатор RSA-ключа (исправляет проблему с \n в строке)
const formatPrivateKey = (key: string | undefined): string | undefined => {
  if (!key) return undefined;
  return key.replace(/\\n/g, '\n');
};

const databaseURL =
  'https://pingpong-dev-fa6d2-default-rtdb.europe-west1.firebasedatabase.app';

export function initFirebaseAdmin(): App {
  // Ищем ИМЕННО дефолтное приложение.
  // Firebase Web Frameworks может инжектить свои именованные инстансы,
  // поэтому простая проверка длины массива здесь не подходит.
  const apps = getApps();
  const defaultApp = apps.find((app) => app.name === '[DEFAULT]');

  if (defaultApp) {
    return defaultApp;
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

      console.log(
        '[Firebase Admin] Initializing [DEFAULT] app with SERVICE_ACCOUNT_JSON',
      );
      return initializeApp({
        credential: cert(serviceAccount),
        databaseURL,
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      const fs = require('fs');
      const path = require('path');
      const keyPath = path.resolve(process.cwd(), 'serviceAccountKeyDev.json');

      if (fs.existsSync(keyPath)) {
        console.log(
          '[Firebase Admin] Initializing [DEFAULT] app with local JSON',
        );
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

    console.log('[Firebase Admin] Initializing [DEFAULT] app with ADC');
    return initializeApp({ databaseURL });
  } catch (error: any) {
    console.error('[Firebase Admin] CRITICAL INITIALIZATION ERROR:', error);
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
