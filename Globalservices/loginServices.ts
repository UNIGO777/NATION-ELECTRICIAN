import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore/lite';
import { auth, db, firestoreDatabaseId, isFirebaseConfigured } from '@/Globalservices/firebase';
import type { UserData } from '@/Globalservices/userStore';

export type LoginResult = {
  user: UserData;
  route: '/AdminDashbord' | '/(tabs)';
};

export class LoginServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export const getLoginErrorMessage = (err: unknown) => {
  const maybeCode = typeof (err as { code?: unknown }).code === 'string' ? (err as { code: string }).code : '';
  const rawMessage = err instanceof Error ? err.message : '';
  const rawMessageLower = rawMessage.toLowerCase();

  if (err instanceof LoginServiceError) return err.message;
  if (maybeCode.includes('permission-denied')) return 'Permission denied. Update Firestore rules for this user.';
  if (rawMessageLower.includes('the database (default) does not exist')) {
    return firestoreDatabaseId !== '(default)'
      ? `Firestore database "${firestoreDatabaseId}" is not found in this project.`
      : 'Default Firestore database is not found for this project.';
  }
  if (maybeCode.includes('failed-precondition')) return 'Firestore is not configured correctly for this project.';
  if (
    maybeCode.includes('unavailable') ||
    rawMessageLower.includes('client is offline') ||
    rawMessageLower.includes('offline')
  ) {
    return `Firestore connection failed (${maybeCode || 'offline'}). Restart the app and try again.`;
  }
  return rawMessage || 'Login failed';
};

export const loginWithEmailPassword = async (params: { email: string; password: string }): Promise<LoginResult> => {
  const trimmedEmail = params.email.trim();
  if (!trimmedEmail || !params.password) {
    throw new LoginServiceError('validation', 'Enter email and password');
  }
  if (!isFirebaseConfigured) {
    throw new LoginServiceError('config-missing', 'Firebase config is missing. Restart Expo after setting `.env`.');
  }

  const credential = await signInWithEmailAndPassword(auth, trimmedEmail, params.password);
  const signedInUser = credential.user;

  const userRef = doc(db, 'User', signedInUser.uid);
  const userSnap = await getDoc(userRef);
  let userDoc: Record<string, unknown> | null = userSnap.exists()
    ? (userSnap.data() as Record<string, unknown>)
    : null;

  if (!userDoc) {
    const q = query(collection(db, 'User'), where('uid', '==', signedInUser.uid), limit(1));
    const results = await getDocs(q);
    if (!results.empty) {
      userDoc = results.docs[0].data() as Record<string, unknown>;
    }
  }

  if (!userDoc) {
    throw new LoginServiceError('user-not-found', 'User record not found. Contact admin for access.');
  }

  const isAdmin =
    userDoc.isAdmin === true ||
    userDoc.admin === true ||
    userDoc.role === 'admin' ||
    userDoc.userType === 'admin' ||
    userDoc.type === 'admin';

  const user: UserData = {
    uid: signedInUser.uid,
    email: signedInUser.email,
    ...userDoc,
    isAdmin,
  };

  return {
    user,
    route: isAdmin ? '/AdminDashbord' : '/(tabs)',
  };
};
