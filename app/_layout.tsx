import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import './globals.css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore/lite';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { auth, db, isFirebaseConfigured } from '@/Globalservices/firebase';
import { tFor, useI18nStore } from '@/Globalservices/i18n';
import { useUserStore, type UserData } from '@/Globalservices/userStore';

export const unstable_settings = {
  initialRouteName: 'welcome',
};

const SESSION_USER_KEY = 'sessionUser';
const TOKEN_KEY = 'userToken';

const parseStoredUser = (raw: string | null): UserData | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const maybeUid = (parsed as { uid?: unknown }).uid;
    if (typeof maybeUid !== 'string' || !maybeUid) return null;
    return parsed as UserData;
  } catch {
    return null;
  }
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const clearUser = useUserStore((s) => s.clearUser);
  const hydrateI18n = useI18nStore((s) => s.hydrate);
  const isI18nHydrated = useI18nStore((s) => s.isHydrated);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const blockedAlertUidRef = useRef<string | null>(null);

  useEffect(() => {
    void hydrateI18n();
  }, [hydrateI18n]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsSessionReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          blockedAlertUidRef.current = null;
          const [rawUser, token] = await Promise.all([
            AsyncStorage.getItem(SESSION_USER_KEY).catch(() => null),
            AsyncStorage.getItem(TOKEN_KEY).catch(() => null),
          ]);
          const storedUser = parseStoredUser(rawUser);
          if (storedUser && token) {
            setUser(storedUser);
            return;
          }
          clearUser();
          return;
        }

        const userRef = doc(db, 'User', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        let userDoc: Record<string, unknown> | null = userSnap.exists()
          ? (userSnap.data() as Record<string, unknown>)
          : null;

        if (!userDoc) {
          const q = query(collection(db, 'User'), where('uid', '==', firebaseUser.uid), limit(1));
          const results = await getDocs(q);
          if (!results.empty) {
            userDoc = results.docs[0].data() as Record<string, unknown>;
          }
        }

        const isBlocked =
          userDoc?.blocked === true ||
          userDoc?.isBlocked === true ||
          (typeof userDoc?.status === 'string' && userDoc.status.toLowerCase() === 'blocked') ||
          (typeof userDoc?.accountStatus === 'string' && userDoc.accountStatus.toLowerCase() === 'blocked');
        if (isBlocked) {
          if (blockedAlertUidRef.current !== firebaseUser.uid) {
            blockedAlertUidRef.current = firebaseUser.uid;
            const lang = useI18nStore.getState().language;
            Alert.alert(tFor(lang, 'accountBlockedTitle'), tFor(lang, 'accountBlockedBody'));
          }
          await Promise.all([
            AsyncStorage.removeItem(SESSION_USER_KEY).catch(() => null),
            AsyncStorage.removeItem(TOKEN_KEY).catch(() => null),
          ]);
          await signOut(auth).catch(() => null);
          clearUser();
          return;
        }

        const isAdmin =
          userDoc?.isAdmin === true ||
          userDoc?.admin === true ||
          userDoc?.role === 'admin' ||
          userDoc?.userType === 'admin' ||
          userDoc?.type === 'admin';

        const nextUser: UserData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          ...(userDoc ?? {}),
          isAdmin,
        };

        const token = await firebaseUser.getIdToken().catch(() => null);
        await Promise.all([
          AsyncStorage.setItem(SESSION_USER_KEY, JSON.stringify(nextUser)).catch(() => null),
          token ? AsyncStorage.setItem(TOKEN_KEY, token).catch(() => null) : AsyncStorage.removeItem(TOKEN_KEY).catch(() => null),
        ]);

        setUser(nextUser);
      } finally {
        setIsSessionReady(true);
      }
    });

    return unsubscribe;
  }, [clearUser, setUser]);

  useEffect(() => {
    if (!isSessionReady) return;

    const root = segments[0] ?? '';
    const isInAuth = root === 'welcome' || root === 'login';
    const isInTabs = root === '(tabs)';
    const isInAdmin = root === 'AdminDashbord';

    if (!user) {
      if (!isInAuth) router.replace('/welcome');
      return;
    }

    if (user.isAdmin) {
      if (!isInAdmin) router.replace('/AdminDashbord');
      return;
    }

    if (!isInTabs) router.replace('/(tabs)');
  }, [isSessionReady, router, segments, user]);

  if (!isSessionReady || !isI18nHydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack initialRouteName="welcome">
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="AdminDashbord" options={{ headerShown: false }} />
            <Stack.Screen
              name="modal"
              options={{
                presentation: 'modal',
                title: tFor(useI18nStore.getState().language, 'modalTitle'),
              }}
            />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
