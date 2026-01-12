import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Coins, MinusCircle, Pencil, Plus, Users, X } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';

import CreateUserModal from '@/AdminComponents/CreateUserModal';
import {
  adjustUserWalletCoinsAsAdmin,
  fetchWalletCoinsAsAdmin,
  fetchUsersPage,
  setUserStatusAsAdmin,
  type AdminUserRecord,
  type UsersPageCursor,
} from '@/Globalservices/adminUserServices';
import { useT } from '@/Globalservices/i18n';
import { useUserStore } from '@/Globalservices/userStore';

export default function AdminUsers() {
  const t = useT();
  const params = useLocalSearchParams<{ openCreate?: string; createNonce?: string }>();
  type UserStoreState = ReturnType<typeof useUserStore.getState>;
  const currentUser = useUserStore((s: UserStoreState) => s.user);
  const isAdmin = Boolean(currentUser?.isAdmin);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [cursor, setCursor] = useState<UsersPageCursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingUser, setEditingUser] = useState<AdminUserRecord | null>(null);
  const [blockingUid, setBlockingUid] = useState<string | null>(null);
  const [walletUser, setWalletUser] = useState<AdminUserRecord | null>(null);
  const [walletCoins, setWalletCoins] = useState<number | null>(null);
  const [walletCoinsLoading, setWalletCoinsLoading] = useState(false);
  const [walletAmountText, setWalletAmountText] = useState('');
  const [walletReason, setWalletReason] = useState('');
  const [walletErrorText, setWalletErrorText] = useState<string | null>(null);
  const [walletSubmitting, setWalletSubmitting] = useState(false);

  const pageSize = 10;

  const loadFirstPage = useCallback(async () => {
    if (!isAdmin) return;
    setIsRefreshing(true);
    setErrorText(null);
    try {
      const page = await fetchUsersPage({ pageSize, cursor: null });
      setUsers(page.users);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('failedToLoadUsers');
      setErrorText(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [isAdmin, t]);

  const loadNextPage = useCallback(async () => {
    if (!isAdmin || isLoading || isRefreshing || !hasMore) return;
    setIsLoading(true);
    setErrorText(null);
    try {
      const page = await fetchUsersPage({ pageSize, cursor });
      setUsers((prev) => {
        const next = [...prev, ...page.users];
        const seen = new Set<string>();
        return next.filter((u) => {
          const key = u.uid;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('failedToLoadUsers');
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, [cursor, hasMore, isAdmin, isLoading, isRefreshing, t]);

  const onToggleBlocked = useCallback(
    (user: AdminUserRecord) => {
      if (!isAdmin) return;
      if (!user.uid) return;
      if (user.uid === currentUser?.uid) {
        Alert.alert(t('notAllowedTitle'), t('cannotBlockOwnAccount'));
        return;
      }
      if (blockingUid) return;

      const currentStatus = user.status ?? 'active';
      const nextStatus: 'active' | 'blocked' = currentStatus === 'blocked' ? 'active' : 'blocked';

      Alert.alert(nextStatus === 'blocked' ? t('blockUserTitle') : t('unblockUserTitle'), nextStatus === 'blocked' ? t('blockUserBody') : t('unblockUserBody'), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: nextStatus === 'blocked' ? t('block') : t('unblock'),
          style: nextStatus === 'blocked' ? 'destructive' : 'default',
          onPress: async () => {
            setBlockingUid(user.uid);
            setErrorText(null);
            try {
              await setUserStatusAsAdmin({ uid: user.uid, status: nextStatus });
              setUsers((prev) => prev.map((u) => (u.uid === user.uid ? { ...u, status: nextStatus } : u)));
              await loadFirstPage();
            } catch (err) {
              const message = err instanceof Error ? err.message : t('failedToUpdateUser');
              setErrorText(message);
            } finally {
              setBlockingUid(null);
            }
          },
        },
      ]);
    },
    [blockingUid, currentUser?.uid, isAdmin, loadFirstPage, t]
  );

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const columns = useMemo(
    () => [
      { key: 'email', label: t('email'), flex: 1 },
      { key: 'role', label: t('role'), flex: 1 },
      { key: 'actions', label: t('actions'), flex: 1 },
    ],
    [t]
  );

  const renderHeader = () => (
    <View className="flex-row bg-red-50  border border-red-100 rounded-xl px-3 py-3">
      {columns.map((c) => (
        <Text key={c.key} className="text-sm  font-semibold text-red-800" style={{ flex: c.flex }}>
          {c.label}
        </Text>
      ))}
    </View>
  );

  const lastCreateNonceRef = useRef<string | null>(null);

  const openCreate = () => {
    setModalMode('create');
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const openEdit = (user: AdminUserRecord) => {
    setModalMode('edit');
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setModalMode('create');
  };

  const closeWalletModal = () => {
    setWalletSubmitting(false);
    setWalletErrorText(null);
    setWalletAmountText('');
    setWalletReason('');
    setWalletCoins(null);
    setWalletCoinsLoading(false);
    setWalletUser(null);
  };

  const openWalletModal = async (user: AdminUserRecord) => {
    if (!isAdmin) return;
    if (!user.uid) return;
    setWalletUser(user);
    setWalletCoins(null);
    setWalletCoinsLoading(true);
    setWalletAmountText('');
    setWalletReason('');
    setWalletErrorText(null);
    try {
      const coins = await fetchWalletCoinsAsAdmin(user.uid);
      setWalletCoins(coins);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('failedToLoadWallet');
      setWalletErrorText(message);
    } finally {
      setWalletCoinsLoading(false);
    }
  };

  const submitWalletDeduction = async () => {
    if (!isAdmin) return;
    if (!walletUser?.uid) return;
    if (walletSubmitting) return;

    setWalletSubmitting(true);
    setWalletErrorText(null);
    try {
      const raw = walletAmountText.trim();
      const amount = Math.floor(Number(raw));
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(t('enterValidCoinsAmount'));
      }

      const result = await adjustUserWalletCoinsAsAdmin({
        uid: walletUser.uid,
        delta: -amount,
        reason: walletReason,
      });

      Alert.alert(
        t('walletUpdatedTitle'),
        t('walletUpdatedBody', { deducted: Math.abs(result.appliedDelta), balance: result.afterCoins })
      );
      closeWalletModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('failedToUpdateWallet');
      setWalletErrorText(message);
    } finally {
      setWalletSubmitting(false);
    }
  };

  useEffect(() => {
    if (params.openCreate !== '1') return;
    const nonce = typeof params.createNonce === 'string' ? params.createNonce : null;
    if (nonce && nonce === lastCreateNonceRef.current) return;
    lastCreateNonceRef.current = nonce ?? '__opened__';
    openCreate();
  }, [params.createNonce, params.openCreate]);

  const renderRow = ({ item }: { item: AdminUserRecord }) => (
    <View className="flex-row px-3 gap-5 py-3 border-b border-neutral-100 bg-white">
      <Text className="text-xs text-neutral-900" style={{ flex: 1 }} numberOfLines={1}>
        {item.email ?? '-'}
      </Text>
      <Text className="text-xs text-neutral-700" style={{ flex: 1 }} numberOfLines={1}>
        {item.role ?? '-'}
      </Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Pressable
            className="h-8 w-8 items-center justify-center rounded-lg bg-neutral-100"
            onPress={() => openEdit(item)}
            disabled={!isAdmin || Boolean(blockingUid)}
          >
            <Pencil color="#111827" size={16} />
          </Pressable>

          <Pressable
            className="h-8 w-8 items-center justify-center rounded-lg bg-neutral-100"
            onPress={() => openWalletModal(item)}
            disabled={!isAdmin || Boolean(blockingUid) || walletSubmitting}
          >
            <MinusCircle color="#111827" size={16} />
          </Pressable>

          <Pressable
            className="h-8 items-center justify-center rounded-lg px-3"
            style={{ backgroundColor: item.status === 'blocked' ? '#dc2626' : '#111827' }}
            onPress={() => onToggleBlocked(item)}
            disabled={!isAdmin || Boolean(blockingUid) || item.uid === currentUser?.uid}
          >
            {blockingUid === item.uid ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text className="text-xs font-semibold text-white">{item.status === 'blocked' ? t('unblock') : t('block')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={[]} className="flex-1 bg-white">
      <CreateUserModal
        visible={isModalOpen}
        onClose={closeModal}
        onSaved={loadFirstPage}
        mode={modalMode}
        initialUser={editingUser}
      />

      <Modal visible={Boolean(walletUser)} animationType="slide" transparent onRequestClose={closeWalletModal}>
        <Pressable style={styles.backdrop} onPress={closeWalletModal}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.headerContainer}>
                <View style={styles.handleWrap}>
                  <View style={styles.handle} />
                </View>

                <View style={styles.headerRow}>
                  <View style={styles.headerIconWrap}>
                    <Coins color="#dc2626" size={20} />
                  </View>
                  <View style={styles.headerTextWrap}>
                    <Text style={styles.headerTitle}>{t('deductCoins')}</Text>
                    <Text style={styles.headerSubtitle}>
                      {walletUser?.email ? walletUser.email : walletUser?.uid ? walletUser.uid : t('user')}
                    </Text>
                  </View>
                  <Pressable onPress={closeWalletModal} style={styles.closeButton}>
                    <X color="#6b7280" size={18} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.content}>
                <Text style={styles.label}>{t('currentCoins')}</Text>
                <View style={styles.readonlyRow}>
                  {walletCoinsLoading ? (
                    <ActivityIndicator color="#dc2626" />
                  ) : (
                    <Text style={styles.readonlyValue}>{walletCoins ?? 0}</Text>
                  )}
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>{t('coinsToDeduct')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('exampleCoinsAmount')}
                    placeholderTextColor="#9ca3af"
                    keyboardType="number-pad"
                    value={walletAmountText}
                    onChangeText={setWalletAmountText}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>{t('reasonOptional')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('reason')}
                    placeholderTextColor="#9ca3af"
                    value={walletReason}
                    onChangeText={setWalletReason}
                  />
                </View>

                {walletErrorText ? <Text style={styles.errorText}>{walletErrorText}</Text> : null}

                <Pressable
                  style={[styles.submitButton, walletSubmitting || walletCoinsLoading ? styles.disabled : null]}
                  disabled={walletSubmitting || walletCoinsLoading}
                  onPress={submitWalletDeduction}
                >
                  <Text style={styles.submitText}>{walletSubmitting ? t('updating') : t('deductCoins')}</Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>

      <View className="px-6 pt-6 pb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-red-100 mr-3">
              <Users color="#dc2626" size={18} />
            </View>
            <View>
              <Text className="text-xl font-semibold text-neutral-900">{t('users')}</Text>
              <Text className="text-xs text-neutral-500">{t('usersManageSubtitle')}</Text>
            </View>
          </View>

          {isAdmin ? (
            <Pressable
              className="flex-row items-center rounded-xl px-4 py-3"
              style={{ backgroundColor: '#dc2626' }}
              onPress={openCreate}
            >
              <Plus color="#ffffff" size={18} />
              <Text className="ml-2 text-white font-semibold">{t('new')}</Text>
            </Pressable>
          ) : null}
        </View>

        {errorText ? <Text className="text-red-600 text-sm mt-3">{errorText}</Text> : null}
        {!isAdmin ? (
          <Text className="text-red-600 text-sm mt-3">{t('onlyAdminCanViewUsers')}</Text>
        ) : null}
      </View>

      {isAdmin ? (
        <View className="flex-1 px-6">
          {renderHeader()}
          <FlatList
            data={users}
            keyExtractor={(item) => item.uid}
            renderItem={renderRow}
            onEndReachedThreshold={0.3}
            onEndReached={loadNextPage}
            refreshing={isRefreshing}
            onRefresh={loadFirstPage}
            ListFooterComponent={
              isLoading ? (
                <View className="py-4">
                  <ActivityIndicator />
                </View>
              ) : hasMore ? (
                <View className="py-4" />
              ) : (
                <View className="py-4">
                  <Text className="text-center text-xs text-neutral-400">{t('noMoreUsers')}</Text>
                </View>
              )
            }
            className="bg-white rounded-xl border border-neutral-100 mt-3"
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerContainer: {
    paddingTop: 6,
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  handleWrap: {
    alignItems: 'center',
  },
  handle: {
    height: 4,
    width: 48,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    height: 40,
    width: 40,
    borderRadius: 999,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fee2e2',
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
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 22,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6b7280',
    marginBottom: 6,
  },
  readonlyRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  readonlyValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  field: {
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  submitButton: {
    marginTop: 6,
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.6,
  },
});
