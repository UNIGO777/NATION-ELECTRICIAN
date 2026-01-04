import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Gift, ImagePlus, Pencil, Plus, RefreshCcw, Trash2, X } from 'lucide-react-native';

import { db, storage } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';

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
  updatedAt?: number | null;
};

type SchemeRow = {
  id: string;
  data: SchemeRecord;
};

type ModalMode = 'create' | 'edit';

type RewardDraft = {
  key: string;
  name: string;
  priceInput: string;
};

const createRewardDraft = (seed?: Partial<RewardDraft>): RewardDraft => ({
  key: seed?.key ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`,
  name: seed?.name ?? '',
  priceInput: seed?.priceInput ?? '',
});

const coerceRewardDrafts = (raw: unknown): RewardDraft[] => {
  if (!Array.isArray(raw)) return [createRewardDraft()];
  const drafts: RewardDraft[] = [];

  raw.forEach((item) => {
    if (typeof item === 'string') {
      const name = item.trim();
      if (!name) return;
      drafts.push(createRewardDraft({ name, priceInput: '' }));
      return;
    }

    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const nameValue = typeof record.name === 'string' ? record.name.trim() : '';
      const priceValue = typeof record.price === 'number' ? record.price : null;
      if (!nameValue) return;
      drafts.push(createRewardDraft({ name: nameValue, priceInput: priceValue !== null ? String(priceValue) : '' }));
    }
  });

  return drafts.length ? drafts : [createRewardDraft()];
};

const formatRewardPreview = (raw: unknown): string => {
  if (!Array.isArray(raw) || !raw.length) return '-';
  if (typeof raw[0] === 'string') {
    const names = raw.filter((v) => typeof v === 'string' && v.trim()).slice(0, 3) as string[];
    return names.length ? names.join(', ') : '-';
  }

  const parts: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const price = typeof record.price === 'number' ? record.price : null;
    if (!name) continue;
    parts.push(price !== null ? `${name} (Rs. ${price})` : name);
    if (parts.length >= 3) break;
  }
  return parts.length ? parts.join(', ') : '-';
};

export default function AdminSchemes() {
  const user = useUserStore((s) => s.user);
  const adminUid = user?.uid ?? null;

  const [rows, setRows] = useState<SchemeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [requiredCoinsInput, setRequiredCoinsInput] = useState('');
  const [rewardDrafts, setRewardDrafts] = useState<RewardDraft[]>(() => [createRewardDraft()]);
  const [pickedPosterUri, setPickedPosterUri] = useState<string | null>(null);
  const [existingPosterUrl, setExistingPosterUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setTitle('');
    setRequiredCoinsInput('');
    setRewardDrafts([createRewardDraft()]);
    setPickedPosterUri(null);
    setExistingPosterUrl(null);
    setEditingId(null);
    setSubmitting(false);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    resetForm();
  }, [resetForm]);

  const openCreate = useCallback(() => {
    resetForm();
    setModalMode('create');
    setModalVisible(true);
  }, [resetForm]);

  const openEdit = useCallback(
    (row: SchemeRow) => {
      resetForm();
      setModalMode('edit');
      setEditingId(row.id);
      setTitle(typeof row.data.title === 'string' ? row.data.title : '');
      setRequiredCoinsInput(typeof row.data.requiredCoins === 'number' ? String(row.data.requiredCoins) : '');
      setRewardDrafts(coerceRewardDrafts(row.data.rewardItems));
      setExistingPosterUrl(typeof row.data.posterUrl === 'string' ? row.data.posterUrl : null);
      setModalVisible(true);
    },
    [resetForm]
  );

  const fetchSchemes = useCallback(async () => {
    if (!user?.isAdmin) return;
    setLoading(true);
    setErrorText(null);
    try {
      const snap = await getDocs(query(collection(db, 'Schemes'), orderBy('createdAt', 'desc')));
      const nextRows = snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, data: d.data() as SchemeRecord }));
      setRows(nextRows);
    } catch {
      setErrorText('Unable to load schemes right now.');
    } finally {
      setLoading(false);
    }
  }, [user?.isAdmin]);

  useEffect(() => {
    void fetchSchemes();
  }, [fetchSchemes]);

  const pickPoster = useCallback(async () => {
    if (submitting) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to select scheme poster.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const uri = result.assets[0]?.uri;
    if (!uri) return;
    setPickedPosterUri(uri);
  }, [submitting]);

  const uploadSchemePoster = useCallback(async (params: { schemeId: string; uri: string }) => {
    const normalized = params.uri.split('?')[0] ?? params.uri;
    const rawExt = normalized.split('.').pop()?.toLowerCase();
    const ext = rawExt && rawExt.length <= 5 ? rawExt : 'jpg';

    const res = await fetch(params.uri);
    const blob = await res.blob();
    const objectRef = storageRef(storage, `Schemes/${params.schemeId}/poster.${ext}`);
    await uploadBytes(objectRef, blob, { contentType: blob.type || 'image/jpeg' });
    return getDownloadURL(objectRef);
  }, []);

  const addRewardRow = useCallback(() => {
    setRewardDrafts((prev) => [...prev, createRewardDraft()]);
  }, []);

  const removeRewardRow = useCallback((key: string) => {
    setRewardDrafts((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.key !== key);
    });
  }, []);

  const updateRewardRow = useCallback((key: string, patch: Partial<Pick<RewardDraft, 'name' | 'priceInput'>>) => {
    setRewardDrafts((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const submit = useCallback(async () => {
    if (!adminUid) return;
    if (submitting) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Title required', 'Please enter scheme title.');
      return;
    }

    const requiredCoins = Number(requiredCoinsInput);
    if (!Number.isFinite(requiredCoins) || requiredCoins <= 0) {
      Alert.alert('Required coins', 'Please enter valid required coins.');
      return;
    }

    const rewardItems: RewardItem[] = [];
    for (const row of rewardDrafts) {
      const name = row.name.trim();
      const price = Number(row.priceInput);
      if (!name) {
        Alert.alert('Reward items', 'Please enter reward item name.');
        return;
      }
      if (!Number.isFinite(price) || price <= 0) {
        Alert.alert('Reward items', `Please enter valid price for "${name}".`);
        return;
      }
      rewardItems.push({ name, price });
    }
    if (!rewardItems.length) {
      Alert.alert('Reward items', 'Please add at least one reward item.');
      return;
    }

    if (modalMode === 'create' && !pickedPosterUri) {
      Alert.alert('Poster required', 'Please select scheme poster.');
      return;
    }

    setSubmitting(true);
    setErrorText(null);
    try {
      const now = Date.now();
      if (modalMode === 'create') {
        const schemeRef = doc(collection(db, 'Schemes'));
        const posterUrl = pickedPosterUri ? await uploadSchemePoster({ schemeId: schemeRef.id, uri: pickedPosterUri }) : null;
        await setDoc(schemeRef, {
          title: trimmedTitle,
          requiredCoins,
          rewardItems,
          posterUrl,
          createdAt: now,
          updatedAt: now,
          createdBy: adminUid,
        });
      } else {
        if (!editingId) {
          setErrorText('Scheme id missing.');
          return;
        }
        const schemeRef = doc(db, 'Schemes', editingId);
        const nextPosterUrl = pickedPosterUri
          ? await uploadSchemePoster({ schemeId: editingId, uri: pickedPosterUri })
          : existingPosterUrl ?? null;
        await updateDoc(schemeRef, {
          title: trimmedTitle,
          requiredCoins,
          rewardItems,
          posterUrl: nextPosterUrl,
          updatedAt: now,
          updatedBy: adminUid,
        });
      }

      await fetchSchemes();
      closeModal();
    } catch {
      setErrorText('Unable to save scheme right now.');
    } finally {
      setSubmitting(false);
    }
  }, [
    adminUid,
    closeModal,
    editingId,
    existingPosterUrl,
    fetchSchemes,
    modalMode,
    pickedPosterUri,
    requiredCoinsInput,
    rewardDrafts,
    submitting,
    title,
    uploadSchemePoster,
  ]);

  const modalTitle = useMemo(() => (modalMode === 'create' ? 'Add Scheme' : 'Edit Scheme'), [modalMode]);
  const submitLabel = useMemo(() => {
    if (submitting) return modalMode === 'create' ? 'Creating...' : 'Updating...';
    return modalMode === 'create' ? 'Create Scheme' : 'Update Scheme';
  }, [modalMode, submitting]);

  const deleteScheme = useCallback(() => {
    if (!adminUid) return;
    if (submitting) return;
    if (modalMode !== 'edit') return;
    if (!editingId) {
      setErrorText('Scheme id missing.');
      return;
    }

    Alert.alert('Delete scheme?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          setErrorText(null);
          try {
            await deleteDoc(doc(db, 'Schemes', editingId));
            await fetchSchemes();
            closeModal();
          } catch {
            setErrorText('Unable to delete scheme right now.');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }, [adminUid, closeModal, editingId, fetchSchemes, modalMode, submitting]);

  const previewUri = pickedPosterUri ?? existingPosterUrl ?? null;

  if (!user) return <Redirect href="/login" />;
  if (!user.isAdmin) return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView edges={[]} style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Schemes</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton} onPress={fetchSchemes} disabled={loading}>
            <RefreshCcw color="#dc2626" size={18} />
          </Pressable>
          <Pressable style={styles.addButton} onPress={openCreate}>
            <Gift size={18} color="#ffffff" />
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>
      </View>

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#dc2626" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {rows.length ? (
            rows.map((row) => {
              const schemeTitle = typeof row.data.title === 'string' && row.data.title ? row.data.title : '-';
              const posterUrl = typeof row.data.posterUrl === 'string' ? row.data.posterUrl : null;
              const requiredCoins = typeof row.data.requiredCoins === 'number' ? row.data.requiredCoins : null;
              const rewardLabel = formatRewardPreview(row.data.rewardItems);

              return (
                <Pressable key={row.id} style={styles.schemeCard} onPress={() => openEdit(row)}>
                  <View style={styles.schemeLeft}>
                    <View style={styles.thumbWrap}>
                      {posterUrl ? (
                        <Image source={{ uri: posterUrl }} style={styles.thumb} />
                      ) : (
                        <View style={styles.thumbFallback}>
                          <ImagePlus size={18} color="#9ca3af" />
                        </View>
                      )}
                    </View>
                    <View style={styles.schemeInfo}>
                      <Text style={styles.schemeTitle} numberOfLines={1}>
                        {schemeTitle}
                      </Text>
                      <Text style={styles.schemeMeta} numberOfLines={1}>
                        {requiredCoins !== null ? `Required Coins: ${requiredCoins}` : 'Required Coins: -'}
                      </Text>
                      <Text style={styles.schemeRewards} numberOfLines={2}>
                        {rewardLabel}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.schemeRight}>
                    <View style={styles.editPill}>
                      <Pencil size={14} color="#dc2626" />
                      <Text style={styles.editPillText}>Edit</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No schemes yet</Text>
              <Text style={styles.emptySubtitle}>Tap Add to create your first scheme.</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <Pressable style={styles.backdrop} onPress={closeModal}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <SafeAreaView edges={['top', 'bottom']} style={styles.sheetSafeArea}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetInner}>
                <View style={styles.modalHeader}>
                  <View style={styles.handleWrap}>
                    <View style={styles.handle} />
                  </View>
                  <View style={styles.modalHeaderRow}>
                    <View style={styles.modalIconWrap}>{modalMode === 'create' ? <Gift size={20} color="#dc2626" /> : <Pencil size={20} color="#dc2626" />}</View>
                    <View style={styles.modalHeaderText}>
                      <Text style={styles.modalTitle}>{modalTitle}</Text>
                      <Text style={styles.modalSubtitle}>Add poster, reward items and required coins</Text>
                    </View>
                    <Pressable onPress={closeModal} style={styles.closeButton}>
                      <X size={18} color="#6b7280" />
                    </Pressable>
                  </View>
                </View>

                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.label}>Poster</Text>
                  <Pressable style={styles.imagePicker} onPress={pickPoster} disabled={submitting}>
                    {previewUri ? (
                      <Image source={{ uri: previewUri }} style={styles.imagePreview} />
                    ) : (
                      <View style={styles.imageEmpty}>
                        <ImagePlus size={22} color="#dc2626" />
                        <Text style={styles.imageEmptyText}>Select poster</Text>
                      </View>
                    )}
                  </Pressable>

                  <View style={styles.field}>
                    <Text style={styles.label}>Title</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Scheme title"
                      placeholderTextColor="#9ca3af"
                      value={title}
                      onChangeText={setTitle}
                      editable={!submitting}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Required Coins</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      placeholderTextColor="#9ca3af"
                      keyboardType="numeric"
                      value={requiredCoinsInput}
                      onChangeText={setRequiredCoinsInput}
                      editable={!submitting}
                    />
                  </View>

                  <View style={styles.field}>
                    <View style={styles.rewardHeaderRow}>
                      <Text style={styles.label}>Reward Items</Text>
                      <Pressable style={styles.rewardAddButton} onPress={addRewardRow} disabled={submitting}>
                        <Plus size={16} color="#dc2626" />
                        <Text style={styles.rewardAddText}>Add Item</Text>
                      </Pressable>
                    </View>

                    {rewardDrafts.map((r) => (
                      <View key={r.key} style={styles.rewardRow}>
                        <TextInput
                          style={[styles.input, styles.rewardNameInput]}
                          placeholder="Name"
                          placeholderTextColor="#9ca3af"
                          value={r.name}
                          onChangeText={(v) => updateRewardRow(r.key, { name: v })}
                          editable={!submitting}
                        />
                        <TextInput
                          style={[styles.input, styles.rewardPriceInput]}
                          placeholder="Price"
                          placeholderTextColor="#9ca3af"
                          keyboardType="numeric"
                          value={r.priceInput}
                          onChangeText={(v) => updateRewardRow(r.key, { priceInput: v })}
                          editable={!submitting}
                        />
                        <Pressable
                          style={[styles.rewardRemoveButton, rewardDrafts.length <= 1 ? styles.rewardRemoveDisabled : null]}
                          onPress={() => removeRewardRow(r.key)}
                          disabled={submitting || rewardDrafts.length <= 1}
                          hitSlop={10}
                        >
                          <X size={16} color={rewardDrafts.length <= 1 ? '#9ca3af' : '#6b7280'} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                <View style={styles.footer}>
                  <View style={styles.footerRow}>
                    {modalMode === 'edit' ? (
                      <Pressable
                        style={[styles.deleteButton, styles.footerButton, submitting ? styles.disabled : null]}
                        onPress={deleteScheme}
                        disabled={submitting}
                      >
                        <Trash2 size={16} color="#ffffff" />
                        <Text style={styles.footerButtonText}>Delete</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[styles.submitButton, styles.footerButton, submitting ? styles.disabled : null]}
                      onPress={submit}
                      disabled={submitting}
                    >
                      <Text style={styles.footerButtonText}>{submitLabel}</Text>
                    </Pressable>
                  </View>
                </View>
              </KeyboardAvoidingView>
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
    backgroundColor: '#f3f4f6',
  },
  headerRow: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    marginHorizontal: 24,
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#dc2626',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 24,
    gap: 12,
  },
  schemeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  schemeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  thumbWrap: {
    height: 52,
    width: 52,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#ffffff',
  },
  thumb: {
    height: 52,
    width: 52,
  },
  thumbFallback: {
    height: 52,
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  schemeInfo: {
    flex: 1,
  },
  schemeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  schemeMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  schemeRewards: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  schemeRight: {
    alignItems: 'flex-end',
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  editPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  emptyWrap: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 26,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
    textAlign: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    maxHeight: '100%',
  },
  sheetInner: {
    flex: 1,
  },
  modalHeader: {
    paddingTop: 10,
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
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  modalIconWrap: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderText: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  closeButton: {
    height: 34,
    width: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexGrow: 1,
  },
  modalScroll: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
    marginBottom: 6,
  },
  imagePicker: {
    borderWidth: 1,
    borderColor: '#fee2e2',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  imagePreview: {
    height: 160,
    width: '100%',
  },
  imageEmpty: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff7ed',
  },
  imageEmptyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
  },
  field: {
    marginTop: 6,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    fontSize: 14,
    color: '#111827',
  },
  rewardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rewardAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
    marginTop: 12,
  },
  rewardAddText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  rewardNameInput: {
    flex: 1,
  },
  rewardPriceInput: {
    width: 90,
  },
  rewardRemoveButton: {
    height: 42,
    width: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rewardRemoveDisabled: {
    opacity: 0.6,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  submitButton: {
    backgroundColor: '#dc2626',
  },
  deleteButton: {
    backgroundColor: '#111827',
  },
  footerButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.7,
  },
});
