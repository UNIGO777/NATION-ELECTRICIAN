import { Tabs } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import type * as ExpoNotifications from 'expo-notifications';
import Constants from 'expo-constants';

import { HapticTab } from '@/components/haptic-tab';
import { db } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';
import { Gift, Home, Package, User } from 'lucide-react-native';
import { doc, setDoc } from 'firebase/firestore/lite';

export default function TabLayout() {
  const user = useUserStore((s) => s.user);
  const uid = user?.uid ?? null;
  const isAdmin = Boolean(user?.isAdmin);
  const notificationListener = useRef<ExpoNotifications.EventSubscription | null>(null);
  const responseListener = useRef<ExpoNotifications.EventSubscription | null>(null);
  const notificationHandlerConfigured = useRef(false);

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
      responseListener.current = Notifications.addNotificationResponseReceivedListener(() => null);

      if (!uid || isAdmin) return;

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
        doc(db, 'UserFcmTokens', token),
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
  }, [isAdmin, uid]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#dc2626',
        tabBarInactiveTintColor: '#9ca3af',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e5e7eb',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Products',
          tabBarIcon: ({ color, size }) => <Package color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Rewards',
          tabBarIcon: ({ color, size }) => <Gift color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size ?? 22} />,
        }}
      />
    </Tabs>
  );
}
