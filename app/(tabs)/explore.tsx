import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Bell, Search } from 'lucide-react-native';

import { db } from '@/Globalservices/firebase';
import NotificationsPopup from '@/components/user/NotificationsPopup';
import { useUserStore } from '@/Globalservices/userStore';
import { collection, getDocs, limit, orderBy, query, where, type QueryDocumentSnapshot } from 'firebase/firestore/lite';

type ProductRecord = {
  name?: string | null;
  description?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  createdAt?: number | null;
};

type ProductRow = {
  id: string;
  data: ProductRecord;
};

export default function ProductsScreen() {
  const user = useUserStore((s) => s.user);
  const uid = typeof user?.uid === 'string' ? user.uid : null;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [rows, setRows] = useState<ProductRow[]>([]);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsHasUnread, setNotificationsHasUnread] = useState(false);

  const [selectedRow, setSelectedRow] = useState<ProductRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const snap = await getDocs(query(collection(db, 'Products'), orderBy('createdAt', 'desc')));
      const nextRows = snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, data: d.data() as ProductRecord }));
      setRows(nextRows);
    } catch {
      setErrorText('Unable to load products right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProducts();
    void refreshUnreadNotifications();
  }, [fetchProducts, refreshUnreadNotifications]);

  const refreshScreen = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchProducts();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchProducts, isRefreshing]);

  const openDetails = useCallback((row: ProductRow) => {
    setSelectedRow(row);
    setDetailOpen(true);
  }, []);

  const closeDetails = useCallback(() => {
    setDetailOpen(false);
    setSelectedRow(null);
  }, []);

  const selectedName = useMemo(() => {
    const v = selectedRow?.data.name;
    return typeof v === 'string' && v.trim() ? v.trim() : '—';
  }, [selectedRow?.data.name]);

  const selectedDescription = useMemo(() => {
    const v = selectedRow?.data.description;
    return typeof v === 'string' && v.trim() ? v.trim() : '';
  }, [selectedRow?.data.description]);

  const selectedPriceLabel = useMemo(() => {
    const v = selectedRow?.data.price;
    return typeof v === 'number' && Number.isFinite(v) ? `₹ ${v}` : '₹ —';
  }, [selectedRow?.data.price]);

  const selectedImageUrl = useMemo(() => {
    const v = selectedRow?.data.imageUrl;
    return typeof v === 'string' && v ? v : null;
  }, [selectedRow?.data.imageUrl]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshScreen}
            tintColor="#dc2626"
            colors={['#dc2626']}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>Products</Text>
            <Text style={styles.subtitle}>Tap any product for details</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconButton}
              onPress={() => router.push({ pathname: '/search', params: { type: 'products' } } as never)}
            >
              <Search color="#111827" size={18} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => setNotificationsOpen(true)}>
              <Bell color="#111827" size={18} />
              {notificationsHasUnread ? <View style={styles.bellDot} /> : null}
            </Pressable>
          </View>
        </View>

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#dc2626" />
          </View>
        ) : rows.length ? (
          <View style={styles.list}>
            {rows.map((row) => {
              const name = typeof row.data.name === 'string' && row.data.name.trim() ? row.data.name.trim() : '—';
              const priceValue = typeof row.data.price === 'number' && Number.isFinite(row.data.price) ? row.data.price : null;
              const priceLabel = priceValue !== null ? `₹ ${priceValue}` : '₹ —';
              const imageUrl = typeof row.data.imageUrl === 'string' ? row.data.imageUrl : null;

              return (
                <Pressable key={row.id} style={styles.card} onPress={() => openDetails(row)}>
                  <View style={styles.cardRow}>
                    <View style={styles.cardImageWrap}>
                      {imageUrl ? (
                        <Image source={{ uri: imageUrl }} style={styles.cardImage} />
                      ) : (
                        <View style={styles.cardImageFallback} />
                      )}
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={styles.cardPrice}>{priceLabel}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No products yet</Text>
            <Text style={styles.emptySubtitle}>Please check again later.</Text>
          </View>
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

      <Modal visible={detailOpen} transparent animationType="slide" onRequestClose={closeDetails}>
        <Pressable style={styles.backdrop} onPress={closeDetails}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <SafeAreaView edges={['top', 'bottom']} style={styles.sheetSafeArea}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {selectedName}
                </Text>
                <Pressable onPress={closeDetails} style={styles.closeButton}>
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailImageWrap}>
                  {selectedImageUrl ? (
                    <Image source={{ uri: selectedImageUrl }} style={styles.detailImage} />
                  ) : (
                    <View style={styles.detailImageFallback} />
                  )}
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailPrice}>{selectedPriceLabel}</Text>
                  {selectedDescription ? <Text style={styles.detailDescription}>{selectedDescription}</Text> : null}
                </View>
              </ScrollView>
            </SafeAreaView>
          </Pressable>
        </Pressable>
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
    paddingBottom: 26,
  },
  header: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#dc2626',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  errorText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
  },
  loadingWrap: {
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    marginTop: 16,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardImageWrap: {
    height: 56,
    width: 56,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  cardImage: {
    height: '100%',
    width: '100%',
  },
  cardImageFallback: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  cardPrice: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#dc2626',
  },
  emptyWrap: {
    marginTop: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#6b7280',
    textAlign: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '92%',
    overflow: 'hidden',
  },
  sheetSafeArea: {
    flex: 1,
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  closeButton: {
    height: 38,
    width: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  closeText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#6b7280',
    lineHeight: 22,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  detailImageWrap: {
    marginTop: 6,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  detailImage: {
    height: 220,
    width: '100%',
  },
  detailImageFallback: {
    height: 220,
    width: '100%',
    backgroundColor: '#f3f4f6',
  },
  detailCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    padding: 14,
    backgroundColor: '#ffffff',
  },
  detailPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: '#dc2626',
  },
  detailDescription: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    lineHeight: 18,
  },
});
