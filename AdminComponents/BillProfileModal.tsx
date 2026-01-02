import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Download, FileText, User, X } from 'lucide-react-native';
import { doc, getDoc } from 'firebase/firestore/lite';
import * as WebBrowser from 'expo-web-browser';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import UserProfileModal from '@/AdminComponents/UserProfileModal';
import { db } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';

type BillRecord = {
  uid?: unknown;
  status?: unknown;
  billNumber?: unknown;
  customerName?: unknown;
  images?: unknown;
  totalAmount?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  approvedCoins?: unknown;
};

type Props = {
  visible: boolean;
  billId: string | null;
  onClose: () => void;
};

export default function BillProfileModal({ visible, billId, onClose }: Props) {
  const user = useUserStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [bill, setBill] = useState<BillRecord | null>(null);
  const [userProfileVisible, setUserProfileVisible] = useState(false);
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const edges = useMemo<Edge[]>(() => ['bottom'], []);

  const closeAll = useCallback(() => {
    setUserProfileVisible(false);
    setImagePreviewVisible(false);
    setPreviewImageUri(null);
    onClose();
  }, [onClose]);

  const openImagePreview = useCallback((uri: string) => {
    setPreviewImageUri(uri);
    setImagePreviewVisible(true);
  }, []);

  const closeImagePreview = useCallback(() => {
    setImagePreviewVisible(false);
    setPreviewImageUri(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!visible) return;
      if (!billId) return;
      if (!user?.isAdmin) {
        setBill(null);
        setErrorText('Not authorized.');
        return;
      }

      setLoading(true);
      setErrorText(null);
      setBill(null);
      try {
        const ref = doc(db, 'Bills', billId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          if (cancelled) return;
          setErrorText('Bill not found.');
          setBill(null);
          return;
        }
        if (cancelled) return;
        setBill(snap.data() as BillRecord);
      } catch {
        if (cancelled) return;
        setErrorText('Unable to load bill right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [billId, user?.isAdmin, visible]);

  const headerBillId = billId ?? '—';
  const billUserId = useMemo(() => {
    const v = bill?.uid;
    return typeof v === 'string' && v.length > 0 ? v : null;
  }, [bill?.uid]);

  const statusText = useMemo(() => {
    const v = bill?.status;
    return typeof v === 'string' ? v.toUpperCase() : 'PENDING';
  }, [bill?.status]);

  const uidText = useMemo(() => {
    const v = bill?.uid;
    if (typeof v !== 'string' || v.length === 0) return '—';
    return v.length <= 4 ? v : v.slice(-4);
  }, [bill?.uid]);

  const approvedCoinsText = useMemo(() => {
    const v = bill?.approvedCoins;
    return typeof v === 'number' ? String(v) : null;
  }, [bill?.approvedCoins]);

  const createdAtText = useMemo(() => {
    const v = bill?.createdAt;
    if (typeof v !== 'number') return '—';
    const dt = new Date(v);
    return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleString();
  }, [bill?.createdAt]);

  const updatedAtText = useMemo(() => {
    const v = bill?.updatedAt;
    if (typeof v !== 'number') return '—';
    const dt = new Date(v);
    return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleString();
  }, [bill?.updatedAt]);

  const images = useMemo(() => {
    const raw = bill?.images;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
  }, [bill?.images]);

  const previewScale = useSharedValue(1);
  const previewStartScale = useSharedValue(1);
  const previewTranslateX = useSharedValue(0);
  const previewTranslateY = useSharedValue(0);
  const previewStartX = useSharedValue(0);
  const previewStartY = useSharedValue(0);

  useEffect(() => {
    if (!imagePreviewVisible) return;
    previewScale.value = 1;
    previewStartScale.value = 1;
    previewTranslateX.value = 0;
    previewTranslateY.value = 0;
    previewStartX.value = 0;
    previewStartY.value = 0;
  }, [
    imagePreviewVisible,
    previewScale,
    previewStartScale,
    previewTranslateX,
    previewTranslateY,
    previewStartX,
    previewStartY,
  ]);

  const previewAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: previewTranslateX.value },
        { translateY: previewTranslateY.value },
        { scale: previewScale.value },
      ],
    };
  });

  const pinchGesture = useMemo(() => {
    return Gesture.Pinch()
      .onBegin(() => {
        previewStartScale.value = previewScale.value;
      })
      .onUpdate((ev) => {
        const raw = previewStartScale.value * ev.scale;
        const clamped = raw < 1 ? 1 : raw > 4 ? 4 : raw;
        previewScale.value = clamped;
      })
      .onEnd(() => {
        if (previewScale.value <= 1) {
          previewScale.value = withTiming(1);
          previewTranslateX.value = withTiming(0);
          previewTranslateY.value = withTiming(0);
        }
      });
  }, [previewScale, previewStartScale, previewTranslateX, previewTranslateY]);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .onBegin(() => {
        previewStartX.value = previewTranslateX.value;
        previewStartY.value = previewTranslateY.value;
      })
      .onUpdate((ev) => {
        if (previewScale.value <= 1) return;
        previewTranslateX.value = previewStartX.value + ev.translationX;
        previewTranslateY.value = previewStartY.value + ev.translationY;
      })
      .onEnd(() => {
        if (previewScale.value <= 1) {
          previewTranslateX.value = withTiming(0);
          previewTranslateY.value = withTiming(0);
        }
      });
  }, [previewScale, previewStartX, previewStartY, previewTranslateX, previewTranslateY]);

  const doubleTapGesture = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        previewScale.value = withTiming(1);
        previewTranslateX.value = withTiming(0);
        previewTranslateY.value = withTiming(0);
      });
  }, [previewScale, previewTranslateX, previewTranslateY]);

  const combinedGesture = useMemo(() => {
    return Gesture.Exclusive(doubleTapGesture, Gesture.Simultaneous(pinchGesture, panGesture));
  }, [doubleTapGesture, panGesture, pinchGesture]);

  const openDownload = useCallback(async () => {
    if (!previewImageUri) return;
    try {
      await WebBrowser.openBrowserAsync(previewImageUri);
    } catch {
      return;
    }
  }, [previewImageUri]);

  const billNumberText = useMemo(() => {
    const v = bill?.billNumber;
    return typeof v === 'string' && v.trim() ? v.trim() : '—';
  }, [bill?.billNumber]);

  const customerNameText = useMemo(() => {
    const v = bill?.customerName;
    return typeof v === 'string' && v.trim() ? v.trim() : '—';
  }, [bill?.customerName]);

  const totalAmount = useMemo(() => {
    const v = bill?.totalAmount;
    return typeof v === 'number' ? v : 0;
  }, [bill?.totalAmount]);

  const renderMessage = (text: string, kind: 'muted' | 'error') => {
    const textStyle = kind === 'error' ? styles.errorText : styles.mutedText;
    return React.createElement(
      View,
      { style: styles.messageCard },
      React.createElement(Text, { style: textStyle }, text)
    );
  };

  const detailsCard = bill
    ? React.createElement(
        View,
        { style: styles.card },
        React.createElement(
          View,
          { style: styles.rowBetween },
          React.createElement(Text, { style: styles.cardTitle }, 'Status'),
          React.createElement(
            View,
            { style: styles.badge },
            React.createElement(Text, { style: styles.badgeText }, statusText)
          )
        ),
        React.createElement(
          View,
          { style: styles.userRow },
          React.createElement(Text, { style: styles.metaText }, `User UID: ${uidText}`),
          React.createElement(
            Pressable,
            {
              onPress: billUserId ? () => setUserProfileVisible(true) : undefined,
              style: [styles.viewUserButton, !billUserId ? styles.viewUserButtonDisabled : null],
              disabled: !billUserId,
            },
            React.createElement(
              Text,
              { style: [styles.viewUserButtonText, !billUserId ? styles.viewUserButtonTextDisabled : null] },
              'View User'
            )
          )
        ),
        React.createElement(Text, { style: styles.metaText }, `Bill Number: ${billNumberText}`),
        React.createElement(Text, { style: styles.metaText }, `Customer Name: ${customerNameText}`),
        React.createElement(Text, { style: styles.metaText }, `Created: ${createdAtText}`),
        React.createElement(Text, { style: styles.metaText }, `Updated: ${updatedAtText}`),
        approvedCoinsText
          ? React.createElement(Text, { style: styles.metaText }, `Approved Coins: ${approvedCoinsText}`)
          : null,
        React.createElement(
          View,
          { style: styles.statsRow },
          React.createElement(
            View,
            { style: styles.statBox },
            React.createElement(Text, { style: styles.statLabel }, 'Customer'),
            React.createElement(Text, { style: styles.statValue }, String(customerNameText))
          ),
          React.createElement(
            View,
            { style: styles.statBoxLast },
            React.createElement(Text, { style: styles.statLabel }, 'Total Amount'),
            React.createElement(Text, { style: styles.statValue }, String(totalAmount))
          )
        )
      )
    : null;

  const imagesCard = bill
    ? React.createElement(
        View,
        { style: styles.card },
        React.createElement(Text, { style: styles.cardTitle }, 'Images'),
        React.createElement(Text, { style: styles.metaText }, `Count: ${images.length}`),
        images.length
          ? React.createElement(
              ScrollView,
              {
                horizontal: true,
                showsHorizontalScrollIndicator: false,
                contentContainerStyle: styles.imagesRow,
              },
              images.map((uri, idx) =>
                React.createElement(
                  Pressable,
                  { key: `${uri}-${idx}`, style: styles.imageWrap, onPress: () => openImagePreview(uri) },
                  React.createElement(Image, { source: { uri }, style: styles.image })
                )
              )
            )
          : React.createElement(Text, { style: styles.mutedText }, 'No images')
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
      : !bill
        ? renderMessage('No data', 'muted')
        : React.createElement(React.Fragment, null, detailsCard, imagesCard);

  return React.createElement(
    Modal,
    { visible, animationType: 'slide', transparent: true, onRequestClose: closeAll },
    React.createElement(
      View,
      { style: styles.backdrop },
      React.createElement(Pressable, { style: styles.backdropPressArea, onPress: closeAll }),
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
                React.createElement(FileText, { color: '#dc2626', size: 20 })
              ),
              React.createElement(
                View,
                { style: styles.headerTextWrap },
                React.createElement(Text, { style: styles.headerTitle }, 'Bill Profile'),
                React.createElement(Text, { style: styles.headerSubtitle }, `Bill ID: ${headerBillId}`)
              ),
              React.createElement(
                Pressable,
                {
                  onPress: billUserId ? () => setUserProfileVisible(true) : undefined,
                  style: [styles.userButton, !billUserId ? styles.userButtonDisabled : null],
                  disabled: !billUserId,
                },
                React.createElement(User, { color: billUserId ? '#111827' : '#9ca3af', size: 16 }),
                React.createElement(Text, { style: [styles.userButtonText, !billUserId ? styles.userButtonTextDisabled : null] }, 'User')
              ),
              React.createElement(
                Pressable,
                { onPress: closeAll, style: styles.closeButton },
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
      ),
      React.createElement(UserProfileModal, {
        visible: userProfileVisible,
        userId: billUserId,
        onClose: () => setUserProfileVisible(false),
      }),
      React.createElement(
        Modal,
        { visible: imagePreviewVisible, animationType: 'fade', transparent: true, onRequestClose: closeImagePreview },
        React.createElement(
          View,
          { style: styles.previewBackdrop },
          React.createElement(
            SafeAreaView,
            { edges: ['top', 'bottom'], style: styles.previewSafeArea },
            React.createElement(
              View,
              { style: styles.previewHeader },
              React.createElement(
                Pressable,
                { onPress: openDownload, style: styles.previewHeaderButton, disabled: !previewImageUri },
                React.createElement(Download, { color: previewImageUri ? '#ffffff' : '#6b7280', size: 18 }),
                React.createElement(Text, { style: styles.previewHeaderButtonText }, 'Download')
              ),
              React.createElement(
                Pressable,
                { onPress: closeImagePreview, style: styles.previewCloseButton },
                React.createElement(X, { color: '#ffffff', size: 18 })
              )
            ),
            React.createElement(
              View,
              { style: styles.previewBody },
              previewImageUri
                ? React.createElement(
                    GestureDetector,
                    { gesture: combinedGesture },
                    React.createElement(
                      Animated.View,
                      { style: styles.previewImageWrap },
                      React.createElement(Animated.Image, {
                        source: { uri: previewImageUri },
                        style: [styles.previewImage, previewAnimatedStyle],
                        resizeMode: 'contain',
                      })
                    )
                  )
                : null
            )
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
    maxHeight: '86%',
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
  userButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 36,
    marginRight: 10,
  },
  userButtonDisabled: {
    backgroundColor: '#f3f4f6',
  },
  userButtonText: {
    marginLeft: 6,
    color: '#111827',
    fontWeight: '800',
    fontSize: 12,
  },
  userButtonTextDisabled: {
    color: '#9ca3af',
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
    marginTop: 10,
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
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  viewUserButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  viewUserButtonDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.6,
  },
  viewUserButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 11,
  },
  viewUserButtonTextDisabled: {
    color: '#9ca3af',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  badge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 11,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginRight: 8,
  },
  statBoxLast: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '700',
  },
  statValue: {
    marginTop: 6,
    fontSize: 16,
    color: '#111827',
    fontWeight: '800',
  },
  imagesRow: {
    paddingTop: 10,
    paddingBottom: 2,
  },
  imageWrap: {
    marginRight: 10,
  },
  image: {
    width: 160,
    height: 160,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  previewSafeArea: {
    flex: 1,
  },
  previewHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  previewHeaderButtonText: {
    marginLeft: 8,
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  previewCloseButton: {
    height: 40,
    width: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  previewBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingBottom: 18,
  },
  previewImageWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  itemsWrap: {
    marginTop: 10,
  },
  itemRow: {
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  itemName: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 13,
  },
  itemMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  itemMeta: {
    color: '#6b7280',
    fontWeight: '700',
    fontSize: 11,
  },
});
