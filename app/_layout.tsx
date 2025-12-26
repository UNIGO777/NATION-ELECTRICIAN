import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import './globals.css';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore/lite';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { auth, db, isFirebaseConfigured } from '@/Globalservices/firebase';
import { useUserStore, type UserData } from '@/Globalservices/userStore';

export const unstable_settings = {
  initialRouteName: 'welcome',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const clearUser = useUserStore((s) => s.clearUser);
  const [isSessionReady, setIsSessionReady] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsSessionReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
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

  if (!isSessionReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack initialRouteName="welcome">
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="AdminDashbord" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
