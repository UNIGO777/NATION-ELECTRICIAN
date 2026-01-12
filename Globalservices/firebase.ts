import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, inMemoryPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore/lite';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

export const firestoreDatabaseId = 'electrician';

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth =
  Platform.OS === 'web'
    ? getAuth(firebaseApp)
    : (() => {
        try {
          return initializeAuth(firebaseApp, { persistence: inMemoryPersistence });
        } catch {
          return getAuth(firebaseApp);
        }
      })();
export const db = getFirestore(firebaseApp, firestoreDatabaseId);
export const storage = getStorage(firebaseApp);

const secondaryAppName = 'secondary';

const getSecondaryApp = () => {
  try {
    return getApp(secondaryAppName);
  } catch {
    return initializeApp(firebaseConfig, secondaryAppName);
  }
};

const secondaryApp = getSecondaryApp();
export const secondaryAuth =
  Platform.OS === 'web'
    ? getAuth(secondaryApp)
    : (() => {
        try {
          return initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
        } catch {
          return getAuth(secondaryApp);
        }
      })();
