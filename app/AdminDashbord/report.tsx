import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import { BarChart3 } from 'lucide-react-native';

export default function AdminReport() {
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-gray-100">
      <View className="flex-1 px-6 pt-6">
        <View className="flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-white mr-3">
            <BarChart3 color="#111827" size={18} />
          </View>
          <Text className="text-xl font-semibold text-neutral-900">Report</Text>
        </View>
        <Text className="mt-2 text-neutral-500">Coming soon</Text>
      </View>
    </SafeAreaView>
  );
}
