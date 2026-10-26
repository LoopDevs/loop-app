import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="smallBold">This page doesn&apos;t exist.</ThemedText>
      <Button label="Go home" onPress={() => router.replace('/')} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
