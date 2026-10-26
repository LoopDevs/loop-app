import { Stack } from 'expo-router';

export const unstable_settings = {
  anchor: 'index',
};

export default function SavingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Savings', headerShown: false }} />
    </Stack>
  );
}
