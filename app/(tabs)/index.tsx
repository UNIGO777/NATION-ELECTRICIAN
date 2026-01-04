import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Coins, Gift, Package, Upload } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import NotificationsPopup from '@/components/user/NotificationsPopup';
import { db, storage } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';

type WalletDoc = {
  uid?: string | null;
  coins?: number | null;
  updatedAt?: number | null;
};

type HistoryItem = {
  id: string;
  title: string;
  subtitle: string;
  pointsText: string;
  pointsColor: string;
};

type PosterDoc = {
  id?: string | null;
  imageUrl?: string | null;
  enabled?: boolean | null;
  createdAt?: number | null;
};

const PAGE_SIZE = 10;

export default function HomeScreen() {
  const user = useUserStore((s) => s.user);
  const uid = user?.uid ?? null;

  const [walletCoins, setWalletCoins] = useState<number>(0);
  const [walletLoading, setWalletLoading] = useState(false);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsHasUnread, setNotificationsHasUnread] = useState(false);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(null);

  const [posters, setPosters] = useState<PosterDoc[]>([]);
  const [postersLoading, setPostersLoading] = useState(false);
  const [postersErrorMessage, setPostersErrorMessage] = useState<string | null>(null);

  const historyCursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const historyHasMoreRef = useRef(false);
  const historyLoadingRef = useRef(false);
  const historyLoadingMoreRef = useRef(false);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [billImageUris, setBillImageUris] = useState<string[]>([]);
  const [billNumber, setBillNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [billTotalAmount, setBillTotalAmount] = useState('');
  const [billSubmitting, setBillSubmitting] = useState(false);

  const resetBillForm = useCallback(() => {
    setBillImageUris([]);
    setBillNumber('');
    setCustomerName('');
    setBillTotalAmount('');
    setBillSubmitting(false);
  }, []);

  const closeUpload = useCallback(() => {
    setIsUploadOpen(false);
    resetBillForm();
  }, [resetBillForm]);

  const pickBillImages = useCallback(async () => {
    if (billSubmitting) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to select bill images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });

    if (result.canceled) return;
    const uris = result.assets.map((a) => a.uri).filter(Boolean);
    setBillImageUris(uris);
  }, [billSubmitting]);

  const formatDateLabel = useCallback((value: unknown): string => {
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

    return '';
  }, []);

  const fetchWallet = useCallback(async () => {
    if (!uid) return;
    setWalletLoading(true);
    try {
      const q = query(collection(db, 'Wallet'), where('uid', '==', uid), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        setWalletCoins(0);
        return;
      }

      const data = snap.docs[0].data() as WalletDoc;
      const coins = typeof data.coins === 'number' ? data.coins : 0;
      setWalletCoins(coins);
    } catch {
      setWalletCoins(0);
    } finally {
      setWalletLoading(false);
    }
  }, [uid]);

  const refreshUnreadNotifications = useCallback(async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'Notifications'), where('uid', '==', uid), where('read', '==', false), limit(1));
      const snap = await getDocs(q);
      setNotificationsHasUnread(!snap.empty);
    } catch {
      setNotificationsHasUnread(false);
    }
  }, [uid]);

  const fetchPosters = useCallback(async () => {
    setPostersLoading(true);
    setPostersErrorMessage(null);
    try {
      const snap = await getDocs(query(collection(db, 'Posters'), orderBy('createdAt', 'desc'), limit(10)));
      const next = snap.docs
        .map((d) => d.data() as PosterDoc)
        .filter((p) => p && (p.enabled ?? true) && typeof p.imageUrl === 'string' && Boolean(p.imageUrl));
      setPosters(next);
    } catch {
      setPosters([]);
      setPostersErrorMessage('Unable to load latest updates right now.');
    } finally {
      setPostersLoading(false);
    }
  }, []);

  const mapHistoryDoc = useCallback(
    (docSnap: QueryDocumentSnapshot): HistoryItem => {
      const data = docSnap.data() as Record<string, unknown>;
      const title =
        (typeof data.title === 'string' && data.title) ||
        (typeof data.type === 'string' && data.type) ||
        (typeof data.action === 'string' && data.action) ||
        (typeof data.description === 'string' && data.description) ||
        'Activity';

      const createdAtLabel =
        formatDateLabel(data.createdAt) ||
        formatDateLabel(data.updatedAt) ||
        formatDateLabel(data.timestamp) ||
        '—';

      const rawDelta =
        (typeof data.coinsDelta === 'number'
          ? data.coinsDelta
          : typeof data.pointsDelta === 'number'
            ? data.pointsDelta
            : typeof data.coins === 'number'
              ? data.coins
              : typeof data.points === 'number'
                ? data.points
                : 0) ?? 0;

      const isPositive = rawDelta >= 0;
      const coinsLabel =
        Number.isFinite(rawDelta) && rawDelta !== 0
          ? `${isPositive ? '+' : ''}${rawDelta} coins`
          : undefined;
      const subtitle = [createdAtLabel, coinsLabel].filter(Boolean).join(' • ');

      return {
        id: docSnap.id,
        title,
        subtitle,
        pointsText: '',
        pointsColor: isPositive ? '#dc2626' : '#6b7280',
      };
    },
    [formatDateLabel]
  );

  const fetchHistoryPage = useCallback(
    async (mode: 'reset' | 'more') => {
      if (!uid) return;
      if (mode === 'reset') setHistoryErrorMessage(null);
      if (mode === 'more') {
        if (historyLoadingMoreRef.current || historyLoadingRef.current || !historyHasMoreRef.current) return;
        historyLoadingMoreRef.current = true;
        setHistoryLoadingMore(true);
      } else {
        historyLoadingRef.current = true;
        setHistoryLoading(true);
      }

      try {
        const snap = await getDocs(query(collection(db, 'History'), where('uid', '==', uid), limit(PAGE_SIZE * 3)));
        const sortedDocs = snap.docs.sort((a, b) => {
          const ad = a.data() as Record<string, unknown>;
          const bd = b.data() as Record<string, unknown>;
          const av =
            (typeof ad.createdAt === 'number'
              ? ad.createdAt
              : typeof ad.updatedAt === 'number'
                ? ad.updatedAt
                : typeof ad.timestamp === 'number'
                  ? ad.timestamp
                  : 0) ?? 0;
          const bv =
            (typeof bd.createdAt === 'number'
              ? bd.createdAt
              : typeof bd.updatedAt === 'number'
                ? bd.updatedAt
                : typeof bd.timestamp === 'number'
                  ? bd.timestamp
                  : 0) ?? 0;
          return bv - av;
        });
        const items = sortedDocs.slice(0, PAGE_SIZE).map(mapHistoryDoc);
        historyCursorRef.current = null;
        historyHasMoreRef.current = false;
        setHistoryHasMore(false);
        setHistory(items);
        setHistoryErrorMessage(null);
      } catch {
        if (mode !== 'more') setHistory([]);
        historyCursorRef.current = null;
        historyHasMoreRef.current = false;
        setHistoryHasMore(false);
        setHistoryErrorMessage('Unable to load recent activity right now.');
      } finally {
        historyLoadingRef.current = false;
        historyLoadingMoreRef.current = false;
        setHistoryLoading(false);
        setHistoryLoadingMore(false);
      }
    },
    [mapHistoryDoc, uid]
  );

  useEffect(() => {
    if (!uid) return;
    void fetchWallet();
    void refreshUnreadNotifications();
    void fetchHistoryPage('reset');
    void fetchPosters();
  }, [fetchHistoryPage, fetchPosters, fetchWallet, refreshUnreadNotifications, uid]);

  const refreshScreen = useCallback(async () => {
    if (!uid || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([fetchWallet(), refreshUnreadNotifications(), fetchHistoryPage('reset')]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchHistoryPage, fetchWallet, isRefreshing, refreshUnreadNotifications, uid]);

  const submitBillUpload = useCallback(async () => {
    if (!uid) {
      Alert.alert('Not logged in', 'Please login first.');
      return;
    }
    const billNo = billNumber.trim();
    if (!billNo) {
      Alert.alert('Bill number required', 'Please enter bill number.');
      return;
    }

    const name = customerName.trim();
    if (!name) {
      Alert.alert('Customer name required', 'Please enter customer name.');
      return;
    }

    const amount = Number(billTotalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Total amount required', 'Please enter valid total amount.');
      return;
    }

    setBillSubmitting(true);
    try {
      const now = Date.now();
      if (!billImageUris.length) {
        Alert.alert('Bill images required', 'Please select at least 1 bill image.');
        return;
      }

      const billRef = doc(collection(db, 'Bills'));
      const imageUrls = await Promise.all(
        billImageUris.map(async (uri, idx) => {
          const normalized = uri.split('?')[0] ?? uri;
          const rawExt = normalized.split('.').pop()?.toLowerCase();
          const ext = rawExt && rawExt.length <= 5 ? rawExt : 'jpg';

          const res = await fetch(uri);
          const blob = await res.blob();
          const objectRef = storageRef(storage, `Bills/${uid}/${billRef.id}/${idx}.${ext}`);
          await uploadBytes(objectRef, blob, { contentType: blob.type || 'image/jpeg' });
          return getDownloadURL(objectRef);
        })
      );

      await setDoc(billRef, {
        uid,
        status: 'pending',
        billNumber: billNo,
        customerName: name,
        totalAmount: amount,
        images: imageUrls,
        createdAt: now,
        updatedAt: now,
      });

      await addDoc(collection(db, 'History'), {
        uid,
        title: 'Bill Uploaded',
        type: 'bill_upload',
        coinsDelta: 0,
        createdAt: now,
        billId: billRef.id,
        billNumber: billNo,
        totalAmount: amount,
      });

      Alert.alert('Uploaded', 'Your bill was uploaded successfully.');
      closeUpload();
      await fetchHistoryPage('reset');
    } catch {
      Alert.alert('Upload failed', 'Unable to upload bill right now. Please try again later.');
    } finally {
      setBillSubmitting(false);
    }
  }, [billImageUris, billNumber, billTotalAmount, closeUpload, customerName, fetchHistoryPage, uid]);

  const coinsText = useMemo(() => {
    return walletCoins.toLocaleString();
  }, [walletCoins]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshScreen}
            tintColor="#dc2626"
            colors={['#dc2626']}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Pressable style={styles.bellButton} onPress={() => setNotificationsOpen(true)}>
            <Bell color="#111827" size={20} />
            {notificationsHasUnread ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </View>

        <View style={styles.coinsCard}>
          <View style={styles.coinsTopRow}>
            <View>
              <Text style={styles.coinsLabel}>Total Coins</Text>
              {walletLoading ? (
                <View style={styles.walletLoadingRow}>
                  <ActivityIndicator color="#ffffff" />
                </View>
              ) : (
                <Text style={styles.coinsValue}>{coinsText}</Text>
              )}
              {!!uid && <Text style={styles.walletUid}>UID: {uid}</Text>}
            </View>
            <View style={styles.moneyCircle}>
              <Coins color="#ffffff" size={18} />
            </View>
          </View>

          <View style={styles.quickRow}>
            <Pressable style={styles.quickButton} onPress={() => setIsUploadOpen(true)}>
              <Upload color="#dc2626" size={18} />
              <Text style={styles.quickLabel}>Upload</Text>
            </Pressable>
            <Pressable style={styles.quickButton}>
              <Package color="#dc2626" size={18} />
              <Text style={styles.quickLabel}>Products</Text>
            </Pressable>
            <Pressable style={styles.quickButton}>
              <Gift color="#dc2626" size={18} />
              <Text style={styles.quickLabel}>Gifts</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Latest Updates</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bannersRow}
        >
          {postersLoading ? (
            <View style={styles.bannerCard}>
              <ActivityIndicator color="#dc2626" />
            </View>
          ) : postersErrorMessage ? (
            <View style={styles.bannerCard}>
              <Text style={styles.bannerText}>{postersErrorMessage}</Text>
            </View>
          ) : posters.length ? (
            posters.map((p, idx) => (
              <View key={(typeof p.id === 'string' && p.id) || String(idx)} style={styles.bannerCard}>
                <Image source={{ uri: String(p.imageUrl) }} style={styles.bannerImage} />
              </View>
            ))
          ) : (
            <View style={styles.bannerCard}>
              <Text style={styles.bannerText}>No updates yet</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.activityHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Pressable onPress={() => fetchHistoryPage('reset')}>
            <Text style={styles.viewAll}>Refresh</Text>
          </Pressable>
        </View>

        <View style={styles.activityList}>
          {historyLoading ? (
            <View style={styles.activityLoading}>
              <ActivityIndicator color="#dc2626" />
            </View>
          ) : historyErrorMessage ? (
            <View style={styles.emptyActivityCard}>
              <Text style={styles.emptyActivityTitle}>{historyErrorMessage}</Text>
              <Text style={styles.emptyActivitySubtitle}>
                Welcome! To earn coins upload bills and wait for admin response.
              </Text>
            </View>
          ) : history.length === 0 ? (
            <View style={styles.emptyActivityCard}>
              <Text style={styles.emptyActivityTitle}>No activity yet</Text>
              <Text style={styles.emptyActivitySubtitle}>
                Welcome! To earn coins upload bills and wait for admin response.
              </Text>
            </View>
          ) : (
            history.map((item) => (
              <View key={item.id} style={styles.activityItem}>
                <View style={styles.txCircle}>
                  <Text style={styles.txText}>Tx</Text>
                </View>
                <View style={styles.activityTextWrap}>
                  <Text style={styles.activityTitle}>{item.title}</Text>
                  <Text style={styles.activitySubtitle}>{item.subtitle}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {historyHasMore && !historyLoading && (
          <Pressable
            onPress={() => fetchHistoryPage('more')}
            disabled={historyLoadingMore}
            style={[styles.loadMoreButton, historyLoadingMore ? styles.loadMoreDisabled : null]}
          >
            {historyLoadingMore ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text style={styles.loadMoreText}>Load more</Text>
            )}
          </Pressable>
        )}
      </ScrollView>

      <NotificationsPopup
        visible={notificationsOpen}
        uid={uid}
        onClose={() => {
          setNotificationsOpen(false);
          void refreshUnreadNotifications();
        }}
      />

      <Modal visible={isUploadOpen} transparent animationType="slide" onRequestClose={closeUpload}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upload Bill</Text>
              <Pressable onPress={closeUpload} style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalSectionTitle}>Bill Images</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.modalHint}>{billImageUris.length} selected</Text>
                <Pressable onPress={pickBillImages} style={styles.primaryButtonSmall} disabled={billSubmitting}>
                  <Text style={styles.primaryButtonSmallText}>Select Images</Text>
                </Pressable>
              </View>

              <Text style={styles.modalSectionTitle}>Customer Name</Text>
              <TextInput
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Customer name"
                placeholderTextColor="#9ca3af"
                style={styles.input}
                editable={!billSubmitting}
              />

              <Text style={styles.modalSectionTitle}>Bill Number</Text>
              <TextInput
                value={billNumber}
                onChangeText={setBillNumber}
                placeholder="Bill number"
                placeholderTextColor="#9ca3af"
                style={styles.input}
                editable={!billSubmitting}
              />

              <Text style={styles.modalSectionTitle}>Total Amount</Text>
              <TextInput
                value={billTotalAmount}
                onChangeText={setBillTotalAmount}
                placeholder="Total amount"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                style={styles.input}
                editable={!billSubmitting}
              />

              <Pressable
                onPress={submitBillUpload}
                disabled={billSubmitting}
                style={[styles.submitButton, billSubmitting ? styles.submitButtonDisabled : null]}
              >
                {billSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitButtonText}>Upload Bill</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 24,
  },
  header: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  bellButton: {
    height: 40,
    width: 40,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    right: 10,
    top: 10,
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: '#dc2626',
  },
  coinsCard: {
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: '#111827',
    padding: 18,
  },
  coinsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  coinsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9ca3af',
  },
  walletLoadingRow: {
    marginTop: 14,
    height: 44,
    justifyContent: 'center',
  },
  coinsValue: {
    marginTop: 10,
    fontSize: 44,
    fontWeight: '900',
    color: '#ffffff',
  },
  walletUid: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
  },
  moneyCircle: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
  },
  quickButton: {
    flex: 1,
    backgroundColor: '#1f2937',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#d1d5db',
  },
  sectionTitle: {
    marginTop: 18,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  bannersRow: {
    paddingTop: 12,
    paddingBottom: 2,
    gap: 14,
  },
  bannerCard: {
    width: 240,
    height: 140,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bannerImage: {
    height: '100%',
    width: '100%',
    resizeMode: 'cover',
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9ca3af',
  },
  activityHeader: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
  },
  activityList: {
    marginTop: 10,
    gap: 12,
  },
  activityLoading: {
    paddingVertical: 20,
  },
  emptyActivityCard: {
    borderRadius: 16,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptyActivityTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },
  emptyActivitySubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  txCircle: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6b7280',
  },
  activityTextWrap: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  activitySubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
  },
  activityPoints: {
    fontSize: 14,
    fontWeight: '900',
    color: '#dc2626',
  },
  loadMoreButton: {
    marginTop: 14,
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  loadMoreDisabled: {
    opacity: 0.6,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#dc2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 14,
    maxHeight: '92%',
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  modalCloseButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  modalCloseText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 12,
    gap: 12,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },
  modalHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryButtonSmall: {
    borderRadius: 12,
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButtonSmallText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 10,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
  },
  itemField: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6b7280',
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  removeItemButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  removeItemText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6b7280',
  },
  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#dc2626',
  },
  submitButton: {
    borderRadius: 14,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
  },
});
