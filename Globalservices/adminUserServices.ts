import { createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  type QueryDocumentSnapshot,
  where,
} from 'firebase/firestore/lite';

import { db, firebaseApp, secondaryAuth } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';

export type AdminUserRecord = {
  uid: string;
  email?: string | null;
  role?: 'admin' | 'user' | null;
  fullName?: string | null;
  mobileNumber?: string | null;
  status?: string | null;
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

export const fetchProductsCount = async (): Promise<number> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can view product count.');
  }

  const snap = await getDocs(collection(db, 'Products'));
  return snap.size;
};

export const fetchSchemeRequestsCount = async (): Promise<number> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can view scheme request count.');
  }

  const snap = await getDocs(collection(db, 'SchemeRequests'));
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
    const rawStatus = typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
    const status = rawStatus === 'blocked' ? 'blocked' : 'active';
    return {
      uid: (data.uid as string) ?? d.id,
      email: (data.email as string) ?? null,
      role,
      fullName: (data.fullName as string) ?? (data.name as string) ?? null,
      mobileNumber: (data.mobileNumber as string) ?? (data.mobile as string) ?? null,
      status,
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
    status: 'active',
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
  await Promise.all([
    deleteDoc(doc(db, 'User', uid)).catch(() => null),
    deleteDoc(doc(db, 'Wallet', uid)).catch(() => null),
  ]);
};

export const setUserStatusAsAdmin = async (params: { uid: string; status: 'active' | 'blocked' }): Promise<void> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can update users.');
  }
  const uid = params.uid;
  if (!uid) {
    throw new Error('User uid is required.');
  }
  if (uid === currentUser.uid) {
    throw new Error('You cannot update your own account.');
  }

  const now = Date.now();
  const update = {
    uid,
    status: params.status,
    updatedAt: now,
    updatedBy: currentUser.uid,
  };

  const directRef = doc(db, 'User', uid);
  const directSnap = await getDoc(directRef);

  if (directSnap.exists()) {
    await setDoc(directRef, update, { merge: true });
    return;
  }

  const q = query(collection(db, 'User'), where('uid', '==', uid), limit(1));
  const results = await getDocs(q);
  if (!results.empty) {
    await setDoc(results.docs[0].ref, update, { merge: true });
    return;
  }

  await setDoc(directRef, update, { merge: true });
};

export const fetchWalletCoinsAsAdmin = async (uid: string): Promise<number> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can view wallets.');
  }
  if (!uid) {
    throw new Error('User uid is required.');
  }

  const directRef = doc(db, 'Wallet', uid);
  const directSnap = await getDoc(directRef);
  const snap = directSnap.exists()
    ? directSnap
    : await (async () => {
        const walletQuery = query(collection(db, 'Wallet'), where('uid', '==', uid), limit(1));
        const results = await getDocs(walletQuery);
        return results.empty ? directSnap : results.docs[0];
      })();
  if (!snap.exists()) return 0;
  const data = snap.data() as Record<string, unknown>;
  const rawCoins = typeof data.coins === 'number' ? data.coins : Number(data.coins);
  return Number.isFinite(rawCoins) ? Math.max(0, Math.floor(rawCoins)) : 0;
};

export const adjustUserWalletCoinsAsAdmin = async (params: {
  uid: string;
  delta: number;
  reason?: string;
}): Promise<{ beforeCoins: number; afterCoins: number; appliedDelta: number }> => {
  const currentUser = useUserStore.getState().user;
  if (!currentUser?.isAdmin) {
    throw new Error('Only admin can update wallets.');
  }
  if (!params.uid) {
    throw new Error('User uid is required.');
  }

  const delta = Number.isFinite(params.delta) ? Math.trunc(params.delta) : 0;
  if (delta === 0) {
    throw new Error('Delta must be non-zero.');
  }

  const now = Date.now();
  const directRef = doc(db, 'Wallet', params.uid);
  const directSnap = await getDoc(directRef);
  const walletDoc = directSnap.exists()
    ? { ref: directRef, snap: directSnap }
    : await (async () => {
        const walletQuery = query(collection(db, 'Wallet'), where('uid', '==', params.uid), limit(1));
        const results = await getDocs(walletQuery);
        if (results.empty) {
          return { ref: directRef, snap: directSnap };
        }
        return { ref: results.docs[0].ref, snap: results.docs[0] };
      })();

  const walletRef = walletDoc.ref;
  const walletSnap = walletDoc.snap;
  const walletData = walletSnap.exists() ? (walletSnap.data() as Record<string, unknown>) : null;
  const rawBeforeCoins = walletData
    ? typeof walletData.coins === 'number'
      ? walletData.coins
      : Number(walletData.coins)
    : Number.NaN;
  const beforeCoins = Number.isFinite(rawBeforeCoins) ? Math.max(0, Math.floor(rawBeforeCoins)) : 0;

  const unclampedAfter = beforeCoins + delta;
  const afterCoins = Math.max(0, Math.floor(unclampedAfter));
  const appliedDelta = afterCoins - beforeCoins;

  await setDoc(
    walletRef,
    {
      uid: params.uid,
      coins: afterCoins,
      updatedAt: now,
      updatedBy: currentUser.uid,
      ...(walletSnap.exists() ? null : { createdAt: now }),
    },
    { merge: true }
  );

  await Promise.all([
    addDoc(collection(db, 'History'), {
      uid: params.uid,
      title: 'Wallet Adjustment',
      type: 'admin_wallet_adjust',
      coinsDelta: appliedDelta,
      createdAt: now,
      createdBy: currentUser.uid,
      reason: typeof params.reason === 'string' && params.reason.trim() ? params.reason.trim() : null,
      beforeCoins,
      afterCoins,
    }).catch(() => null),
    addDoc(collection(db, 'Notifications'), {
      uid: params.uid,
      title: 'Wallet Updated',
      body:
        appliedDelta < 0
          ? `${Math.abs(appliedDelta)} coins were deducted from your wallet.`
          : `${appliedDelta} coins were added to your wallet.`,
      type: 'wallet_adjust',
      coinsDelta: appliedDelta,
      createdAt: now,
      read: false,
      createdBy: currentUser.uid,
      reason: typeof params.reason === 'string' && params.reason.trim() ? params.reason.trim() : null,
    }).catch(() => null),
  ]);

  return { beforeCoins, afterCoins, appliedDelta };
};
