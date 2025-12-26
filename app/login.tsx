import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, Image, TextInput, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useUserStore } from '@/Globalservices/userStore';
import { getLoginErrorMessage, loginWithEmailPassword } from '@/Globalservices/loginServices';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const setUser = useUserStore((s) => s.setUser);

  const onLogin = async () => {
    setIsSubmitting(true);
    setErrorText(null);
    try {
      const result = await loginWithEmailPassword({ email, password });
      setUser(result.user);
      router.replace(result.route);
    } catch (err) {
      setErrorText(getLoginErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100" edges={['top', 'bottom']}>
      <View className="relative h-64 items-center justify-center">
        

        <View className="w-32 h-40 rounded-2xl items-center justify-center">
          <Image
            source={require('../assets/logos/Icon.png')}
            className="h-32 w-32"
            style={{ resizeMode: 'contain' }}
          />
        </View>
        
      </View>

      <View className="flex-1 bg-white rounded-t-3xl -mt-10">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-3xl font-bold text-neutral-900 text-center mb-6">Login</Text>

          <View className="mb-5">
            <Text className="text-xs text-neutral-500 mb-2">Email</Text>
            <TextInput
              className="border-b border-neutral-200 py-3 text-neutral-900"
              placeholder="example@gmail.com"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View className="mb-5">
            <Text className="text-xs text-neutral-500 mb-2">Password</Text>
            <TextInput
              className="border-b border-neutral-200 py-3 text-neutral-900"
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {errorText ? (
            <Text className="text-red-600 text-sm mb-4">{errorText}</Text>
          ) : null}

          <View className="mb-7" />

          <Pressable
            className={`primary-bg-color rounded-xl py-4 items-center ${isSubmitting ? 'opacity-60' : ''}`}
            disabled={isSubmitting}
            onPress={onLogin}
          >

            <Text className="text-white text-base font-semibold">
              {isSubmitting ? 'Logging in...' : 'Login'}
            </Text>
          </Pressable>

          <Text className="mt-6 text-center text-neutral-500">Contact admin for access</Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
