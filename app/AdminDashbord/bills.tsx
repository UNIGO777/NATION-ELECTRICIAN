import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { FileText } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import BillProfileModal from '@/AdminComponents/BillProfileModal';
import { db, firebaseApp, firestoreDatabaseId } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  updateDoc,
  setDoc,
  where,
  limit,
} from 'firebase/firestore/lite';
import {
  getFirestore as getFirestoreFull,
  runTransaction,
  doc as docFull,
  getDoc as getDocFull,
} from 'firebase/firestore';

type BillRecord = {
  uid?: string | null;
  status?: 'pending' | 'approved' | 'rejected' | string | null;
  decidedBy?: string | null;
  decidedAt?: number | null;
  billNumber?: string | null;
  customerName?: string | null;
  images?: unknown[] | null;
  items?: unknown[] | null;
  totalQuantity?: number | null;
  totalAmount?: number | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  approvedCoins?: number | null;
};

type BillRow = {
  id: string;
  data: BillRecord;
};

export default function AdminBills() {
  const user = useUserStore((s) => s.user);
  const adminUid = user?.uid ?? null;

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [bills, setBills] = useState<BillRow[]>([]);

  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const [billProfileVisible, setBillProfileVisible] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  const [decisionBill, setDecisionBill] = useState<BillRow | null>(null);
  const [coinsInput, setCoinsInput] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);

  const closeDecision = useCallback(() => {
    setDecisionBill(null);
    setCoinsInput('');
  }, []);

  const fetchBills = useCallback(async () => {
    if (!user?.isAdmin) return;
    setLoading(true);
    setErrorText(null);
    try {
      const base = collection(db, 'Bills');
      const q = query(base, orderBy('createdAt', 'desc'));

      const snap = await getDocs(q);
      const allRows: BillRow[] = snap.docs.map((d: QueryDocumentSnapshot) => {
        const data = d.data() as BillRecord;
        const rawStatus = String(data.status ?? '').toLowerCase();
        const status = rawStatus === 'approved' ? 'approved' : rawStatus === 'rejected' ? 'rejected' : 'pending';
        return { id: d.id, data: { ...data, status } };
      });

      const rows =
        filter === 'all'
          ? allRows
          : allRows.filter((r) => String(r.data.status ?? 'pending') === filter);

      setBills(rows);
    } catch {
      setErrorText('Unable to load bills right now.');
    } finally {
      setLoading(false);
    }
  }, [filter, user?.isAdmin]);

  useEffect(() => {
    void fetchBills();
  }, [fetchBills]);

  const pendingCount = useMemo(() => bills.filter((b) => (b.data.status ?? 'pending') === 'pending').length, [bills]);

  const writeDecisionArtifacts = useCallback(
    async (params: { uid: string; billId: string; decision: 'approved' | 'rejected'; coins: number; now: number; amount: number }) => {
      const { uid, billId, decision, coins, now, amount } = params;
      const notificationId = `${uid}_${billId}_${decision}`;
      const historyId = `${uid}_${billId}_${decision}`;

      const title = decision === 'approved' ? 'Bill Approved' : 'Bill Rejected';
      const body =
        decision === 'approved'
          ? `You received ${coins} coins. Bill amount: ${amount}`
          : `Your bill was rejected. Bill amount: ${amount}`;

      await setDoc(
        doc(db, 'Notifications', notificationId),
        {
          uid,
          billId,
          title,
          body,
          type: decision === 'approved' ? 'bill_approved' : 'bill_rejected',
          coins: decision === 'approved' ? coins : 0,
          decidedBy: adminUid,
          createdAt: now,
          read: false,
        },
        { merge: true }
      );
      console.log('Notification created', { uid, billId, notificationId, decision });

      await setDoc(
        doc(db, 'History', historyId),
        {
          uid,
          billId,
          title,
          type: decision === 'approved' ? 'bill_approved' : 'bill_rejected',
          coinsDelta: decision === 'approved' ? coins : 0,
          totalAmount: amount,
          createdAt: now,
        },
        { merge: true }
      );
      console.log('History created', { uid, billId, historyId, decision });
    },
    [adminUid]
  );

  const extractUid = useCallback((value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }, []);

  const submitReject = useCallback(
    async (bill: BillRow) => {
      if (!adminUid) return;
      if (decisionSubmitting) return;
      if (String(bill.data.status ?? 'pending') !== 'pending') {
        setErrorText('This bill is already decided.');
        return;
      }
      setDecisionSubmitting(true);
      try {
        const now = Date.now();
        const billRef = doc(db, 'Bills', bill.id);
        const latest = await getDoc(billRef);
        if (!latest.exists()) {
          setErrorText('Bill not found.');
          return;
        }
        const latestStatus = String((latest.data() as BillRecord).status ?? 'pending').toLowerCase();
        if (latestStatus !== 'pending') {
          setErrorText('This bill is already decided.');
          return;
        }

        await updateDoc(billRef, {
          status: 'rejected',
          approvedCoins: null,
          decidedBy: adminUid,
          decidedAt: now,
          updatedAt: now,
        });

        const billUidRaw = (latest.data() as BillRecord).uid;
        const uid = extractUid(billUidRaw) ?? extractUid(bill.data.uid) ?? null;
        if (uid) {
          try {
            const amount = typeof (latest.data() as BillRecord).totalAmount === 'number' ? ((latest.data() as BillRecord).totalAmount as number) : 0;
            await writeDecisionArtifacts({ uid, billId: bill.id, decision: 'rejected', coins: 0, now, amount });
          } catch (e) {
            console.log('Reject artifacts error', e);
            setErrorText('Unable to push decision notification right now.');
          }
        }
        await fetchBills();
      } catch {
        setErrorText('Unable to reject this bill right now.');
      } finally {
        setDecisionSubmitting(false);
      }
    },
    [adminUid, decisionSubmitting, extractUid, fetchBills, writeDecisionArtifacts]
  );

  const submitApprove = useCallback(async () => {
    if (!decisionBill) return;
    if (!adminUid) return;
    if (decisionSubmitting) return;
    if (String(decisionBill.data.status ?? 'pending') !== 'pending') {
      setErrorText('This bill is already decided.');
      return;
    }

    const coins = Number(coinsInput);
    if (!Number.isFinite(coins) || coins <= 0) {
      setErrorText('Please enter valid coins amount.');
      return;
    }

    setDecisionSubmitting(true);
    setErrorText(null);
    try {
      const now = Date.now();
      const billRef = doc(db, 'Bills', decisionBill.id);
      const latest = await getDoc(billRef);
      if (!latest.exists()) {
        setErrorText('Bill not found.');
        return;
      }
      const latestStatus = String((latest.data() as BillRecord).status ?? 'pending').toLowerCase();
      if (latestStatus !== 'pending') {
        setErrorText('This bill is already decided.');
        return;
      }

      await updateDoc(billRef, {
        status: 'approved',
        approvedCoins: coins,
        decidedBy: adminUid,
        decidedAt: now,
        updatedAt: now,
      });
      const billUidRaw = (latest.data() as BillRecord).uid;
      const uid = extractUid(billUidRaw) ?? extractUid(decisionBill.data.uid) ?? null;
      if (uid) {
        const amount = typeof (latest.data() as BillRecord).totalAmount === 'number' ? ((latest.data() as BillRecord).totalAmount as number) : 0;
        try {
          const fullDb = getFirestoreFull(firebaseApp, firestoreDatabaseId);
          let targetRef = docFull(fullDb, 'Wallet', uid);
          const byIdSnap = await getDocFull(targetRef);
          console.log('Wallet lookup by id', { uid, exists: byIdSnap.exists() });
          if (!byIdSnap.exists()) {
            const walletQuery = query(collection(db, 'Wallet'), where('uid', '==', uid), limit(1));
            const walletDocs = await getDocs(walletQuery);
            if (!walletDocs.empty) {
              targetRef = docFull(fullDb, 'Wallet', walletDocs.docs[0].id);
              console.log('Wallet lookup by query', { uid, docId: walletDocs.docs[0].id });
            }
          }
          await runTransaction(fullDb, async (tx) => {
            const snap = await tx.get(targetRef);
            if (!snap.exists()) {
              tx.set(targetRef, { uid, coins, createdAt: now, updatedAt: now });
              console.log('Wallet created', { uid, coins });
              return;
            }
            const data = snap.data() as { coins?: unknown; createdAt?: unknown };
            const prev = Number(data?.coins ?? 0);
            if (!Number.isFinite(prev)) throw new Error('Invalid wallet balance');
            const next = prev + coins;
            if (!Number.isFinite(next) || next < 0) throw new Error('Computed wallet balance invalid');
            tx.update(targetRef, {
              uid,
              coins: next,
              updatedAt: now,
              createdAt: typeof data?.createdAt === 'number' ? (data?.createdAt as number) : now,
            });
            console.log('Wallet updated successfully', { uid, prev, add: coins, next });
          });
        } catch (e) {
          console.log('Wallet update error', e);
          setErrorText('Unable to update wallet right now.');
        }
        try {
          await writeDecisionArtifacts({ uid, billId: decisionBill.id, decision: 'approved', coins, now, amount });
        } catch (e) {
          console.log('Approve artifacts error', e);
          setErrorText('Unable to push decision notification right now.');
        }
      }
      closeDecision();
      await fetchBills();
    } catch {
      setErrorText('Unable to approve this bill right now.');
    } finally {
      setDecisionSubmitting(false);
    }
  }, [adminUid, closeDecision, coinsInput, decisionBill, decisionSubmitting, extractUid, fetchBills, writeDecisionArtifacts]);

  if (!user) return <Redirect href="/login" />;
  if (!user.isAdmin) return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-gray-100">
      <View className="flex-1 px-6 pt-6">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-white mr-3">
              <FileText color="#111827" size={18} />
            </View>
            <View>
              <Text className="text-xl font-semibold text-neutral-900">Bills</Text>
              <Text className="text-xs text-neutral-500 mt-0.5">
                Pending: {pendingCount} • Total: {bills.length}
              </Text>
            </View>
          </View>
          <Pressable onPress={fetchBills} className="bg-white px-4 py-2 rounded-xl">
            <Text className="text-neutral-900 font-semibold">Refresh</Text>
          </Pressable>
        </View>

        <View className="flex-row mt-4 bg-white rounded-2xl p-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((k) => {
            const active = filter === k;
            return (
              <Pressable
                key={k}
                onPress={() => setFilter(k)}
                className={`flex-1 py-2 rounded-xl ${active ? 'primary-bg-color' : 'bg-white'}`}
              >
                <Text className={`text-center font-semibold ${active ? 'text-white' : 'text-neutral-700'}`}>
                  {k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {errorText ? <Text className="text-red-600 text-sm mt-4">{errorText}</Text> : null}

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : bills.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-neutral-500 font-semibold">No bills found</Text>
          </View>
        ) : (
          <ScrollView className="flex-1 mt-4" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {bills.map((b) => {
              const status = String(b.data.status ?? 'pending');
              const isPending = status === 'pending';
              const amount = typeof b.data.totalAmount === 'number' ? b.data.totalAmount : 0;
              const billNo = typeof b.data.billNumber === 'string' && b.data.billNumber.trim() ? b.data.billNumber.trim() : b.id;
              const customer =
                typeof b.data.customerName === 'string' && b.data.customerName.trim() ? b.data.customerName.trim() : '—';
              const imageCount = Array.isArray(b.data.images) ? b.data.images.length : 0;
              const createdAt =
                typeof b.data.createdAt === 'number' ? new Date(b.data.createdAt).toDateString() : '—';

              return (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    setSelectedBillId(b.id);
                    setBillProfileVisible(true);
                  }}
                  className="bg-white rounded-2xl p-4 mb-3"
                >
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-neutral-900 font-extrabold">Bill No: {billNo}</Text>
                      <Text className="text-xs text-neutral-500 mt-1">
                        UID: {String(b.data.uid ?? '—')}
                      </Text>
                    </View>
                    <View className="px-3 py-1 rounded-full bg-gray-100">
                      <Text className="text-xs font-bold text-neutral-700">{status.toUpperCase()}</Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between mt-3">
                    <Text className="text-xs text-neutral-500">Customer: {customer}</Text>
                    <Text className="text-xs text-neutral-500">Amount: {amount}</Text>
                    <Text className="text-xs text-neutral-500">Images: {imageCount}</Text>
                  </View>
                  <Text className="text-xs text-neutral-500 mt-2">Created: {createdAt}</Text>

                  {isPending ? (
                    <View className="flex-row mt-4">
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          setErrorText(null);
                          setDecisionBill(b);
                          setCoinsInput('');
                        }}
                        disabled={decisionSubmitting}
                        className={`flex-1 mr-2 rounded-xl py-3 items-center ${
                          decisionSubmitting ? 'opacity-60' : ''
                        } primary-bg-color`}
                      >
                        <Text className="text-white font-bold">Approve</Text>
                      </Pressable>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          void submitReject(b);
                        }}
                        disabled={decisionSubmitting}
                        className={`flex-1 ml-2 rounded-xl py-3 items-center ${
                          decisionSubmitting ? 'opacity-60' : ''
                        } bg-neutral-900`}
                      >
                        <Text className="text-white font-bold">Reject</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <Modal visible={Boolean(decisionBill)} transparent animationType="fade" onRequestClose={closeDecision}>
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-white rounded-2xl w-full p-5">
            <Text className="text-neutral-900 text-lg font-extrabold">Approve Bill</Text>
            <Text className="text-neutral-500 text-sm mt-1">Bill ID: {decisionBill?.id ?? '—'}</Text>
            <Text className="text-neutral-700 text-sm mt-4 font-semibold">Coins to give</Text>
            <TextInput
              value={coinsInput}
              onChangeText={setCoinsInput}
              keyboardType="numeric"
              placeholder="e.g. 50"
              placeholderTextColor="#9ca3af"
              className="border border-neutral-200 rounded-xl px-4 py-3 mt-2 text-neutral-900"
            />
            <View className="flex-row mt-5">
              <Pressable
                onPress={closeDecision}
                disabled={decisionSubmitting}
                className={`flex-1 mr-2 rounded-xl py-3 items-center bg-gray-100 ${
                  decisionSubmitting ? 'opacity-60' : ''
                }`}
              >
                <Text className="text-neutral-900 font-bold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitApprove}
                disabled={decisionSubmitting}
                className={`flex-1 ml-2 rounded-xl py-3 items-center primary-bg-color ${
                  decisionSubmitting ? 'opacity-60' : ''
                }`}
              >
                <Text className="text-white font-bold">{decisionSubmitting ? 'Saving...' : 'Approve'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <BillProfileModal
        visible={billProfileVisible}
        billId={selectedBillId}
        onClose={() => {
          setBillProfileVisible(false);
          setSelectedBillId(null);
        }}
      />
    </SafeAreaView>
  );
}
