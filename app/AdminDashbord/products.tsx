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
import { ImagePlus, PackagePlus, Pencil, RefreshCcw, Search, Trash2, X } from 'lucide-react-native';

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

type ProductRecord = {
  name?: string | null;
  description?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
};

type ProductRow = {
  id: string;
  data: ProductRecord;
};

type ModalMode = 'create' | 'edit';

export default function AdminProducts() {
  const user = useUserStore((s) => s.user);
  const adminUid = user?.uid ?? null;

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [description, setDescription] = useState('');
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setName('');
    setPriceInput('');
    setDescription('');
    setPickedImageUri(null);
    setExistingImageUrl(null);
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
    (row: ProductRow) => {
      resetForm();
      setModalMode('edit');
      setEditingId(row.id);
      setName(typeof row.data.name === 'string' ? row.data.name : '');
      setPriceInput(typeof row.data.price === 'number' ? String(row.data.price) : '');
      setDescription(typeof row.data.description === 'string' ? row.data.description : '');
      setExistingImageUrl(typeof row.data.imageUrl === 'string' ? row.data.imageUrl : null);
      setModalVisible(true);
    },
    [resetForm]
  );

  const fetchProducts = useCallback(async () => {
    if (!user?.isAdmin) return;
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
  }, [user?.isAdmin]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const pickImage = useCallback(async () => {
    if (submitting) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to select product image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets[0]?.uri;
    if (!uri) return;
    setPickedImageUri(uri);
  }, [submitting]);

  const uploadProductImage = useCallback(async (params: { productId: string; uri: string }) => {
    const normalized = params.uri.split('?')[0] ?? params.uri;
    const rawExt = normalized.split('.').pop()?.toLowerCase();
    const ext = rawExt && rawExt.length <= 5 ? rawExt : 'jpg';

    const res = await fetch(params.uri);
    const blob = await res.blob();
    const objectRef = storageRef(storage, `Products/${params.productId}/main.${ext}`);
    await uploadBytes(objectRef, blob, { contentType: blob.type || 'image/jpeg' });
    return getDownloadURL(objectRef);
  }, []);

  const submit = useCallback(async () => {
    if (!adminUid) return;
    if (submitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter product name.');
      return;
    }

    const price = Number(priceInput);
    if (!Number.isFinite(price) || price <= 0) {
      Alert.alert('Price required', 'Please enter valid product price.');
      return;
    }

    if (modalMode === 'create' && !pickedImageUri) {
      Alert.alert('Image required', 'Please select product image.');
      return;
    }

    setSubmitting(true);
    setErrorText(null);
    try {
      const now = Date.now();
      if (modalMode === 'create') {
        const productRef = doc(collection(db, 'Products'));
        const imageUrl = pickedImageUri ? await uploadProductImage({ productId: productRef.id, uri: pickedImageUri }) : null;
        await setDoc(productRef, {
          name: trimmedName,
          description: description.trim() || null,
          price,
          imageUrl,
          createdAt: now,
          updatedAt: now,
          createdBy: adminUid,
        });
      } else {
        if (!editingId) {
          setErrorText('Product id missing.');
          return;
        }
        const productRef = doc(db, 'Products', editingId);
        const nextImageUrl = pickedImageUri
          ? await uploadProductImage({ productId: editingId, uri: pickedImageUri })
          : existingImageUrl ?? null;
        await updateDoc(productRef, {
          name: trimmedName,
          description: description.trim() || null,
          price,
          imageUrl: nextImageUrl,
          updatedAt: now,
          updatedBy: adminUid,
        });
      }

      await fetchProducts();
      closeModal();
    } catch {
      setErrorText('Unable to save product right now.');
    } finally {
      setSubmitting(false);
    }
  }, [
    adminUid,
    closeModal,
    description,
    editingId,
    existingImageUrl,
    fetchProducts,
    modalMode,
    name,
    pickedImageUri,
    priceInput,
    submitting,
    uploadProductImage,
  ]);

  const modalTitle = useMemo(() => (modalMode === 'create' ? 'Add Product' : 'Edit Product'), [modalMode]);
  const submitLabel = useMemo(() => {
    if (submitting) return modalMode === 'create' ? 'Creating...' : 'Updating...';
    return modalMode === 'create' ? 'Create Product' : 'Update Product';
  }, [modalMode, submitting]);

  const deleteProduct = useCallback(() => {
    if (!adminUid) return;
    if (submitting) return;
    if (modalMode !== 'edit') return;
    if (!editingId) {
      setErrorText('Product id missing.');
      return;
    }

    Alert.alert('Delete product?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          setErrorText(null);
          try {
            await deleteDoc(doc(db, 'Products', editingId));
            await fetchProducts();
            closeModal();
          } catch {
            setErrorText('Unable to delete product right now.');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }, [adminUid, closeModal, editingId, fetchProducts, modalMode, submitting]);

  const previewUri = pickedImageUri ?? existingImageUrl ?? null;

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const nameValue = typeof row.data.name === 'string' ? row.data.name : '';
      const descValue = typeof row.data.description === 'string' ? row.data.description : '';
      const priceValue = typeof row.data.price === 'number' ? String(row.data.price) : '';
      const haystack = `${nameValue} ${descValue} ${priceValue}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchText]);

  if (!user) return <Redirect href="/login" />;
  if (!user.isAdmin) return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.pageTitle}>Products</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton} onPress={fetchProducts} disabled={loading}>
            <RefreshCcw color="#dc2626" size={18} />
          </Pressable>
          <Pressable style={styles.addButton} onPress={openCreate}>
            <PackagePlus size={18} color="#ffffff" />
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchField}>
          <Search size={16} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products"
            placeholderTextColor="#9ca3af"
            value={searchText}
            onChangeText={setSearchText}
            autoCapitalize="none"
            editable={!loading}
          />
          {searchText.trim() ? (
            <Pressable
              style={styles.searchClear}
              onPress={() => setSearchText('')}
              hitSlop={10}
            >
              <X size={16} color="#6b7280" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#dc2626" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {filteredRows.length ? (
            filteredRows.map((row) => {
              const rowName = typeof row.data.name === 'string' && row.data.name ? row.data.name : '-';
              const rowPrice = typeof row.data.price === 'number' ? row.data.price : null;
              const rowImage = typeof row.data.imageUrl === 'string' ? row.data.imageUrl : null;
              const rowDescription =
                typeof row.data.description === 'string' && row.data.description ? row.data.description.trim() : '';
              return (
                <Pressable key={row.id} style={styles.productCard} onPress={() => openEdit(row)}>
                  <View style={styles.productLeft}>
                    <View style={styles.thumbWrap}>
                      {rowImage ? (
                        <Image source={{ uri: rowImage }} style={styles.thumb} />
                      ) : (
                        <View style={styles.thumbFallback}>
                          <ImagePlus size={18} color="#9ca3af" />
                        </View>
                      )}
                    </View>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName} numberOfLines={1}>
                        {rowName}
                      </Text>
                      <Text style={styles.productMeta} numberOfLines={1}>
                        {rowPrice !== null ? `Rs. ${rowPrice}` : '-'}
                      </Text>
                      {rowDescription ? (
                        <Text style={styles.productDesc} numberOfLines={2}>
                          {rowDescription}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.productRight}>
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
              <Text style={styles.emptyTitle}>{searchText.trim() ? 'No matching products' : 'No products yet'}</Text>
              <Text style={styles.emptySubtitle}>
                {searchText.trim() ? 'Try a different search.' : 'Tap Add to upload your first product.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <Pressable style={styles.backdrop} onPress={closeModal}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <SafeAreaView edges={['bottom']}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.modalHeader}>
                  <View style={styles.handleWrap}>
                    <View style={styles.handle} />
                  </View>
                  <View style={styles.modalHeaderRow}>
                    <View style={styles.modalIconWrap}>
                      {modalMode === 'create' ? <PackagePlus size={20} color="#dc2626" /> : <Pencil size={20} color="#dc2626" />}
                    </View>
                    <View style={styles.modalHeaderText}>
                      <Text style={styles.modalTitle}>{modalTitle}</Text>
                      <Text style={styles.modalSubtitle}>Upload, edit and manage products</Text>
                    </View>
                    <Pressable onPress={closeModal} style={styles.closeButton}>
                      <X size={18} color="#6b7280" />
                    </Pressable>
                  </View>
                </View>

                <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
                  <Text style={styles.label}>Product Image</Text>
                  <Pressable style={styles.imagePicker} onPress={pickImage} disabled={submitting}>
                    {previewUri ? (
                      <Image source={{ uri: previewUri }} style={styles.imagePreview} />
                    ) : (
                      <View style={styles.imageEmpty}>
                        <ImagePlus size={22} color="#dc2626" />
                        <Text style={styles.imageEmptyText}>Select image</Text>
                      </View>
                    )}
                  </Pressable>

                  <View style={styles.field}>
                    <Text style={styles.label}>Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Product name"
                      placeholderTextColor="#9ca3af"
                      value={name}
                      onChangeText={setName}
                      editable={!submitting}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Price</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      placeholderTextColor="#9ca3af"
                      keyboardType="numeric"
                      value={priceInput}
                      onChangeText={setPriceInput}
                      editable={!submitting}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Description</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="Optional"
                      placeholderTextColor="#9ca3af"
                      value={description}
                      onChangeText={setDescription}
                      editable={!submitting}
                      multiline
                    />
                  </View>
                </ScrollView>

                <View style={styles.footer}>
                  <View style={styles.footerRow}>
                    {modalMode === 'edit' ? (
                      <Pressable
                        style={[styles.deleteButton, styles.footerButton, submitting ? styles.disabled : null]}
                        onPress={deleteProduct}
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
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    paddingVertical: 0,
  },
  searchClear: {
    height: 28,
    width: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
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
  productCard: {
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
  productLeft: {
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
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  productMeta: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
  },
  productDesc: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  productRight: {
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
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
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
