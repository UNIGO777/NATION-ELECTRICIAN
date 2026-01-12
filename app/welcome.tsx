import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useI18nStore, useT, type AppLanguage } from '@/Globalservices/i18n';

export default function Welcome() {
  const [isChecking, setIsChecking] = useState(true);
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const t = useT();

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      try {
        const seen = await AsyncStorage.getItem('hasSeenWelcome');
        if (!isMounted) return;
        if (seen === '1') {
          router.replace('/login');
          return;
        }
      } finally {
        if (isMounted) setIsChecking(false);
      }
    };
    run();
    return () => {
      isMounted = false;
    };
  }, []);

  const onContinue = async () => {
    await AsyncStorage.setItem('hasSeenWelcome', '1');
    router.replace('/login');
  };

  if (isChecking) return null;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        <Image
          source={require('../assets/logos/Logo.png')}
          className=" h-32 mb-6"
          style={{ resizeMode: 'contain' }}
        />
        <View className="w-full mt-6">
          <Text className="text-base font-semibold text-neutral-900 mb-3">{t('selectLanguage')}</Text>
          <View className="flex-row gap-3">
            <Pressable
              className={`flex-1 rounded-xl py-3 items-center ${
                language === 'en' ? 'primary-bg-color' : 'border border-gray-300'
              }`}
              onPress={() => void setLanguage('en' as AppLanguage)}
            >
              <Text className={`${language === 'en' ? 'text-white' : 'text-neutral-800'} font-semibold`}>{t('english')}</Text>
            </Pressable>
            <Pressable
              className={`flex-1 rounded-xl py-3 items-center ${
                language === 'mr' ? 'primary-bg-color' : 'border border-gray-300'
              }`}
              onPress={() => void setLanguage('mr' as AppLanguage)}
            >
              <Text className={`${language === 'mr' ? 'text-white' : 'text-neutral-800'} font-semibold`}>{t('marathi')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <View className="px-6 pb-8">
        <Pressable
          className="primary-bg-color rounded-xl py-4 items-center"
          onPress={onContinue}
        >
          <Text className="text-white text-base font-semibold">{t('continue')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
