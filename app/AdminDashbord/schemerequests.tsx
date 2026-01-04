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
import { Redirect } from 'expo-router';
import { ClipboardList, X } from 'lucide-react-native';

import UserProfileModal from '@/AdminComponents/UserProfileModal';
import { db } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';

type SchemeRequestRecord = {
  uid?: string | null;
  schemeId?: string | null;
  schemeTitle?: string | null;
  requiredCoins?: number | null;
  posterUrl?: string | null;
  status?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
};

type SchemeRequestRow = {
  id: string;
  data: SchemeRequestRecord;
};

const formatDateTime = (value: unknown): string => {
  const ts = typeof value === 'number' && Number.isFinite(value) ? value : null;
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '-';
  }
};

export default function AdminSchemeRequests() {
  const user = useUserStore((s) => s.user);
  const isAdmin = Boolean(user?.isAdmin);
  const adminUid = user?.uid ?? null;

  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [rows, setRows] = useState<SchemeRequestRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const [selected, setSelected] = useState<SchemeRequestRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [userProfileOpen, setUserProfileOpen] = useState(false);

  const fetchRequests = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setErrorText(null);
    try {
      const snap = await getDocs(query(collection(db, 'SchemeRequests'), orderBy('createdAt', 'desc'), limit(200)));
      const allRows = snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, data: d.data() as SchemeRequestRecord }));
      const normalized = allRows.map((r) => {
        const rawStatus = String(r.data.status ?? '').toLowerCase();
        const status = rawStatus === 'approved' ? 'approved' : rawStatus === 'rejected' ? 'rejected' : 'pending';
        return { ...r, data: { ...r.data, status } };
      });
      const nextRows =
        filter === 'all'
          ? normalized
          : normalized.filter((r) => String(r.data.status ?? 'pending') === filter);
      setRows(nextRows);
    } catch {
      setErrorText('Unable to load scheme requests right now.');
    } finally {
      setLoading(false);
    }
  }, [filter, isAdmin]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const refresh = useCallback(async () => {
    if (!isAdmin || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchRequests();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchRequests, isAdmin, isRefreshing]);

  const counts = useMemo(() => {
    const pending = rows.filter((r) => (r.data.status ?? 'pending') === 'pending').length;
    const approved = rows.filter((r) => (r.data.status ?? 'pending') === 'approved').length;
    const rejected = rows.filter((r) => (r.data.status ?? 'pending') === 'rejected').length;
    return { pending, approved, rejected };
  }, [rows]);

  const openDetails = useCallback((row: SchemeRequestRow) => {
    setSelected(row);
    setDetailOpen(true);
  }, []);

  const closeDetails = useCallback(() => {
    setDetailOpen(false);
    setSelected(null);
    setDecisionSubmitting(false);
    setUserProfileOpen(false);
  }, []);

  const openUserProfile = useCallback(() => {
    if (!selected || !selected.data.uid) return;
    setUserProfileOpen(true);
  }, [selected]);

  const submitDecision = useCallback(
    async (decision: 'approved' | 'rejected') => {
      if (!adminUid) return;
      if (!selected) return;
      if (decisionSubmitting) return;

      const currentStatus = String(selected.data.status ?? 'pending');
      if (currentStatus !== 'pending') {
        Alert.alert('Already decided', 'This request is already decided.');
        return;
      }

      const requestUid = typeof selected.data.uid === 'string' ? selected.data.uid : '';
      if (!requestUid) {
        setErrorText('User uid missing.');
        return;
      }

      setDecisionSubmitting(true);
      setErrorText(null);
      try {
        const now = Date.now();
        const schemeTitle = typeof selected.data.schemeTitle === 'string' ? selected.data.schemeTitle : 'Scheme';
        const schemeId = typeof selected.data.schemeId === 'string' ? selected.data.schemeId : '';
        const rawCoins =
          typeof selected.data.requiredCoins === 'number' ? selected.data.requiredCoins : Number(selected.data.requiredCoins);
        const requiredCoins = Number.isFinite(rawCoins) ? Math.max(0, Math.floor(rawCoins)) : 0;

        const title = decision === 'approved' ? 'Scheme Request Approved' : 'Scheme Request Rejected';
        const body =
          decision === 'approved'
            ? `"${schemeTitle}" has been approved. You will get call from our side in next seven days.`
            : `"${schemeTitle}" has been rejected. You will get call from our side in next seven days.`;

        const notificationId = `${requestUid}_${selected.id}_scheme_${decision}`;
        const historyId = `${requestUid}_${selected.id}_scheme_${decision}`;

        const requestRef = doc(db, 'SchemeRequests', selected.id);
        const latest = await getDoc(requestRef);
        if (!latest.exists()) {
          setErrorText('Request not found.');
          return;
        }
        const latestStatus = String((latest.data() as SchemeRequestRecord).status ?? 'pending').toLowerCase();
        if (latestStatus !== 'pending') {
          setErrorText('This request is already decided.');
          return;
        }

        await updateDoc(requestRef, {
          status: decision,
          decidedBy: adminUid,
          decidedAt: now,
          updatedAt: now,
        });

        await setDoc(
          doc(db, 'Notifications', notificationId),
          {
            uid: requestUid,
            schemeRequestId: selected.id,
            schemeId,
            title,
            body,
            type: 'scheme_request_decision',
            decision,
            requiredCoins,
            decidedBy: adminUid,
            createdAt: now,
            read: false,
          },
          { merge: true }
        );

        await setDoc(
          doc(db, 'History', historyId),
          {
            uid: requestUid,
            schemeRequestId: selected.id,
            schemeId,
            schemeTitle,
            requiredCoins,
            title:
              decision === 'approved'
                ? 'Scheme Request Approved - You will get call from our side in next seven days.'
                : 'Scheme Request Rejected - You will get call from our side in next seven days.',
            type: decision === 'approved' ? 'scheme_request_approved' : 'scheme_request_rejected',
            coinsDelta: 0,
            decidedBy: adminUid,
            createdAt: now,
            status: decision,
          },
          { merge: true }
        );

        await fetchRequests();
        closeDetails();
      } catch {
        setErrorText('Unable to update request right now.');
      } finally {
        setDecisionSubmitting(false);
      }
    },
    [adminUid, closeDetails, decisionSubmitting, fetchRequests, selected]
  );

  if (!user) return <Redirect href="/login" />;
  if (!user.isAdmin) return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#dc2626" colors={['#dc2626']} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <ClipboardList color="#dc2626" size={18} />
            </View>
            <View>
              <Text style={styles.title}>Scheme Requests</Text>
              <Text style={styles.subtitle}>View all requests from users</Text>
            </View>
          </View>
        </View>

        <View style={styles.filters}>
          <Pressable
            style={[styles.filterPill, filter === 'pending' ? styles.filterPillActive : null]}
            onPress={() => setFilter('pending')}
          >
            <Text style={[styles.filterText, filter === 'pending' ? styles.filterTextActive : null]}>
              Pending ({counts.pending})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterPill, filter === 'approved' ? styles.filterPillActive : null]}
            onPress={() => setFilter('approved')}
          >
            <Text style={[styles.filterText, filter === 'approved' ? styles.filterTextActive : null]}>
              Approved ({counts.approved})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterPill, filter === 'rejected' ? styles.filterPillActive : null]}
            onPress={() => setFilter('rejected')}
          >
            <Text style={[styles.filterText, filter === 'rejected' ? styles.filterTextActive : null]}>
              Rejected ({counts.rejected})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterPill, filter === 'all' ? styles.filterPillActive : null]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' ? styles.filterTextActive : null]}>All</Text>
          </Pressable>
        </View>

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#dc2626" />
          </View>
        ) : rows.length ? (
          <View style={styles.list}>
            {rows.map((row) => {
              const schemeTitle = typeof row.data.schemeTitle === 'string' && row.data.schemeTitle.trim() ? row.data.schemeTitle.trim() : '—';
              const requestUid = typeof row.data.uid === 'string' && row.data.uid.trim() ? row.data.uid.trim() : '—';
              const coins = typeof row.data.requiredCoins === 'number' && Number.isFinite(row.data.requiredCoins) ? row.data.requiredCoins : null;
              const createdAt = formatDateTime(row.data.createdAt);
              const status = String(row.data.status ?? 'pending');
              const posterUrl = typeof row.data.posterUrl === 'string' ? row.data.posterUrl : null;

              return (
                <Pressable key={row.id} style={styles.card} onPress={() => openDetails(row)}>
                  <View style={styles.cardRow}>
                    <View style={styles.thumbWrap}>
                      {posterUrl ? <Image source={{ uri: posterUrl }} style={styles.thumb} /> : <View style={styles.thumbFallback} />}
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {schemeTitle}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        UID: {requestUid}
                      </Text>
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {coins !== null ? `${coins} coins` : '-'} • {createdAt}
                      </Text>
                    </View>
                    <View style={styles.statusWrap}>
                      <Text style={[styles.statusText, status === 'approved' ? styles.statusApproved : status === 'rejected' ? styles.statusRejected : styles.statusPending]}>
                        {status}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No requests</Text>
            <Text style={styles.emptySubtitle}>Nothing to show for this filter.</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={detailOpen} transparent animationType="fade" onRequestClose={closeDetails}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Details</Text>
              <Pressable style={styles.closeButton} onPress={closeDetails}>
                <X color="#111827" size={18} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.detailLabel}>Request ID</Text>
              <Text style={styles.detailValue}>{selected?.id ?? '-'}</Text>

              <Text style={styles.detailLabel}>User UID</Text>
              <Text style={styles.detailValue}>{selected?.data.uid ?? '-'}</Text>
              <Pressable style={styles.userButton} onPress={openUserProfile} disabled={!selected?.data.uid}>
                <Text style={styles.userButtonText}>View User Details</Text>
              </Pressable>

              <Text style={styles.detailLabel}>Scheme</Text>
              <Text style={styles.detailValue}>{selected?.data.schemeTitle ?? selected?.data.schemeId ?? '-'}</Text>

              <Text style={styles.detailLabel}>Required Coins</Text>
              <Text style={styles.detailValue}>
                {typeof selected?.data.requiredCoins === 'number' && Number.isFinite(selected.data.requiredCoins)
                  ? String(selected.data.requiredCoins)
                  : '-'}
              </Text>

              <Text style={styles.detailLabel}>Status</Text>
              <Text style={styles.detailValue}>{selected?.data.status ?? 'pending'}</Text>

              <Text style={styles.detailLabel}>Created</Text>
              <Text style={styles.detailValue}>{formatDateTime(selected?.data.createdAt)}</Text>
            </ScrollView>

            {selected?.data.status === 'pending' || !selected?.data.status ? (
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.actionButton, styles.rejectButton, decisionSubmitting ? styles.actionDisabled : null]}
                  onPress={() => submitDecision('rejected')}
                  disabled={decisionSubmitting}
                >
                  <Text style={[styles.actionText, styles.rejectText]}>{decisionSubmitting ? 'Please wait...' : 'Reject'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.approveButton, decisionSubmitting ? styles.actionDisabled : null]}
                  onPress={() => submitDecision('approved')}
                  disabled={decisionSubmitting}
                >
                  <Text style={[styles.actionText, styles.approveText]}>{decisionSubmitting ? 'Please wait...' : 'Approve'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      <UserProfileModal
        visible={userProfileOpen}
        userId={selected?.data.uid ?? null}
        onClose={() => setUserProfileOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerIconWrap: {
    height: 42,
    width: 42,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
  },
  filterPillActive: { backgroundColor: '#dc2626' },
  filterText: { fontSize: 12, color: '#111827', fontWeight: '600' },
  filterTextActive: { color: '#ffffff' },
  errorText: { color: '#dc2626', fontSize: 13, marginTop: 6 },
  loadingWrap: { paddingVertical: 24, alignItems: 'center' },
  list: { gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  thumbWrap: { height: 54, width: 54, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f3f4f6' },
  thumb: { height: 54, width: 54 },
  thumbFallback: { height: 54, width: 54, backgroundColor: '#f3f4f6' },
  cardBody: { flex: 1, marginLeft: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  cardMeta: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  statusWrap: { marginLeft: 10, alignItems: 'flex-end' },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  statusPending: { color: '#f59e0b' },
  statusApproved: { color: '#16a34a' },
  statusRejected: { color: '#dc2626' },
  empty: { paddingVertical: 36, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  emptySubtitle: { fontSize: 12, color: '#6b7280', marginTop: 6, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: { width: '100%', maxWidth: 520, backgroundColor: '#ffffff', borderRadius: 16, padding: 16, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  closeButton: { height: 36, width: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 12 },
  detailValue: { fontSize: 13, color: '#111827', marginTop: 4 },
  userButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignSelf: 'flex-start',
  },
  userButtonText: { fontSize: 13, fontWeight: '800', color: '#111827' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '800' },
  actionDisabled: { opacity: 0.7 },
  rejectButton: { backgroundColor: '#f3f4f6' },
  rejectText: { color: '#111827' },
  approveButton: { backgroundColor: '#16a34a' },
  approveText: { color: '#ffffff' },
});
