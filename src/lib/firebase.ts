import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (!firebaseConfig.apiKey) {
  console.error(
    "Firebase API key is missing. Please set NEXT_PUBLIC_FIREBASE_API_KEY in your environment. Firebase will not be initialized."
  );
} else {
  // This logic attempts to initialize Firebase for both client and server environments using the client SDK.
  // Note: For robust server-side operations, Firebase Admin SDK is generally recommended.
  // This setup makes the client SDK available but relies on NEXT_PUBLIC_ vars being accessible.
  if (!getApps().length) {
    try {
      app = initializeApp(firebaseConfig);
    } catch (e) {
      console.error("Firebase initialization error:", e);
      // app remains null
    }
  } else {
    app = getApp();
  }

  if (app) {
    try {
      auth = getAuth(app);
      db = getFirestore(app);
    } catch (e) {
      console.error("Error initializing Firebase Auth/Firestore services:", e);
      // If getAuth or getFirestore fails (e.g., due to invalid config, like invalid API key after app init),
      // ensure auth and db are null, and also nullify app to indicate incomplete setup.
      auth = null;
      db = null;
      app = null; 
    }
  } else {
    // This case is hit if initializeApp failed in the try-catch block above.
    // auth and db are already null by default.
    console.error("Firebase app object is null after initialization attempt. Auth and Firestore will not be available.");
  }
}

export { app, auth, db };
