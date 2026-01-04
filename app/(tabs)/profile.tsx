import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, LogOut, User as UserIcon } from 'lucide-react-native';
import { signOut } from 'firebase/auth';
import { useCallback, useMemo, useState } from 'react';

import { auth, db, isFirebaseConfigured } from '@/Globalservices/firebase';
import NotificationsPopup from '@/components/user/NotificationsPopup';
import { useUserStore } from '@/Globalservices/userStore';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore/lite';

export default function ProfileScreen() {
  const user = useUserStore((s) => s.user);
  const clearUser = useUserStore((s) => s.clearUser);
  const setUser = useUserStore((s) => s.setUser);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsHasUnread, setNotificationsHasUnread] = useState(false);

  const fullName = useMemo(() => {
    const v = user?.fullName ?? user?.name;
    return typeof v === 'string' && v.trim() ? v.trim() : '—';
  }, [user?.fullName, user?.name]);

  const email = useMemo(() => {
    return typeof user?.email === 'string' && user.email.trim() ? user.email.trim() : '—';
  }, [user?.email]);

  const mobileNumber = useMemo(() => {
    const v = user?.mobileNumber ?? user?.mobile;
    return typeof v === 'string' && v.trim() ? v.trim() : '—';
  }, [user?.mobileNumber, user?.mobile]);

  const uid = useMemo(() => {
    return typeof user?.uid === 'string' && user.uid ? user.uid : '—';
  }, [user?.uid]);

  const role = useMemo(() => {
    const raw =
      (typeof user?.role === 'string' ? user.role : null) ??
      (typeof user?.userType === 'string' ? user.userType : null) ??
      null;
    if (!raw) return user?.isAdmin ? 'admin' : 'user';
    const v = raw.toLowerCase();
    return v === 'admin' ? 'admin' : v === 'user' ? 'user' : user?.isAdmin ? 'admin' : 'user';
  }, [user?.isAdmin, user?.role, user?.userType]);

  const refreshUnreadNotifications = useCallback(async () => {
    const currentUid = typeof user?.uid === 'string' ? user.uid : null;
    if (!currentUid) return;
    try {
      const q = query(collection(db, 'Notifications'), where('uid', '==', currentUid), where('read', '==', false), limit(1));
      const snap = await getDocs(q);
      setNotificationsHasUnread(!snap.empty);
    } catch {
      setNotificationsHasUnread(false);
    }
  }, [user?.uid]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      if (isFirebaseConfigured) {
        await signOut(auth);
      }
    } finally {
      clearUser();
      setIsLoggingOut(false);
    }
  };

  const refreshProfile = useCallback(async () => {
    const currentUid = typeof user?.uid === 'string' ? user.uid : null;
    if (!currentUid || isRefreshing) return;

    setIsRefreshing(true);
    try {
      if (!isFirebaseConfigured) return;

      const userRef = doc(db, 'User', currentUid);
      const userSnap = await getDoc(userRef);
      let userDoc: Record<string, unknown> | null = userSnap.exists()
        ? (userSnap.data() as Record<string, unknown>)
        : null;

      if (!userDoc) {
        const q = query(collection(db, 'User'), where('uid', '==', currentUid), limit(1));
        const results = await getDocs(q);
        if (!results.empty) {
          userDoc = results.docs[0].data() as Record<string, unknown>;
        }
      }

      if (!userDoc) return;

      const isAdmin =
        userDoc.isAdmin === true ||
        userDoc.admin === true ||
        userDoc.role === 'admin' ||
        userDoc.userType === 'admin' ||
        userDoc.type === 'admin';

      setUser({
        ...(user ?? { uid: currentUid }),
        ...userDoc,
        uid: currentUid,
        isAdmin,
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, setUser, user]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshProfile}
            tintColor="#dc2626"
            colors={['#dc2626']}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <UserIcon color="#dc2626" size={20} />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Profile</Text>
              <Text style={styles.subtitle}>{fullName}</Text>
            </View>
          </View>
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              setNotificationsOpen(true);
              void refreshUnreadNotifications();
            }}
          >
            <Bell color="#111827" size={18} />
            {notificationsHasUnread ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value} numberOfLines={1}>
              {email}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Mobile</Text>
            <Text style={styles.value} numberOfLines={1}>
              {mobileNumber}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>UID</Text>
            <Text style={styles.value} numberOfLines={1}>
              {uid}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Role</Text>
            <Text style={styles.value} numberOfLines={1}>
              {role}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleLogout}
          disabled={isLoggingOut}
          style={[styles.logoutButton, isLoggingOut ? styles.logoutButtonDisabled : null]}
        >
          {isLoggingOut ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <LogOut color="#ffffff" size={18} />
              <Text style={styles.logoutText}>Logout</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <NotificationsPopup
        visible={notificationsOpen}
        uid={typeof user?.uid === 'string' ? user.uid : null}
        onClose={() => {
          setNotificationsOpen(false);
          void refreshUnreadNotifications();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 26,
  },
  header: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconWrap: {
    height: 44,
    width: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  headerTextWrap: {
    flex: 1,
  },
  iconButton: {
    height: 40,
    width: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    height: 8,
    width: 8,
    borderRadius: 999,
    backgroundColor: '#dc2626',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
  },
  card: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  row: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6b7280',
  },
  value: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  logoutButton: {
    marginTop: 18,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  logoutButtonDisabled: {
    opacity: 0.7,
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
});
