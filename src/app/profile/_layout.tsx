import { Stack } from 'expo-router';

import { FontFamily } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function ProfileLayout() {
  const theme = useTheme();
  const detailHeader = {
    title: '',
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.text,
    headerTitleStyle: { fontFamily: FontFamily.semibold },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
  } as const;

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Profile', headerShown: false }} />
      <Stack.Screen name="settings" options={detailHeader} />
    </Stack>
  );
}
