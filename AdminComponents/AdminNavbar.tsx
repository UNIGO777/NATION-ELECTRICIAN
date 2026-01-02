import { usePathname } from 'expo-router';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { FileText, Gift, Home, LogOut, Package, Users } from 'lucide-react-native';
import { signOut } from 'firebase/auth';

import { auth, isFirebaseConfigured } from '@/Globalservices/firebase';
import { useUserStore } from '@/Globalservices/userStore';

const getHeaderConfigFromPath = (pathname: string) => {
  if (pathname.includes('/AdminDashbord/bills')) 
    return { title: 'Bills', Icon: FileText, subtitle: 'Manage all invoices' };
  if (pathname.includes('/AdminDashbord/users')) 
    return { title: 'Users', Icon: Users, subtitle: 'User management' };
  if (pathname.includes('/AdminDashbord/products')) 
    return { title: 'Products', Icon: Package, subtitle: 'Manage products' };
  if (pathname.includes('/AdminDashbord/schemes')) 
    return { title: 'Schemes', Icon: Gift, subtitle: 'Manage schemes' };
  return { title: 'Dashboard', Icon: Home, subtitle: 'Overview & statistics' };
};

export default function AdminNavbar() {
  const pathname = usePathname();
  const { title, Icon, subtitle } = getHeaderConfigFromPath(pathname);
  const clearUser = useUserStore((s) => s.clearUser);

  const handleLogout = async () => {
    if (!isFirebaseConfigured) {
      clearUser();
      return;
    }
    await signOut(auth);
    clearUser();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <StatusBar style="dark" />
      
      <View style={styles.container}>
        {/* Main Header */}
        <View style={styles.header}>
          {/* Left Section */}
          <View style={styles.leftSection}>
            <View style={styles.iconWrapper}>
              <View style={styles.iconContainer}>
                <Icon size={24} color="#EF4444" strokeWidth={2.5} />
              </View>
            </View>
            
            <View style={styles.textWrapper}>
              <Text style={styles.titleText}>{title}</Text>
              <Text style={styles.subtitleText}>{subtitle}</Text>
            </View>
          </View>

          {/* Right Section - Admin Badge */}
          <View style={styles.rightSection}>
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [styles.logoutButton, pressed ? styles.logoutButtonPressed : null]}
              hitSlop={10}
            >
              <LogOut size={18} color="#EF4444" strokeWidth={2.5} />
            </Pressable>

            <View style={styles.adminBadge}>
              <View style={styles.adminDot} />
              <Text style={styles.adminText}>Admin</Text>
            </View>
          </View>
        </View>

        {/* Bottom Divider with Accent */}
        <View style={styles.dividerContainer}>
          <View style={styles.divider} />
          <View style={styles.accentLine} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#FFFFFF',
  },
  container: {
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  iconWrapper: {
    position: 'relative',
  },
  iconContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  textWrapper: {
    flex: 1,
  },
  titleText: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  subtitleText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoutButton: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  logoutButtonPressed: {
    opacity: 0.7,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  adminDot: {
    width: 7,
    height: 7,
    backgroundColor: '#EF4444',
    borderRadius: 4,
  },
  adminText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dividerContainer: {
    position: 'relative',
    height: 3,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 20,
    width: 60,
    height: 3,
    backgroundColor: '#EF4444',
    borderRadius: 2,
  },
});
