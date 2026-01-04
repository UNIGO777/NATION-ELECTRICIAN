import { createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';

import { db, firebaseApp, secondaryAuth } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';

export type AdminUserRecord = {
  uid: string;
  email?: string | null;
  role?: 'admin' | 'user' | null;
  fullName?: string | null;
  mobileNumber?: string | null;
};

export type UsersPageCursor = QueryDocumentSnapshot | null;

export const fetchUsersCount = async (): Promise<number> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can view user count.');
  }

  const snap = await getDocs(collection(db, 'User'));
  return snap.size;
};

export const fetchBillsCount = async (): Promise<number> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can view bills count.');
  }

  const snap = await getDocs(collection(db, 'Bills'));
  return snap.size;
};

export const createUserWallet = async (uid: string): Promise<void> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can create wallets.');
  }

  if (!uid) {
    throw new Error('User uid is required.');
  }

  const walletRef = doc(db, 'Wallet', uid);
  const existing = await getDoc(walletRef);
  if (existing.exists()) return;

  const now = Date.now();
  await setDoc(walletRef, {
    uid,
    coins: 0,
    createdAt: now,
    updatedAt: now,
  });
};

export const fetchUsersPage = async (params: {
  pageSize: number;
  cursor: UsersPageCursor;
}): Promise<{ users: AdminUserRecord[]; nextCursor: UsersPageCursor; hasMore: boolean }> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can view users.');
  }

  const baseQuery = query(collection(db, 'User'), orderBy('email'), limit(params.pageSize));
  const q = params.cursor
    ? query(collection(db, 'User'), orderBy('email'), startAfter(params.cursor), limit(params.pageSize))
    : baseQuery;

  const snap = await getDocs(q);
  const users = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const rawRole = ((data.role as string) ?? (data.userType as string) ?? '').toLowerCase();
    const role = rawRole === 'admin' ? 'admin' : rawRole === 'user' ? 'user' : null;
    return {
      uid: (data.uid as string) ?? d.id,
      email: (data.email as string) ?? null,
      role,
      fullName: (data.fullName as string) ?? (data.name as string) ?? null,
      mobileNumber: (data.mobileNumber as string) ?? (data.mobile as string) ?? null,
    } satisfies AdminUserRecord;
  });

  const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
  const hasMore = snap.docs.length === params.pageSize;

  return { users, nextCursor, hasMore };
};

export const createUserAsAdmin = async (params: {
  email: string;
  password: string;
  fullName: string;
  mobileNumber: string;
  role: 'admin' | 'user';
}): Promise<AdminUserRecord> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can create users.');
  }

  const trimmedEmail = params.email.trim();
  if (!trimmedEmail || !params.password || !params.fullName || !params.mobileNumber) {
    throw new Error('All fields are required.');
  }

  const credential = await createUserWithEmailAndPassword(secondaryAuth, trimmedEmail, params.password);
  const uid = credential.user.uid;

  await setDoc(doc(db, 'User', uid), {
    uid,
    email: trimmedEmail,
    fullName: params.fullName,
    mobileNumber: params.mobileNumber,
    role: params.role,
    isAdmin: params.role === 'admin',
    createdAt: Date.now(),
  });

  try {
    const now = Date.now();
    await createUserWallet(uid);

    await setDoc(
      doc(db, 'Notifications', `${uid}_welcome`),
      {
        uid,
        title: 'Welcome',
        body: 'Your account has been created.',
        type: 'welcome',
        createdAt: now,
        read: false,
        createdBy: currentUser.uid,
      },
      { merge: true }
    );

    await setDoc(
      doc(db, 'History', `${uid}_account_created`),
      {
        uid,
        title: 'Account Created',
        type: 'account_created',
        coinsDelta: 0,
        createdAt: now,
        createdBy: currentUser.uid,
      },
      { merge: true }
    );
  } catch {
    throw new Error(`User created but setup failed for uid: ${uid}`);
  }

  return {
    uid,
    email: trimmedEmail,
    role: params.role,
    fullName: params.fullName,
    mobileNumber: params.mobileNumber,
  };
};

export const updateUserAsAdmin = async (params: {
  uid: string;
  email: string;
  fullName: string;
  mobileNumber: string;
  role: 'admin' | 'user';
}): Promise<AdminUserRecord> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can edit users.');
  }

  const trimmedEmail = params.email.trim();
  if (!params.uid || !trimmedEmail || !params.fullName || !params.mobileNumber) {
    throw new Error('All fields are required.');
  }

  await setDoc(
    doc(db, 'User', params.uid),
    {
      uid: params.uid,
      email: trimmedEmail,
      fullName: params.fullName,
      mobileNumber: params.mobileNumber,
      role: params.role,
      isAdmin: params.role === 'admin',
      updatedAt: Date.now(),
    },
    { merge: true }
  );

  return {
    uid: params.uid,
    email: trimmedEmail,
    role: params.role,
    fullName: params.fullName,
    mobileNumber: params.mobileNumber,
  };
};

export const deleteUserAsAdmin = async (uid: string): Promise<void> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can delete users.');
  }
  if (!uid) {
    throw new Error('User uid is required.');
  }
  if (uid === currentUser.uid) {
    throw new Error('You cannot delete your own account.');
  }

  const functions = getFunctions(firebaseApp);
  const call = httpsCallable<{ uid: string }, { ok?: boolean }>(functions, 'adminDeleteUser');
  await call({ uid });
};
