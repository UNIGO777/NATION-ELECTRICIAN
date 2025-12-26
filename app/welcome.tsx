import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

export default function Welcome() {
  const [isChecking, setIsChecking] = useState(true);

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
        
      </View>
      <View className="px-6 pb-8">
        <Pressable
          className="primary-bg-color rounded-xl py-4 items-center"
          onPress={onContinue}
        >
          <Text className="text-white text-base font-semibold">Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
