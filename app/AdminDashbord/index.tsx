import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { ClipboardList, FileText, Package, Users, UserPlus, PackagePlus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { fetchBillsCount, fetchProductsCount, fetchSchemeRequestsCount, fetchUsersCount } from '@/Globalservices/adminUserServices';
import { db, storage } from '@/Globalservices/firebase';
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore/lite';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';

type PosterDoc = {
  id?: string | null;
  imageUrl?: string | null;
  enabled?: boolean | null;
  createdAt?: number | null;
  updatedAt?: number | null;
};

const AdminHomePage: React.FC = () => {
  const [usersCount, setUsersCount] = useState<number | null>(null);
  const [billsCount, setBillsCount] = useState<number | null>(null);
  const [productsCount, setProductsCount] = useState<number | null>(null);
  const [schemeRequestsCount, setSchemeRequestsCount] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [posterModalOpen, setPosterModalOpen] = useState(false);
  const [posterImageUri, setPosterImageUri] = useState<string | null>(null);
  const [posterUploading, setPosterUploading] = useState(false);
  const [posters, setPosters] = useState<PosterDoc[]>([]);
  const [postersLoading, setPostersLoading] = useState(false);
  const [postersBusyId, setPostersBusyId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([fetchUsersCount(), fetchBillsCount(), fetchProductsCount(), fetchSchemeRequestsCount()])
      .then(([userCount, billCount, productCount, schemeCount]) => {
        if (!isMounted) return;
        setUsersCount(userCount);
        setBillsCount(billCount);
        setProductsCount(productCount);
        setSchemeRequestsCount(schemeCount);
      })
      .catch((err) => {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Failed to load counts';
        setErrorText(message);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const goToUsers = useCallback(() => {
    router.push('/AdminDashbord/users');
  }, []);

  const goToUsersAndOpenCreate = useCallback(() => {
    router.push({
      pathname: '/AdminDashbord/users',
      params: { openCreate: '1', createNonce: String(Date.now()) },
    });
  }, []);

  const goToProducts = useCallback(() => {
    router.push('/AdminDashbord/products');
  }, []);

  const goToBills = useCallback(() => {
    router.push('/AdminDashbord/bills');
  }, []);

  const goToSchemeRequests = useCallback(() => {
    router.push('/AdminDashbord/schemerequests');
  }, []);

  const menuItems = useMemo(
    () => [
      { title: 'Users', count: usersCount ?? 0, Icon: Users, onPress: goToUsers },
      { title: 'Scheme Requests', count: schemeRequestsCount ?? 0, Icon: ClipboardList, onPress: goToSchemeRequests },
      { title: 'Products', count: productsCount ?? 0, Icon: Package, onPress: goToProducts },
      { title: 'Bills', count: billsCount ?? 0, Icon: FileText, onPress: goToBills },
    ],
    [billsCount, goToBills, goToProducts, goToSchemeRequests, goToUsers, productsCount, schemeRequestsCount, usersCount]
  );

  const quickActions = useMemo(
    () => [
      { label: 'Add User', Icon: UserPlus },
      { label: 'Add Product', Icon: PackagePlus },
    ],
    []
  );

  const fetchPosters = useCallback(async () => {
    setPostersLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'Posters'), orderBy('createdAt', 'desc'), limit(25)));
      const next = snap.docs.map((d) => d.data() as PosterDoc);
      setPosters(next);
    } catch {
      setPosters([]);
    } finally {
      setPostersLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPosters();
  }, [fetchPosters]);

  const pickPosterImage = useCallback(async () => {
    if (posterUploading) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to select poster image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.85,
    });
    if (result.canceled) return;
    const uri = result.assets[0]?.uri ?? null;
    if (!uri) return;
    setPosterImageUri(uri);
  }, [posterUploading]);

  const resetPosterForm = useCallback(() => {
    setPosterImageUri(null);
    setPosterUploading(false);
  }, []);

  const closePosterModal = useCallback(() => {
    setPosterModalOpen(false);
    resetPosterForm();
  }, [resetPosterForm]);

  const uploadPoster = useCallback(async () => {
    if (posterUploading) return;
    if (!posterImageUri) {
      Alert.alert('Poster required', 'Please select a poster image.');
      return;
    }

    setPosterUploading(true);
    try {
      const now = Date.now();
      const posterRef = doc(collection(db, 'Posters'));

      const normalized = posterImageUri.split('?')[0] ?? posterImageUri;
      const rawExt = normalized.split('.').pop()?.toLowerCase();
      const ext = rawExt && rawExt.length <= 5 ? rawExt : 'jpg';

      const res = await fetch(posterImageUri);
      const blob = await res.blob();
      const objectRef = storageRef(storage, `Posters/${posterRef.id}.${ext}`);
      await uploadBytes(objectRef, blob, { contentType: blob.type || 'image/jpeg' });
      const imageUrl = await getDownloadURL(objectRef);

      await setDoc(
        posterRef,
        {
          id: posterRef.id,
          imageUrl,
          createdAt: now,
          updatedAt: now,
          enabled: true,
        },
        { merge: true }
      );

      Alert.alert('Uploaded', 'Poster uploaded successfully.');
      await fetchPosters();
      closePosterModal();
    } catch {
      Alert.alert('Upload failed', 'Unable to upload poster right now. Please try again.');
      setPosterUploading(false);
    }
  }, [closePosterModal, fetchPosters, posterImageUri, posterUploading]);

  const deletePoster = useCallback(
    (poster: PosterDoc) => {
      const id = typeof poster.id === 'string' ? poster.id : null;
      if (!id) return;
      if (postersBusyId) return;

      Alert.alert('Delete poster', 'Are you sure you want to delete this poster?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setPostersBusyId(id);
            try {
              if (typeof poster.imageUrl === 'string' && poster.imageUrl) {
                await deleteObject(storageRef(storage, poster.imageUrl));
              }
            } catch {
            } finally {
              try {
                await deleteDoc(doc(db, 'Posters', id));
              } catch {
              }
              await fetchPosters();
              setPostersBusyId(null);
            }
          },
        },
      ]);
    },
    [fetchPosters, postersBusyId]
  );

  return (
    <SafeAreaView edges={[]} style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <Text style={styles.pageTitle}>Overview</Text>
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <View style={styles.statsContainer}>
          {menuItems.map(({ Icon, count, title, onPress }, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.statCard}
              onPress={onPress}
              disabled={!onPress}
            >
              <View style={styles.statIconWrap}>
                <Icon color="#dc2626" size={18} />
              </View>
              <Text style={styles.statNumber}>{count}</Text>
              <Text style={styles.statLabel}>{title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsContainer}>
          {quickActions.map(({ Icon, label }, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.actionButton}
              onPress={label === 'Add User' ? goToUsersAndOpenCreate : label === 'Add Product' ? goToProducts : undefined}
              disabled={label !== 'Add User' && label !== 'Add Product'}
            >
              <View style={styles.actionIconWrap}>
                <Icon color="#dc2626" size={18} />
              </View>
              <Text style={styles.actionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Posters</Text>
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={() => setPosterModalOpen(true)} disabled={posterUploading}>
            <View style={styles.actionIconWrap}>
              <PackagePlus color="#dc2626" size={18} />
            </View>
            <Text style={styles.actionLabel}>Upload Poster</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.postersHeaderRow}>
          <Text style={styles.postersSubtitle}>Existing Posters</Text>
          <Pressable onPress={fetchPosters} disabled={postersLoading} style={styles.postersRefreshButton}>
            <Text style={styles.postersRefreshText}>{postersLoading ? 'Loading...' : 'Refresh'}</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.postersRow}>
          {postersLoading ? (
            <View style={styles.posterThumb}>
              <ActivityIndicator color="#dc2626" />
            </View>
          ) : posters.length ? (
            posters.map((p, idx) => {
              const id = typeof p.id === 'string' && p.id ? p.id : String(idx);
              const url = typeof p.imageUrl === 'string' ? p.imageUrl : '';
              const disabled = postersBusyId === id;
              return (
                <View key={id} style={styles.posterThumbWrap}>
                  <View style={styles.posterThumb}>
                    {url ? <Image source={{ uri: url }} style={styles.posterThumbImage} /> : null}
                  </View>
                  <Pressable
                    onPress={() => deletePoster(p)}
                    disabled={disabled}
                    style={[styles.posterDeleteButton, disabled ? styles.posterDeleteButtonDisabled : null]}
                  >
                    <Text style={styles.posterDeleteText}>{disabled ? '...' : 'Delete'}</Text>
                  </Pressable>
                </View>
              );
            })
          ) : (
            <View style={styles.posterThumb}>
              <Text style={styles.postersEmptyText}>No posters yet</Text>
            </View>
          )}
        </ScrollView>
      </ScrollView>

      <Modal visible={posterModalOpen} transparent animationType="fade" onRequestClose={closePosterModal}>
        <View style={styles.posterOverlay}>
          <View style={styles.posterCard}>
            <View style={styles.posterHeader}>
              <Text style={styles.posterTitle}>Upload Poster</Text>
              <Pressable onPress={closePosterModal} disabled={posterUploading} style={styles.posterClose}>
                <Text style={styles.posterCloseText}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.posterBody}>
              <View style={styles.posterPreview}>
                {posterImageUri ? <Image source={{ uri: posterImageUri }} style={styles.posterPreviewImage} /> : null}
              </View>

              <View style={styles.posterButtonsRow}>
                <Pressable onPress={pickPosterImage} disabled={posterUploading} style={styles.posterPickButton}>
                  <Text style={styles.posterPickButtonText}>Select Image</Text>
                </Pressable>
                <Pressable
                  onPress={uploadPoster}
                  disabled={posterUploading}
                  style={[styles.posterUploadButton, posterUploading ? styles.posterUploadButtonDisabled : null]}
                >
                  {posterUploading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.posterUploadButtonText}>Upload</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  pageTitle: {
    marginTop: 16,
    marginHorizontal: 24,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  errorText: {
    marginTop: 10,
    marginHorizontal: 24,
    fontSize: 13,
    fontWeight: '600',
    color: '#dc2626',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  statCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginHorizontal: 8,
    marginBottom: 12,
    width: '44%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statIconWrap: {
    height: 32,
    width: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#dc2626',
  },
  statLabel: {
    fontSize: 14,
    color: '#111827',
    marginTop: 4,
  },
  sectionTitle: {
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  actionButton: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    marginBottom: 12,
    width: '44%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  actionIconWrap: {
    height: 32,
    width: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionLabel: {
    fontSize: 14,
    color: '#111827',
  },
  posterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  posterCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
  },
  posterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  posterTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  posterClose: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
  },
  posterCloseText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  posterBody: {
    marginTop: 14,
  },
  posterPreview: {
    height: 160,
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPreviewImage: {
    height: '100%',
    width: '100%',
    resizeMode: 'cover',
  },
  posterButtonsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  posterPickButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPickButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  posterUploadButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterUploadButtonDisabled: {
    opacity: 0.7,
  },
  posterUploadButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  postersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 4,
  },
  postersSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  postersRefreshButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  postersRefreshText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  postersRow: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  posterThumbWrap: {
    width: 140,
  },
  posterThumb: {
    width: 140,
    height: 90,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  posterThumbImage: {
    height: '100%',
    width: '100%',
    resizeMode: 'cover',
  },
  posterDeleteButton: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterDeleteButtonDisabled: {
    opacity: 0.7,
  },
  posterDeleteText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  postersEmptyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },
});

export default AdminHomePage;
