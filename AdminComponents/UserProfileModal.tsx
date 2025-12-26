import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { User, X } from 'lucide-react-native';
import { doc, getDoc } from 'firebase/firestore/lite';

import { db } from '@/Globalservices/firebase';
import { type AdminUserRecord } from '@/Globalservices/adminUserServices';
import { useUserStore } from '@/Globalservices/userStore';

type Props = {
  visible: boolean;
  userId: string | null;
  onClose: () => void;
};

export default function UserProfileModal({ visible, userId, onClose }: Props) {
  const currentUser = useUserStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [profile, setProfile] = useState<AdminUserRecord | null>(null);
  const edges = useMemo<Edge[]>(() => ['bottom'], []);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (visible) return;
    setLoading(false);
    setErrorText(null);
    setProfile(null);
  }, [visible]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!visible) return;
      if (!userId) return;
      if (!currentUser?.isAdmin) {
        setProfile(null);
        setErrorText('Not authorized.');
        return;
      }

      setLoading(true);
      setErrorText(null);
      setProfile(null);
      try {
        const ref = doc(db, 'User', userId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          if (cancelled) return;
          setErrorText('User not found.');
          return;
        }
        if (cancelled) return;
        setProfile(snap.data() as AdminUserRecord);
      } catch {
        if (cancelled) return;
        setErrorText('Unable to load user right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.isAdmin, userId, visible]);

  const headerUserId = userId ?? '—';

  const uidText = useMemo(() => {
    const v = profile?.uid;
    return typeof v === 'string' && v.length > 0 ? v : '—';
  }, [profile?.uid]);

  const nameText = useMemo(() => {
    const v = profile?.fullName;
    return typeof v === 'string' && v.length > 0 ? v : '—';
  }, [profile?.fullName]);

  const emailText = useMemo(() => {
    const v = profile?.email;
    return typeof v === 'string' && v.length > 0 ? v : '—';
  }, [profile?.email]);

  const mobileText = useMemo(() => {
    const v = profile?.mobileNumber;
    return typeof v === 'string' && v.length > 0 ? v : '—';
  }, [profile?.mobileNumber]);

  const roleText = useMemo(() => {
    const v = profile?.role;
    return typeof v === 'string' && v.length > 0 ? v.toUpperCase() : '—';
  }, [profile?.role]);

  const renderMessage = (text: string, kind: 'muted' | 'error') => {
    const textStyle = kind === 'error' ? styles.errorText : styles.mutedText;
    return React.createElement(
      View,
      { style: styles.messageCard },
      React.createElement(Text, { style: textStyle }, text)
    );
  };

  const detailsCard = profile
    ? React.createElement(
        View,
        { style: styles.card },
        React.createElement(Text, { style: styles.cardTitle }, 'User Details'),
        React.createElement(Text, { style: styles.metaText }, `UID: ${uidText}`),
        React.createElement(Text, { style: styles.metaText }, `Full Name: ${nameText}`),
        React.createElement(Text, { style: styles.metaText }, `Email: ${emailText}`),
        React.createElement(Text, { style: styles.metaText }, `Mobile: ${mobileText}`),
        React.createElement(Text, { style: styles.metaText }, `Role: ${roleText}`)
      )
    : null;

  const content = loading
    ? React.createElement(
        View,
        { style: styles.centered },
        React.createElement(ActivityIndicator, null)
      )
    : errorText
      ? renderMessage(errorText, 'error')
      : !profile
        ? renderMessage('No data', 'muted')
        : React.createElement(React.Fragment, null, detailsCard);

  return React.createElement(
    Modal,
    { visible, animationType: 'slide', transparent: true, onRequestClose: close },
    React.createElement(
      View,
      { style: styles.backdrop },
      React.createElement(Pressable, { style: styles.backdropPressArea, onPress: close }),
      React.createElement(
        View,
        { style: styles.sheet },
        React.createElement(
          SafeAreaView,
          { edges },
          React.createElement(
            View,
            { style: styles.headerContainer },
            React.createElement(
              View,
              { style: styles.handleWrap },
              React.createElement(View, { style: styles.handle })
            ),
            React.createElement(
              View,
              { style: styles.headerRow },
              React.createElement(
                View,
                { style: styles.headerIconWrap },
                React.createElement(User, { color: '#dc2626', size: 20 })
              ),
              React.createElement(
                View,
                { style: styles.headerTextWrap },
                React.createElement(Text, { style: styles.headerTitle }, 'User Profile'),
                React.createElement(Text, { style: styles.headerSubtitle }, `User ID: ${headerUserId}`)
              ),
              React.createElement(
                Pressable,
                { onPress: close, style: styles.closeButton },
                React.createElement(X, { color: '#6b7280', size: 18 })
              )
            )
          ),
          React.createElement(
            ScrollView,
            { contentContainerStyle: styles.content, showsVerticalScrollIndicator: false },
            content
          )
        )
      )
    )
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdropPressArea: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    maxHeight: '78%',
  },
  headerContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
  },
  handle: {
    height: 4,
    width: 48,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  headerIconWrap: {
    height: 40,
    width: 40,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  closeButton: {
    height: 36,
    width: 36,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 22,
  },
  centered: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  errorText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13,
  },
  mutedText: {
    color: '#6b7280',
    fontWeight: '600',
    fontSize: 13,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 14,
  },
  metaText: {
    color: '#6b7280',
    fontWeight: '600',
    fontSize: 12,
    marginTop: 6,
  },
});

