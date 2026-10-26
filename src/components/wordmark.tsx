import { Image } from 'expo-image';

import { useTheme } from '@/hooks/use-theme';

const wordmarkAspect = 172.22 / 71;

type WordmarkProps = {
  height?: number;
  color?: string;
};

export function Wordmark({ height = 24, color }: WordmarkProps) {
  const theme = useTheme();
  return (
    <Image
      source={require('@/assets/images/wordmark.png')}
      tintColor={color ?? theme.text}
      contentFit="contain"
      accessibilityRole="image"
      accessibilityLabel="Loop"
      style={{ height, width: height * wordmarkAspect }}
    />
  );
}
