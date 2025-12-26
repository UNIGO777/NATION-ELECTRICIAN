import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pencil, Plus, Users } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';

import CreateUserModal from '@/AdminComponents/CreateUserModal';
import { fetchUsersPage, type AdminUserRecord, type UsersPageCursor } from '@/Globalservices/adminUserServices';
import { useUserStore } from '@/Globalservices/userStore';

export default function AdminUsers() {
  const params = useLocalSearchParams<{ openCreate?: string; createNonce?: string }>();
  const isAdmin = useUserStore((s) => Boolean(s.user?.isAdmin));
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [cursor, setCursor] = useState<UsersPageCursor>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingUser, setEditingUser] = useState<AdminUserRecord | null>(null);

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
      const message = err instanceof Error ? err.message : 'Failed to load users';
      setErrorText(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [isAdmin]);

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
      const message = err instanceof Error ? err.message : 'Failed to load users';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, [cursor, hasMore, isAdmin, isLoading, isRefreshing]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const columns = useMemo(
    () => [
      { key: 'email', label: 'Email', flex: 2 },
      { key: 'password', label: 'Password', flex: 2 },
      { key: 'uid', label: 'UID', flex: 2 },
      { key: 'role', label: 'Role', flex: 1 },
      { key: 'actions', label: '', flex: 0.6 },
    ],
    []
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

  useEffect(() => {
    if (params.openCreate !== '1') return;
    const nonce = typeof params.createNonce === 'string' ? params.createNonce : null;
    if (nonce && nonce === lastCreateNonceRef.current) return;
    lastCreateNonceRef.current = nonce ?? '__opened__';
    openCreate();
  }, [params.createNonce, params.openCreate]);

  const renderRow = ({ item }: { item: AdminUserRecord }) => (
    <View className="flex-row px-3 py-3 border-b border-neutral-100 bg-white">
      <Text className="text-xs text-neutral-900" style={{ flex: 2 }} numberOfLines={1}>
        {item.email ?? '-'}
      </Text>
      <Text className="text-xs text-neutral-900" style={{ flex: 1 }} numberOfLines={1}>
        ••••••••
      </Text>
      <Text className="text-xs text-neutral-900" style={{ flex: 2 }} numberOfLines={1}>
        {item.uid}
      </Text>
      <Text className="text-xs text-neutral-700" style={{ flex: 1 }} numberOfLines={1}>
        {item.role ?? '-'}
      </Text>
      <View style={{ flex: 0.6, alignItems: 'flex-end' }}>
        <Pressable
          className="h-8 w-8 items-center justify-center rounded-lg bg-neutral-100"
          onPress={() => openEdit(item)}
          disabled={!isAdmin}
        >
          <Pencil color="#111827" size={16} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-white">
      <CreateUserModal
        visible={isModalOpen}
        onClose={closeModal}
        onSaved={loadFirstPage}
        mode={modalMode}
        initialUser={editingUser}
      />

      <View className="px-6 pt-6 pb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-red-100 mr-3">
              <Users color="#dc2626" size={18} />
            </View>
            <View>
              <Text className="text-xl font-semibold text-neutral-900">Users</Text>
              <Text className="text-xs text-neutral-500">Manage users (10 per page)</Text>
            </View>
          </View>

          {isAdmin ? (
            <Pressable
              className="flex-row items-center rounded-xl px-4 py-3"
              style={{ backgroundColor: '#dc2626' }}
              onPress={openCreate}
            >
              <Plus color="#ffffff" size={18} />
              <Text className="ml-2 text-white font-semibold">New</Text>
            </Pressable>
          ) : null}
        </View>

        {errorText ? <Text className="text-red-600 text-sm mt-3">{errorText}</Text> : null}
        {!isAdmin ? (
          <Text className="text-red-600 text-sm mt-3">Only admin can view and create users.</Text>
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
                  <Text className="text-center text-xs text-neutral-400">No more users</Text>
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
