import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { collection, doc, getDocs, limit, orderBy, query, where, writeBatch, type QueryDocumentSnapshot } from 'firebase/firestore/lite';

import { db } from '@/Globalservices/firebase';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAtLabel: string;
  createdAtMs: number;
  isUnread: boolean;
};

type Props = {
  visible: boolean;
  uid: string | null;
  onClose: () => void;
};

const formatDateLabel = (value: unknown): string => {
  if (typeof value === 'number') {
    const dt = new Date(value);
    if (!Number.isNaN(dt.getTime())) return dt.toDateString();
  }

  if (value && typeof value === 'object' && 'toMillis' in (value as Record<string, unknown>)) {
    const maybeToMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof maybeToMillis === 'function') {
      const ms = maybeToMillis();
      const dt = new Date(ms);
      if (!Number.isNaN(dt.getTime())) return dt.toDateString();
    }
  }

  return '—';
};

const extractCreatedAtMs = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (value && typeof value === 'object' && 'toMillis' in (value as Record<string, unknown>)) {
    const maybeToMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof maybeToMillis === 'function') {
      const ms = maybeToMillis();
      if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
    }
  }

  return 0;
};

const mapNotificationDoc = (docSnap: QueryDocumentSnapshot): NotificationItem => {
  const data = docSnap.data() as Record<string, unknown>;
  const title = typeof data.title === 'string' && data.title ? data.title : 'Notification';
  const body = typeof data.body === 'string' && data.body ? data.body : '';
  const createdAtMs = extractCreatedAtMs(data.createdAt);
  const createdAtLabel = formatDateLabel(data.createdAt);
  const isUnread = data.read === false;

  return { id: docSnap.id, title, body, createdAtLabel, createdAtMs, isUnread };
};

export default function NotificationsPopup({ visible, uid, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const unreadCount = useMemo(() => items.filter((i) => i.isUnread).length, [items]);

  const markItemsRead = useCallback(async (nextItems: NotificationItem[]) => {
    const unreadIds = nextItems.filter((n) => n.isUnread).map((n) => n.id);
    if (!unreadIds.length) return;

    try {
      const batch = writeBatch(db);
      unreadIds.forEach((id) => {
        batch.update(doc(db, 'Notifications', id), { read: true });
      });
      await batch.commit();

      const idSet = new Set(unreadIds);
      setItems((prev) => prev.map((n) => (idSet.has(n.id) ? { ...n, isUnread: false } : n)));
    } catch {
      return;
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setErrorText(null);
    try {
      const q = query(
        collection(db, 'Notifications'),
        where('uid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(25)
      );
      const snap = await getDocs(q);
      const nextItems = snap.docs.map(mapNotificationDoc);
      setItems(nextItems);
      void markItemsRead(nextItems);
    } catch {
      try {
        const fallbackQ = query(collection(db, 'Notifications'), where('uid', '==', uid), limit(100));
        const fallbackSnap = await getDocs(fallbackQ);
        const sorted = fallbackSnap.docs
          .map(mapNotificationDoc)
          .sort((a, b) => b.createdAtMs - a.createdAtMs)
          .slice(0, 25);
        setItems(sorted);
        void markItemsRead(sorted);
      } catch {
        setItems([]);
        setErrorText('Unable to load notifications right now.');
      }
    } finally {
      setLoading(false);
    }
  }, [markItemsRead, uid]);

  useEffect(() => {
    if (!visible) return;
    if (!uid) return;
    void fetchNotifications();
  }, [fetchNotifications, uid, visible]);

  const content = useMemo(() => {
    if (loading) {
      return React.createElement(
        View,
        { style: styles.stateWrap },
        React.createElement(ActivityIndicator, { color: '#dc2626' })
      );
    }

    if (errorText) {
      return React.createElement(
        View,
        { style: styles.stateWrap },
        React.createElement(Text, { style: styles.stateText }, errorText),
        React.createElement(
          Pressable,
          { onPress: fetchNotifications, style: styles.retryButton },
          React.createElement(Text, { style: styles.retryText }, 'Retry')
        )
      );
    }

    if (items.length === 0) {
      return React.createElement(
        View,
        { style: styles.stateWrap },
        React.createElement(Text, { style: styles.stateText }, 'No notifications yet.')
      );
    }

    return React.createElement(
      ScrollView,
      { contentContainerStyle: styles.list, showsVerticalScrollIndicator: false },
      items.map((n) =>
        React.createElement(
          View,
          { key: n.id, style: styles.itemRow },
          React.createElement(
            View,
            { style: styles.itemTopRow },
            React.createElement(Text, { style: styles.itemTitle }, n.title),
            n.isUnread ? React.createElement(View, { style: styles.unreadDot }) : null
          ),
          n.body ? React.createElement(Text, { style: styles.itemBody }, n.body) : null,
          React.createElement(Text, { style: styles.itemDate }, n.createdAtLabel)
        )
      )
    );
  }, [errorText, fetchNotifications, items, loading]);

  return React.createElement(
    Modal,
    { visible, transparent: true, animationType: 'fade', onRequestClose: onClose },
    React.createElement(
      View,
      { style: styles.overlay },
      React.createElement(Pressable, { style: styles.backdrop, onPress: onClose }),
      React.createElement(
        View,
        { style: styles.card },
        React.createElement(
          View,
          { style: styles.headerRow },
          React.createElement(
            View,
            { style: styles.headerTextWrap },
            React.createElement(Text, { style: styles.headerTitle }, 'Notifications'),
            React.createElement(
              Text,
              { style: styles.headerSubtitle },
              unreadCount ? `${unreadCount} unread` : 'All caught up'
            )
          ),
          React.createElement(
            Pressable,
            { onPress: onClose, style: styles.closeButton, hitSlop: 10 },
            React.createElement(X, { color: '#6b7280', size: 18 })
          )
        ),
        content
      )
    )
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    maxHeight: '72%',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },
  closeButton: {
    height: 34,
    width: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    marginLeft: 10,
  },
  stateWrap: {
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#111827',
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  list: {
    paddingTop: 12,
    paddingBottom: 4,
    gap: 10,
  },
  itemRow: {
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
  },
  unreadDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: '#dc2626',
  },
  itemBody: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  itemDate: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
  },
});
