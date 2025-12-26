import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, DollarSign, Gift, Package, Upload } from 'lucide-react-native';

import * as ImagePicker from 'expo-image-picker';

import NotificationsPopup from '@/components/user/NotificationsPopup';
import { db, storage } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

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

type BillItemForm = {
  id: string;
  name: string;
  quantity: string;
  price: string;
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

  const historyCursorRef = useRef<QueryDocumentSnapshot | null>(null);
  const historyHasMoreRef = useRef(false);
  const historyLoadingRef = useRef(false);
  const historyLoadingMoreRef = useRef(false);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [billImageUris, setBillImageUris] = useState<string[]>([]);
  const [billItems, setBillItems] = useState<BillItemForm[]>([
    { id: String(Date.now()), name: '', quantity: '1', price: '' },
  ]);
  const [billSubmitting, setBillSubmitting] = useState(false);

  const resetBillForm = useCallback(() => {
    setBillImageUris([]);
    setBillItems([{ id: String(Date.now()), name: '', quantity: '1', price: '' }]);
    setBillSubmitting(false);
  }, []);

  const closeUpload = useCallback(() => {
    setIsUploadOpen(false);
    resetBillForm();
  }, [resetBillForm]);

  const pickBillImages = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission required', 'Please allow photo access to upload bill images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.9,
      selectionLimit: 10,
    });

    if (result.canceled) return;
    const uris = result.assets.map((a) => a.uri).filter(Boolean);
    setBillImageUris(uris);
  }, []);

  const updateBillItem = useCallback((id: string, patch: Partial<Omit<BillItemForm, 'id'>>) => {
    setBillItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const addBillItem = useCallback(() => {
    setBillItems((prev) => [...prev, { id: String(Date.now() + prev.length), name: '', quantity: '1', price: '' }]);
  }, []);

  const removeBillItem = useCallback((id: string) => {
    setBillItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      return next.length ? next : [{ id: String(Date.now()), name: '', quantity: '1', price: '' }];
    });
  }, []);

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
        const base = query(
          collection(db, 'History'),
          where('uid', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(PAGE_SIZE)
        );

        const q =
          mode === 'more' && historyCursorRef.current
            ? query(
                collection(db, 'History'),
                where('uid', '==', uid),
                orderBy('createdAt', 'desc'),
                startAfter(historyCursorRef.current),
                limit(PAGE_SIZE)
              )
            : base;

        const snap = await getDocs(q);
        const items = snap.docs.map(mapHistoryDoc);

        const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
        const hasMore = snap.docs.length === PAGE_SIZE;

        historyCursorRef.current = nextCursor;
        historyHasMoreRef.current = hasMore;
        setHistoryHasMore(hasMore);
        setHistory((prev) => (mode === 'more' ? [...prev, ...items] : items));
      } catch {
        try {
          const snap2 = await getDocs(query(collection(db, 'History'), where('uid', '==', uid), limit(PAGE_SIZE)));
          const sortedDocs = snap2.docs.sort((a, b) => {
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
          const items2 = sortedDocs.slice(0, PAGE_SIZE).map(mapHistoryDoc);
          historyCursorRef.current = null;
          historyHasMoreRef.current = false;
          setHistoryHasMore(false);
          setHistory(items2);
          setHistoryErrorMessage(null);
        } catch {
          if (mode !== 'more') setHistory([]);
          historyCursorRef.current = null;
          historyHasMoreRef.current = false;
          setHistoryHasMore(false);
          setHistoryErrorMessage('Unable to load recent activity right now.');
        }
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
  }, [fetchHistoryPage, fetchWallet, refreshUnreadNotifications, uid]);

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
    if (!billImageUris.length) {
      Alert.alert('Bill images required', 'Please select at least one bill image.');
      return;
    }

    const normalizedItems = billItems
      .map((i) => {
        const name = i.name.trim();
        const quantity = Number(i.quantity);
        const price = Number(i.price);
        return {
          name,
          quantity: Number.isFinite(quantity) ? quantity : 0,
          price: Number.isFinite(price) ? price : 0,
        };
      })
      .filter((i) => i.name && i.quantity > 0 && i.price >= 0);

    if (!normalizedItems.length) {
      Alert.alert('Items required', 'Please add at least one item with quantity and price.');
      return;
    }

    setBillSubmitting(true);
    try {
      const now = Date.now();
      const uploadFolder = `bills/${uid}/${now}`;
      const imageUrls: string[] = [];

      for (let index = 0; index < billImageUris.length; index += 1) {
        const uri = billImageUris[index];
        const response = await fetch(uri);
        const blob = await response.blob();
        const imageRef = ref(storage, `${uploadFolder}/${index}.jpg`);
        await uploadBytes(imageRef, blob);
        const url = await getDownloadURL(imageRef);
        imageUrls.push(url);
      }

      const totals = normalizedItems.reduce(
        (acc, item) => {
          return {
            totalQuantity: acc.totalQuantity + item.quantity,
            totalAmount: acc.totalAmount + item.quantity * item.price,
          };
        },
        { totalQuantity: 0, totalAmount: 0 }
      );

      const billRef = await addDoc(collection(db, 'Bills'), {
        uid,
        status: 'pending',
        images: imageUrls,
        items: normalizedItems,
        totalQuantity: totals.totalQuantity,
        totalAmount: totals.totalAmount,
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
      });

      Alert.alert('Uploaded', 'Your bill was uploaded successfully.');
      closeUpload();
      await fetchHistoryPage('reset');
    } catch {
      Alert.alert('Upload failed', 'Unable to upload bill right now. Please try again later.');
    } finally {
      setBillSubmitting(false);
    }
  }, [billImageUris, billItems, closeUpload, fetchHistoryPage, uid]);

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
              <DollarSign color="#ffffff" size={18} />
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
          <View style={styles.bannerCard}>
            <Text style={styles.bannerText}>Banner Placeholder 1</Text>
          </View>
          <View style={styles.bannerCard}>
            <Text style={styles.bannerText}>Banner Placeholder 2</Text>
          </View>
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

              <Text style={styles.modalSectionTitle}>Items</Text>
              {billItems.map((item) => (
                <View key={item.id} style={styles.itemCard}>
                  <TextInput
                    value={item.name}
                    onChangeText={(t) => updateBillItem(item.id, { name: t })}
                    placeholder="Item name"
                    placeholderTextColor="#9ca3af"
                    style={styles.input}
                    editable={!billSubmitting}
                  />

                  <View style={styles.itemRow}>
                    <View style={styles.itemField}>
                      <Text style={styles.inputLabel}>Qty</Text>
                      <TextInput
                        value={item.quantity}
                        onChangeText={(t) => updateBillItem(item.id, { quantity: t })}
                        placeholder="1"
                        placeholderTextColor="#9ca3af"
                        keyboardType={Platform.select({ ios: 'number-pad', android: 'numeric', default: 'numeric' })}
                        style={styles.input}
                        editable={!billSubmitting}
                      />
                    </View>
                    <View style={styles.itemField}>
                      <Text style={styles.inputLabel}>Price</Text>
                      <TextInput
                        value={item.price}
                        onChangeText={(t) => updateBillItem(item.id, { price: t })}
                        placeholder="0"
                        placeholderTextColor="#9ca3af"
                        keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
                        style={styles.input}
                        editable={!billSubmitting}
                      />
                    </View>
                  </View>

                  <Pressable
                    onPress={() => removeBillItem(item.id)}
                    disabled={billSubmitting}
                    style={styles.removeItemButton}
                  >
                    <Text style={styles.removeItemText}>Remove</Text>
                  </Pressable>
                </View>
              ))}

              <Pressable onPress={addBillItem} style={styles.secondaryButton} disabled={billSubmitting}>
                <Text style={styles.secondaryButtonText}>Add Item</Text>
              </Pressable>

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
