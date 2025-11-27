// src/lib/firebase.ts
import {
  getAnalytics,
  isSupported as isAnalyticsSupported,
  type Analytics,
} from 'firebase/analytics';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let analytics: Analytics | null = null;

if (!firebaseConfig.apiKey) {
  console.error(
    'Firebase API key is missing. Please set NEXT_PUBLIC_FIREBASE_API_KEY in your environment. Firebase will not be initialized.'
  );
} else {
  if (!getApps().length) {
    try {
      app = initializeApp(firebaseConfig);
    } catch (e) {
      console.error('Firebase initialization error:', e);
    }
  } else {
    app = getApp();
  }

  if (app) {
    try {
      auth = getAuth(app);
      db = getFirestore(app);
      storage = getStorage(app);

      const initializedApp = app;

      if (typeof window !== 'undefined') {
        isAnalyticsSupported().then((yes) => {
          if (yes) {
            analytics = getAnalytics(initializedApp);
          }
        });

        const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

        if (recaptchaKey) {
          if (process.env.NODE_ENV === 'development') {
            (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
          }

          initializeAppCheck(initializedApp, {
            provider: new ReCaptchaEnterpriseProvider(recaptchaKey),
            isTokenAutoRefreshEnabled: true,
          });
        }
      }
      // -------------------------------------------------------------
    } catch (e) {
      console.error('Error initializing Firebase services:', e);
    }
  } else {
    console.error('Firebase app object is null after initialization attempt.');
  }
}

export { analytics, app, auth, db, storage };
