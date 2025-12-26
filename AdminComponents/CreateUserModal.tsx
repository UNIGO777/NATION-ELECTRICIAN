import { useEffect, useMemo, useState } from 'react';
import {
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
import { Pencil, Shield, User, UserPlus, X } from 'lucide-react-native';

import { createUserAsAdmin, updateUserAsAdmin, type AdminUserRecord } from '@/Globalservices/adminUserServices';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  mode: 'create' | 'edit';
  initialUser?: AdminUserRecord | null;
};

export default function CreateUserModal({ visible, onClose, onSaved, mode, initialUser }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = mode === 'edit';

  const headerConfig = useMemo(() => {
    if (isEdit) {
      return {
        title: 'Edit User',
        subtitle: 'Updates User document',
        Icon: Pencil,
        buttonLabel: 'Update User',
      };
    }
    return {
      title: 'Create User',
      subtitle: 'Creates Auth account + User document',
      Icon: UserPlus,
      buttonLabel: role === 'admin' ? 'Create Admin' : 'Create User',
    };
  }, [isEdit, role]);

  const HeaderIcon = headerConfig.Icon;

  const reset = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setMobileNumber('');
    setRole('user');
    setErrorText(null);
    setIsSubmitting(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (!visible) return;
    if (isEdit && initialUser) {
      setEmail(initialUser.email ?? '');
      setFullName(initialUser.fullName ?? '');
      setMobileNumber(initialUser.mobileNumber ?? '');
      setRole(initialUser.role === 'admin' ? 'admin' : 'user');
      setPassword('');
      setErrorText(null);
      setIsSubmitting(false);
      return;
    }
    setEmail('');
    setPassword('');
    setFullName('');
    setMobileNumber('');
    setRole('user');
    setErrorText(null);
    setIsSubmitting(false);
  }, [visible, isEdit, initialUser]);

  const onSubmit = async () => {
    setIsSubmitting(true);
    setErrorText(null);
    try {
      if (isEdit) {
        if (!initialUser?.uid) throw new Error('User id is missing.');
        await updateUserAsAdmin({
          uid: initialUser.uid,
          email,
          fullName,
          mobileNumber,
          role,
        });
      } else {
        await createUserAsAdmin({
          email,
          password,
          fullName,
          mobileNumber,
          role,
        });
      }
      onSaved();
      close();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      setErrorText(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <SafeAreaView edges={['bottom']}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.headerContainer}>
                <View style={styles.handleWrap}>
                  <View style={styles.handle} />
                </View>

                <View style={styles.headerRow}>
                  <View style={styles.headerIconWrap}>
                    <HeaderIcon color="#dc2626" size={20} />
                  </View>
                  <View style={styles.headerTextWrap}>
                    <Text style={styles.headerTitle}>{headerConfig.title}</Text>
                    <Text style={styles.headerSubtitle}>{headerConfig.subtitle}</Text>
                  </View>
                  <Pressable onPress={close} style={styles.closeButton}>
                    <X color="#6b7280" size={18} />
                  </Pressable>
                </View>
              </View>

              <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <Text style={styles.label}>Role</Text>
                <View style={styles.segmentWrap}>
                  <Pressable
                    style={[styles.segmentItem, role === 'user' ? styles.segmentItemActive : null]}
                    onPress={() => setRole('user')}
                  >
                    <User color={role === 'user' ? '#dc2626' : '#6b7280'} size={18} />
                    <Text style={[styles.segmentText, role === 'user' ? styles.segmentTextActive : styles.segmentTextInactive]}>
                      User
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.segmentItem, role === 'admin' ? styles.segmentItemActive : null]}
                    onPress={() => setRole('admin')}
                  >
                    <Shield color={role === 'admin' ? '#dc2626' : '#6b7280'} size={18} />
                    <Text style={[styles.segmentText, role === 'admin' ? styles.segmentTextActive : styles.segmentTextInactive]}>
                      Admin
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Full Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Full name"
                    placeholderTextColor="#9ca3af"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Mobile Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Mobile number"
                    placeholderTextColor="#9ca3af"
                    keyboardType="phone-pad"
                    value={mobileNumber}
                    onChangeText={setMobileNumber}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="example@gmail.com"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={isEdit ? 'Password cannot be edited here' : 'Password'}
                    placeholderTextColor="#9ca3af"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    editable={!isEdit}
                  />
                </View>

                {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
              </ScrollView>

              <View style={styles.footer}>
                <Pressable
                  style={[styles.submitButton, isSubmitting ? styles.disabled : null]}
                  disabled={isSubmitting}
                  onPress={onSubmit}
                >
                  <Text style={styles.submitText}>
                    {isSubmitting ? (isEdit ? 'Updating...' : 'Creating...') : headerConfig.buttonLabel}
                  </Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
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
  handleWrap: {
    alignItems: 'center',
  },
  handle: {
    height: 4,
    width: 48,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconWrap: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  closeButton: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
  },
  segmentItemActive: {
    backgroundColor: '#ffffff',
  },
  segmentText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#111827',
  },
  segmentTextInactive: {
    color: '#6b7280',
  },
  field: {
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  submitButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
});
