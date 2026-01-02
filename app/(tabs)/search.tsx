import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Bell, Search as SearchIcon } from 'lucide-react-native';

import NotificationsPopup from '@/components/user/NotificationsPopup';
import { db } from '@/Globalservices/firebase';
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

type RewardItem = {
  name: string;
  price: number;
};

type SchemeRecord = {
  title?: string | null;
  requiredCoins?: number | null;
  rewardItems?: unknown[] | null;
  posterUrl?: string | null;
  createdAt?: number | null;
};

type SchemeRow = {
  id: string;
  data: SchemeRecord;
};

type SearchType = 'products' | 'schemes';

const normalizeRewardItems = (raw: unknown): RewardItem[] => {
  if (!Array.isArray(raw)) return [];
  const items: RewardItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const price = typeof record.price === 'number' ? record.price : Number(record.price);
    if (!name) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    items.push({ name, price });
  }
  return items;
};

const formatRewardPreview = (raw: unknown): string => {
  const items = normalizeRewardItems(raw);
  if (!items.length) return '-';
  return items
    .slice(0, 3)
    .map((i) => `${i.name} (₹ ${i.price})`)
    .join(', ');
};

export default function SearchScreen() {
  const user = useUserStore((s) => s.user);
  const uid = typeof user?.uid === 'string' ? user.uid : null;
  const params = useLocalSearchParams();

  const initialType = useMemo((): SearchType => {
    const raw = params.type;
    const v = Array.isArray(raw) ? raw[0] : raw;
    return v === 'schemes' ? 'schemes' : 'products';
  }, [params.type]);

  const [activeType, setActiveType] = useState<SearchType>(initialType);
  const [queryText, setQueryText] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [schemes, setSchemes] = useState<SchemeRow[]>([]);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsHasUnread, setNotificationsHasUnread] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [selectedScheme, setSelectedScheme] = useState<SchemeRow | null>(null);
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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const [productSnap, schemesSnap] = await Promise.all([
        getDocs(query(collection(db, 'Products'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'Schemes'), orderBy('createdAt', 'desc'))),
      ]);

      setProducts(
        productSnap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, data: d.data() as ProductRecord }))
      );
      setSchemes(
        schemesSnap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, data: d.data() as SchemeRecord }))
      );
    } catch {
      setErrorText('Unable to load search data right now.');
      setProducts([]);
      setSchemes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setActiveType(initialType);
  }, [initialType]);

  useEffect(() => {
    void fetchAll();
    void refreshUnreadNotifications();
  }, [fetchAll, refreshUnreadNotifications]);

  const normalizedQuery = useMemo(() => queryText.trim().toLowerCase(), [queryText]);

  const filteredProducts = useMemo(() => {
    if (!normalizedQuery) return products;
    return products.filter((row) => {
      const nameValue = typeof row.data.name === 'string' ? row.data.name : '';
      const descValue = typeof row.data.description === 'string' ? row.data.description : '';
      const priceValue = typeof row.data.price === 'number' ? String(row.data.price) : '';
      const haystack = `${nameValue} ${descValue} ${priceValue}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, products]);

  const filteredSchemes = useMemo(() => {
    if (!normalizedQuery) return schemes;
    return schemes.filter((row) => {
      const titleValue = typeof row.data.title === 'string' ? row.data.title : '';
      const requiredCoinsValue = typeof row.data.requiredCoins === 'number' ? String(row.data.requiredCoins) : '';
      const rewardsValue = formatRewardPreview(row.data.rewardItems);
      const haystack = `${titleValue} ${requiredCoinsValue} ${rewardsValue}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, schemes]);

  const listItems = activeType === 'products' ? filteredProducts : filteredSchemes;

  const openProduct = useCallback((row: ProductRow) => {
    setSelectedScheme(null);
    setSelectedProduct(row);
    setDetailOpen(true);
  }, []);

  const openScheme = useCallback((row: SchemeRow) => {
    setSelectedProduct(null);
    setSelectedScheme(row);
    setDetailOpen(true);
  }, []);

  const closeDetails = useCallback(() => {
    setDetailOpen(false);
    setSelectedProduct(null);
    setSelectedScheme(null);
  }, []);

  const selectedProductName = useMemo(() => {
    const v = selectedProduct?.data.name;
    return typeof v === 'string' && v.trim() ? v.trim() : '—';
  }, [selectedProduct?.data.name]);

  const selectedProductDescription = useMemo(() => {
    const v = selectedProduct?.data.description;
    return typeof v === 'string' && v.trim() ? v.trim() : '';
  }, [selectedProduct?.data.description]);

  const selectedProductPriceLabel = useMemo(() => {
    const v = selectedProduct?.data.price;
    return typeof v === 'number' && Number.isFinite(v) ? `₹ ${v}` : '₹ —';
  }, [selectedProduct?.data.price]);

  const selectedProductImageUrl = useMemo(() => {
    const v = selectedProduct?.data.imageUrl;
    return typeof v === 'string' && v ? v : null;
  }, [selectedProduct?.data.imageUrl]);

  const selectedSchemeTitle = useMemo(() => {
    const v = selectedScheme?.data.title;
    return typeof v === 'string' && v.trim() ? v.trim() : '—';
  }, [selectedScheme?.data.title]);

  const selectedSchemePosterUrl = useMemo(() => {
    const v = selectedScheme?.data.posterUrl;
    return typeof v === 'string' && v ? v : null;
  }, [selectedScheme?.data.posterUrl]);

  const selectedSchemeRequiredCoins = useMemo(() => {
    const v = selectedScheme?.data.requiredCoins;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, [selectedScheme?.data.requiredCoins]);

  const selectedSchemeRewards = useMemo(() => normalizeRewardItems(selectedScheme?.data.rewardItems), [selectedScheme?.data.rewardItems]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Search</Text>
          <Text style={styles.subtitle}>Products and Schemes</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => setNotificationsOpen(true)}>
          <Bell color="#111827" size={18} />
          {notificationsHasUnread ? <View style={styles.bellDot} /> : null}
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchIconWrap}>
          <SearchIcon color="#6b7280" size={18} />
        </View>
        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder={activeType === 'products' ? 'Search products...' : 'Search schemes...'}
          placeholderTextColor="#9ca3af"
          style={styles.searchInput}
        />
      </View>

      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleButton, activeType === 'products' ? styles.toggleActive : null]}
          onPress={() => setActiveType('products')}
        >
          <Text style={[styles.toggleText, activeType === 'products' ? styles.toggleTextActive : null]}>Products</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, activeType === 'schemes' ? styles.toggleActive : null]}
          onPress={() => setActiveType('schemes')}
        >
          <Text style={[styles.toggleText, activeType === 'schemes' ? styles.toggleTextActive : null]}>Schemes</Text>
        </Pressable>
      </View>

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#dc2626" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {listItems.length ? (
            activeType === 'products' ? (
              (listItems as ProductRow[]).map((row) => {
                const name = typeof row.data.name === 'string' && row.data.name.trim() ? row.data.name.trim() : '—';
                const priceValue = typeof row.data.price === 'number' && Number.isFinite(row.data.price) ? row.data.price : null;
                const priceLabel = priceValue !== null ? `₹ ${priceValue}` : '₹ —';
                const imageUrl = typeof row.data.imageUrl === 'string' ? row.data.imageUrl : null;

                return (
                  <Pressable key={row.id} style={styles.card} onPress={() => openProduct(row)}>
                    <View style={styles.cardRow}>
                      <View style={styles.thumbWrap}>
                        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.thumb} /> : <View style={styles.thumbFallback} />}
                      </View>
                      <View style={styles.cardBody}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.cardMeta}>{priceLabel}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })
            ) : (
              (listItems as SchemeRow[]).map((row) => {
                const title = typeof row.data.title === 'string' && row.data.title.trim() ? row.data.title.trim() : '—';
                const requiredCoins =
                  typeof row.data.requiredCoins === 'number' && Number.isFinite(row.data.requiredCoins) ? row.data.requiredCoins : null;
                const rewardLabel = formatRewardPreview(row.data.rewardItems);
                const posterUrl = typeof row.data.posterUrl === 'string' ? row.data.posterUrl : null;

                return (
                  <Pressable key={row.id} style={styles.card} onPress={() => openScheme(row)}>
                    <View style={styles.cardRow}>
                      <View style={styles.thumbWrap}>
                        {posterUrl ? <Image source={{ uri: posterUrl }} style={styles.thumb} /> : <View style={styles.thumbFallback} />}
                      </View>
                      <View style={styles.cardBody}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          Required Coins: {requiredCoins !== null ? requiredCoins : '—'}
                        </Text>
                        <Text style={styles.cardHint} numberOfLines={2}>
                          {rewardLabel}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No results</Text>
              <Text style={styles.emptySubtitle}>Try a different keyword.</Text>
            </View>
          )}
        </ScrollView>
      )}

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
                  {selectedProduct ? selectedProductName : selectedSchemeTitle}
                </Text>
                <Pressable onPress={closeDetails} style={styles.closeButton}>
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
                {selectedProduct ? (
                  <>
                    <View style={styles.detailImageWrap}>
                      {selectedProductImageUrl ? (
                        <Image source={{ uri: selectedProductImageUrl }} style={styles.detailImage} />
                      ) : (
                        <View style={styles.detailImageFallback} />
                      )}
                    </View>
                    <View style={styles.detailCard}>
                      <Text style={styles.detailPrimary}>{selectedProductPriceLabel}</Text>
                      {selectedProductDescription ? (
                        <Text style={styles.detailDescription}>{selectedProductDescription}</Text>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.detailImageWrap}>
                      {selectedSchemePosterUrl ? (
                        <Image source={{ uri: selectedSchemePosterUrl }} style={styles.detailImage} />
                      ) : (
                        <View style={styles.detailImageFallback} />
                      )}
                    </View>
                    <View style={styles.detailCard}>
                      <Text style={styles.detailLabel}>Required Coins</Text>
                      <Text style={styles.detailPrimary}>
                        {selectedSchemeRequiredCoins !== null ? String(selectedSchemeRequiredCoins) : '—'}
                      </Text>
                      <View style={styles.detailDivider} />
                      <Text style={styles.detailLabel}>Reward Items</Text>
                      {selectedSchemeRewards.length ? (
                        <View style={styles.rewardList}>
                          {selectedSchemeRewards.map((item, idx) => (
                            <View key={`${item.name}_${idx}`} style={styles.rewardRow}>
                              <Text style={styles.rewardName} numberOfLines={1}>
                                {item.name}
                              </Text>
                              <Text style={styles.rewardPrice}>₹ {item.price}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.detailMuted}>No reward items.</Text>
                      )}
                    </View>
                  </>
                )}
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
    paddingHorizontal: 20,
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
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
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
  searchRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
  },
  searchIconWrap: {
    paddingRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  toggleRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  toggleActive: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6b7280',
  },
  toggleTextActive: {
    color: '#dc2626',
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  list: {
    paddingTop: 16,
    paddingBottom: 26,
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
  thumbWrap: {
    height: 56,
    width: 56,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  thumb: {
    height: '100%',
    width: '100%',
  },
  thumbFallback: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  cardMeta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: '#6b7280',
  },
  cardHint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 34,
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
  detailPrimary: {
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
  detailLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#6b7280',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 12,
  },
  detailMuted: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },
  rewardList: {
    marginTop: 10,
    gap: 10,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  rewardName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  rewardPrice: {
    fontSize: 12,
    fontWeight: '900',
    color: '#dc2626',
  },
});
