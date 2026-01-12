import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Bell, Coins, Gift, Search } from 'lucide-react-native';

import { db, firebaseApp, firestoreDatabaseId } from '@/Globalservices/firebase';
import NotificationsPopup from '@/components/user/NotificationsPopup';
import { useT } from '@/Globalservices/i18n';
import { useUserStore } from '@/Globalservices/userStore';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { collection as collectionFull, doc as docFull, getDoc as getDocFull, getFirestore as getFirestoreFull, runTransaction } from 'firebase/firestore';

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

type WalletDoc = {
  uid?: string | null;
  coins?: number | null;
  updatedAt?: number | null;
};

type SchemeRequestDoc = {
  id?: string | null;
  uid?: string | null;
  schemeId?: string | null;
  status?: string | null;
  createdAt?: number | null;
};

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

export default function RewardsScreen() {
  const t = useT();
  const user = useUserStore((s) => s.user);
  const uid = typeof user?.uid === 'string' ? user.uid : null;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [rows, setRows] = useState<SchemeRow[]>([]);

  const [walletCoins, setWalletCoins] = useState<number>(0);
  const [walletLoading, setWalletLoading] = useState(false);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsHasUnread, setNotificationsHasUnread] = useState(false);

  const [requestsBySchemeId, setRequestsBySchemeId] = useState<Record<string, SchemeRequestDoc>>({});

  const [selectedRow, setSelectedRow] = useState<SchemeRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const fetchWallet = useCallback(async () => {
    if (!uid) return;
    setWalletLoading(true);
    try {
      const walletRef = doc(db, 'Wallet', uid);
      const walletSnap = await getDoc(walletRef);
      if (walletSnap.exists()) {
        const data = walletSnap.data() as WalletDoc;
        setWalletCoins(typeof data.coins === 'number' ? data.coins : 0);
        return;
      }

      const q = query(collection(db, 'Wallet'), where('uid', '==', uid), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        setWalletCoins(0);
        return;
      }
      const data = snap.docs[0].data() as WalletDoc;
      setWalletCoins(typeof data.coins === 'number' ? data.coins : 0);
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

  const fetchSchemes = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const snap = await getDocs(query(collection(db, 'Schemes'), orderBy('createdAt', 'desc')));
      const nextRows = snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, data: d.data() as SchemeRecord }));
      setRows(nextRows);
    } catch {
      setErrorText(t('unableLoadSchemes'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchRequests = useCallback(async () => {
    if (!uid) return;
    try {
      const snap = await getDocs(query(collection(db, 'SchemeRequests'), where('uid', '==', uid), limit(50)));
      const map: Record<string, SchemeRequestDoc> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as SchemeRequestDoc;
        const schemeId = typeof data.schemeId === 'string' ? data.schemeId : null;
        if (!schemeId) return;
        map[schemeId] = data;
      });
      setRequestsBySchemeId(map);
    } catch {
      setRequestsBySchemeId({});
    }
  }, [uid]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchSchemes(), fetchWallet(), fetchRequests()]);
  }, [fetchRequests, fetchSchemes, fetchWallet]);

  useEffect(() => {
    void refreshAll();
    void refreshUnreadNotifications();
  }, [refreshAll, refreshUnreadNotifications]);

  const refreshScreen = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refreshAll]);

  const openDetails = useCallback((row: SchemeRow) => {
    setSelectedRow(row);
    setDetailOpen(true);
  }, []);

  const closeDetails = useCallback(() => {
    setDetailOpen(false);
    setSelectedRow(null);
    setRequesting(false);
  }, []);

  const selectedTitle = useMemo(() => {
    const v = selectedRow?.data.title;
    return typeof v === 'string' && v.trim() ? v.trim() : '—';
  }, [selectedRow?.data.title]);

  const selectedPosterUrl = useMemo(() => {
    const v = selectedRow?.data.posterUrl;
    return typeof v === 'string' && v ? v : null;
  }, [selectedRow?.data.posterUrl]);

  const selectedRequiredCoins = useMemo(() => {
    const v = selectedRow?.data.requiredCoins;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, [selectedRow?.data.requiredCoins]);

  const selectedRewardItems = useMemo(() => normalizeRewardItems(selectedRow?.data.rewardItems), [selectedRow?.data.rewardItems]);

  const requestStatus = useMemo(() => {
    if (!selectedRow) return null;
    const req = requestsBySchemeId[selectedRow.id];
    const status = typeof req?.status === 'string' ? req.status : null;
    return status;
  }, [requestsBySchemeId, selectedRow]);

  const canRequest = useMemo(() => {
    if (!uid) return false;
    if (!selectedRow) return false;
    if (selectedRequiredCoins === null) return false;
    if (walletCoins < selectedRequiredCoins) return false;
    if (requestStatus && requestStatus !== 'rejected') return false;
    return true;
  }, [requestStatus, selectedRequiredCoins, selectedRow, uid, walletCoins]);

  const requestScheme = useCallback(async () => {
    if (!uid || !selectedRow) {
      Alert.alert(t('loginRequiredTitle'), t('loginRequiredBody'));
      return;
    }
    if (requesting) return;

    const requiredCoins = selectedRequiredCoins;
    if (requiredCoins === null || requiredCoins <= 0) {
      Alert.alert(t('invalidSchemeTitle'), t('invalidSchemeBody'));
      return;
    }
    if (walletCoins < requiredCoins) {
      Alert.alert(t('notEnoughCoinsTitle'), t('needCoinsToRequest', { count: requiredCoins }));
      return;
    }
    if (requestStatus && requestStatus !== 'rejected') {
      Alert.alert(t('alreadyRequestedTitle'), t('alreadyRequestedBody'));
      return;
    }

    setRequesting(true);
    try {
      const now = Date.now();
      const fullDb = getFirestoreFull(firebaseApp, firestoreDatabaseId);

      let targetWalletRef = docFull(fullDb, 'Wallet', uid);
      const byIdSnap = await getDocFull(targetWalletRef);
      if (!byIdSnap.exists()) {
        const walletQuery = query(collection(db, 'Wallet'), where('uid', '==', uid), limit(1));
        const walletDocs = await getDocs(walletQuery);
        if (!walletDocs.empty) {
          targetWalletRef = docFull(fullDb, 'Wallet', walletDocs.docs[0].id);
        }
      }

      const requestRef = docFull(collectionFull(fullDb, 'SchemeRequests'));
      const requestId = requestRef.id;
      const historyRef = docFull(fullDb, 'History', `${uid}_${requestId}_scheme_request`);

      await runTransaction(fullDb, async (tx) => {
        const walletSnap = await tx.get(targetWalletRef);
        if (!walletSnap.exists()) throw new Error('Wallet not found');
        const walletData = walletSnap.data() as { coins?: unknown; createdAt?: unknown; uid?: unknown };
        const currentCoins = Number(walletData?.coins ?? 0);
        if (!Number.isFinite(currentCoins) || currentCoins < requiredCoins) throw new Error('Not enough coins');

        tx.update(targetWalletRef, {
          uid,
          coins: currentCoins - requiredCoins,
          updatedAt: now,
          createdAt: typeof walletData?.createdAt === 'number' ? (walletData?.createdAt as number) : now,
        });

        tx.set(requestRef, {
          id: requestId,
          uid,
          schemeId: selectedRow.id,
          schemeTitle: selectedTitle,
          requiredCoins,
          rewardItems: selectedRewardItems,
          posterUrl: selectedPosterUrl,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        });

        tx.set(
          historyRef,
          {
            uid,
            title: 'Scheme Requested',
            type: 'scheme_request',
            coinsDelta: -requiredCoins,
            createdAt: now,
            schemeRequestId: requestId,
            schemeId: selectedRow.id,
            schemeTitle: selectedTitle,
            requiredCoins,
            status: 'pending',
          },
          { merge: true }
        );
      });

      await fetchWallet();
      await fetchRequests();
      Alert.alert(t('requestedTitle'), t('requestedBody'));
      closeDetails();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'Not enough coins') {
        Alert.alert(t('notEnoughCoinsTitle'), t('needCoinsToRequest', { count: requiredCoins }));
      } else if (msg === 'Wallet not found') {
        Alert.alert(t('walletNotFoundTitle'), t('walletNotFoundBody'));
      } else {
        Alert.alert(t('failedTitle'), t('requestSchemeFailed'));
      }
    } finally {
      setRequesting(false);
    }
  }, [
    closeDetails,
    fetchRequests,
    t,
    requestStatus,
    requesting,
    selectedPosterUrl,
    selectedRequiredCoins,
    selectedRewardItems,
    selectedRow,
    selectedTitle,
    uid,
    fetchWallet,
    walletCoins,
  ]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
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
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Gift color="#dc2626" size={20} />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{t('rewards')}</Text>
              <Text style={styles.subtitle}>{t('rewardsSubtitle')}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconButton}
              onPress={() => router.push({ pathname: '/search', params: { type: 'schemes' } } as never)}
            >
              <Search color="#111827" size={18} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => setNotificationsOpen(true)}>
              <Bell color="#111827" size={18} />
              {notificationsHasUnread ? <View style={styles.bellDot} /> : null}
            </Pressable>
          </View>
        </View>

        <View style={styles.walletCard}>
          <View style={styles.walletRow}>
            <View style={styles.walletIconWrap}>
              <Coins color="#dc2626" size={18} />
            </View>
            <View style={styles.walletTextWrap}>
              <Text style={styles.walletLabel}>{t('yourCoins')}</Text>
              <Text style={styles.walletValue}>{walletLoading ? t('loading') : String(walletCoins)}</Text>
            </View>
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
              const title = typeof row.data.title === 'string' && row.data.title.trim() ? row.data.title.trim() : '—';
              const requiredCoins =
                typeof row.data.requiredCoins === 'number' && Number.isFinite(row.data.requiredCoins) ? row.data.requiredCoins : null;
              const rewardLabel = formatRewardPreview(row.data.rewardItems);
              const posterUrl = typeof row.data.posterUrl === 'string' ? row.data.posterUrl : null;
              const req = requestsBySchemeId[row.id];
              const status = typeof req?.status === 'string' ? req.status : null;
              const isEligible = requiredCoins !== null ? walletCoins >= requiredCoins : false;

              return (
                <Pressable key={row.id} style={styles.schemeCard} onPress={() => openDetails(row)}>
                  <View style={styles.schemeRow}>
                    <View style={styles.schemeThumbWrap}>
                      {posterUrl ? (
                        <Image source={{ uri: posterUrl }} style={styles.schemeThumb} />
                      ) : (
                        <View style={styles.schemeThumbFallback} />
                      )}
                    </View>
                    <View style={styles.schemeBody}>
                      <Text style={styles.schemeTitle} numberOfLines={1}>
                        {title}
                      </Text>
                      <Text style={styles.schemeMeta} numberOfLines={1}>
                        {t('requiredCoins')}: {requiredCoins !== null ? requiredCoins : '—'}
                      </Text>
                      <Text style={styles.schemeRewards} numberOfLines={2}>
                        {rewardLabel}
                      </Text>
                      <View style={styles.schemeBadges}>
                        {status ? (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{status.toUpperCase()}</Text>
                          </View>
                        ) : null}
                        {requiredCoins !== null ? (
                          <View style={[styles.badge, isEligible ? styles.badgeOk : styles.badgeNo]}>
                            <Text style={[styles.badgeText, isEligible ? styles.badgeTextOk : styles.badgeTextNo]}>
                              {isEligible ? t('eligible') : t('notEnoughCoinsBadge')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>{t('noSchemesYet')}</Text>
            <Text style={styles.emptySubtitle}>{t('checkAgainLater')}</Text>
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
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeDetails} />
          <View style={styles.sheet}>
            <SafeAreaView edges={['top', 'bottom']} style={styles.sheetSafeArea}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {selectedTitle}
                </Text>
                <Pressable onPress={closeDetails} style={styles.closeButton}>
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailPosterWrap}>
                  {selectedPosterUrl ? (
                    <Image source={{ uri: selectedPosterUrl }} style={styles.detailPoster} />
                  ) : (
                    <View style={styles.detailPosterFallback} />
                  )}
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailLabel}>{t('requiredCoins')}</Text>
                  <Text style={styles.detailValue}>{selectedRequiredCoins !== null ? String(selectedRequiredCoins) : '—'}</Text>

                  <View style={styles.detailDivider} />

                  <Text style={styles.detailLabel}>{t('rewardItems')}</Text>
                  {selectedRewardItems.length ? (
                    <View style={styles.rewardList}>
                      {selectedRewardItems.map((item, idx) => (
                        <View key={`${item.name}_${idx}`} style={styles.rewardRow}>
                          <Text style={styles.rewardName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.rewardPrice}>₹ {item.price}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.detailMuted}>{t('noRewardItems')}</Text>
                  )}
                </View>
              </ScrollView>

              <View style={styles.footer}>
                <Pressable
                  style={[styles.requestButton, !canRequest || requesting ? styles.requestButtonDisabled : null]}
                  disabled={!canRequest || requesting}
                  onPress={requestScheme}
                >
                  <Text style={styles.requestButtonText}>
                    {requesting
                      ? t('requesting')
                      : requestStatus && requestStatus !== 'rejected'
                        ? t('alreadyRequestedButton')
                        : canRequest
                          ? t('requestScheme')
                          : t('notEnoughCoinsButton')}
                  </Text>
                </Pressable>
              </View>
            </SafeAreaView>
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
  walletCard: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
    padding: 14,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletIconWrap: {
    height: 40,
    width: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  walletTextWrap: {
    flex: 1,
  },
  walletLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6b7280',
  },
  walletValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
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
  schemeCard: {
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 12,
  },
  schemeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  schemeThumbWrap: {
    height: 58,
    width: 58,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  schemeThumb: {
    height: '100%',
    width: '100%',
  },
  schemeThumbFallback: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  schemeBody: {
    flex: 1,
  },
  schemeTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  schemeMeta: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: '#6b7280',
  },
  schemeRewards: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  schemeBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#374151',
  },
  badgeOk: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  badgeNo: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  badgeTextOk: {
    color: '#16a34a',
  },
  badgeTextNo: {
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
  detailPosterWrap: {
    marginTop: 6,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  detailPoster: {
    height: 220,
    width: '100%',
  },
  detailPosterFallback: {
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
  detailLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#6b7280',
  },
  detailValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
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
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  requestButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  requestButtonDisabled: {
    opacity: 0.6,
  },
  requestButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
});
