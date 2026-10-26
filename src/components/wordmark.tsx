import { Image } from 'expo-image';

const wordmarkAspect = 172.22 / 71;

type WordmarkProps = {
  height?: number;
  color?: string;
};

export function Wordmark({ height = 24, color = '#FFFFFF' }: WordmarkProps) {
  return (
    <Image
      source={require('@/assets/images/wordmark.png')}
      tintColor={color}
      contentFit="contain"
      accessibilityRole="image"
      accessibilityLabel="Loop"
      style={{ height, width: height * wordmarkAspect }}
    />
  );
}
