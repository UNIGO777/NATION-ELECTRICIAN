import React, { useEffect, useRef } from 'react';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import type * as ExpoNotifications from 'expo-notifications';
import Constants from 'expo-constants';

import AdminNavbar from '@/AdminComponents/AdminNavbar';
import { HapticTab } from '@/components/haptic-tab';
import { db } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';
import { ClipboardList, FileText, Gift, Home, Package, Users } from 'lucide-react-native';
import { doc, setDoc } from 'firebase/firestore/lite';

export default function AdminTabLayout() {
  const user = useUserStore((s) => s.user);
  const router = useRouter();
  const notificationListener = useRef<ExpoNotifications.EventSubscription | null>(null);
  const responseListener = useRef<ExpoNotifications.EventSubscription | null>(null);
  const notificationHandlerConfigured = useRef(false);
  const uid = user?.uid ?? null;
  const isAdmin = Boolean(user?.isAdmin);

  useEffect(() => {
    let cancelled = false;

    const registerForPushNotificationsAsync = async () => {
      if (Platform.OS === 'web') return;
      if (!Device.isDevice) return;
      if (Constants.appOwnership === 'expo') return;

      let Notifications: typeof import('expo-notifications');
      try {
        Notifications = await import('expo-notifications');
      } catch {
        return;
      }
      if (cancelled) return;

      if (!notificationHandlerConfigured.current) {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        notificationHandlerConfigured.current = true;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
        });
      }

      notificationListener.current = Notifications.addNotificationReceivedListener(() => null);
      responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;
        if (data?.type === 'bill_uploaded') {
          router.push('/AdminDashbord/bills');
        } else if (data?.type === 'scheme_request') {
          router.push('/AdminDashbord/schemerequests' as never);
        }
      });

      if (!uid || !isAdmin) return;

      const current = await Notifications.getPermissionsAsync();
      const status =
        current.status === 'granted'
          ? current.status
          : (await Notifications.requestPermissionsAsync()).status;

      if (status !== 'granted') return;

      const deviceTokenResponse = await Notifications.getDevicePushTokenAsync();
      const token = deviceTokenResponse.data;
      if (!token) return;
      if (cancelled) return;

      await setDoc(
        doc(db, 'AdminFcmTokens', token),
        {
          token,
          uid,
          platform: Platform.OS,
          enabled: true,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    };

    void registerForPushNotificationsAsync();

    return () => {
      cancelled = true;
      notificationListener.current?.remove();
      responseListener.current?.remove();
      notificationListener.current = null;
      responseListener.current = null;
    };
  }, [isAdmin, router, uid]);

  if (!user) return <Redirect href="/login" />;
  if (!user.isAdmin) return <Redirect href="/(tabs)" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#dc2626',
        tabBarInactiveTintColor: '#9ca3af',
        headerShown: true,
        header: () => <AdminNavbar />,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: 'Bills',
          tabBarIcon: ({ color, size }) => <FileText color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: 'Users',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          tabBarIcon: ({ color, size }) => <Package color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="schemes"
        options={{
          title: 'Schemes',
          tabBarIcon: ({ color, size }) => <Gift color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen
        name="schemerequests"
        options={{
          title: 'Requests',
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size ?? 24} />,
        }}
      />
      <Tabs.Screen name="billprofile" options={{ href: null }} />
      <Tabs.Screen name="billprofile/[billId]" options={{ href: null }} />
    </Tabs>
  );
}
