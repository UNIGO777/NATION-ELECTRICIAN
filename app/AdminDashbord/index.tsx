import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Package, ShoppingCart, Users, UserPlus, PackagePlus, Settings, FileSearch, FileText } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { fetchBillsCount, fetchUsersCount } from '@/Globalservices/adminUserServices';

const AdminHomePage: React.FC = () => {
  const [usersCount, setUsersCount] = useState<number | null>(null);
  const [billsCount, setBillsCount] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([fetchUsersCount(), fetchBillsCount()])
      .then(([userCount, billCount]) => {
        if (!isMounted) return;
        setUsersCount(userCount);
        setBillsCount(billCount);
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

  const menuItems = useMemo(
    () => [
      { title: 'Users', count: usersCount ?? 0, Icon: Users },
      { title: 'Orders', count: 532, Icon: ShoppingCart },
      { title: 'Products', count: 89, Icon: Package },
      { title: 'Bills', count: billsCount ?? 0, Icon: FileText },
    ],
    [billsCount, usersCount]
  );

  const quickActions = useMemo(
    () => [
      { label: 'Add User', Icon: UserPlus },
      { label: 'Add Product', Icon: PackagePlus },
      { label: 'View Reports', Icon: FileSearch },
      { label: 'Settings', Icon: Settings },
    ],
    []
  );

  const goToUsers = () => {
    router.push('/AdminDashbord/users');
  };

  const goToUsersAndOpenCreate = () => {
    router.push({
      pathname: '/AdminDashbord/users',
      params: { openCreate: '1', createNonce: String(Date.now()) },
    });
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <Text style={styles.pageTitle}>Overview</Text>
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <View style={styles.statsContainer}>
          {menuItems.map(({ Icon, count, title }, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.statCard}
              onPress={title === 'Users' ? goToUsers : undefined}
              disabled={title !== 'Users'}
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
              onPress={label === 'Add User' ? goToUsersAndOpenCreate : undefined}
              disabled={label !== 'Add User'}
            >
              <View style={styles.actionIconWrap}>
                <Icon color="#dc2626" size={18} />
              </View>
              <Text style={styles.actionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
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
});

export default AdminHomePage;
