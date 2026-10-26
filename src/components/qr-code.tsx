import { Image } from 'expo-image';
import createQrCode from 'qrcode-generator';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type QrCodeProps = {
  value: string;
  size?: number;
  accessibilityLabel: string;
};

export function QrCode({ value, size = 184, accessibilityLabel }: QrCodeProps) {
  const theme = useTheme();
  const source = useMemo(() => {
    const code = createQrCode(0, 'M');
    code.addData(value);
    code.make();
    return code.createDataURL(8, 0);
  }, [value]);
  return (
    <View
      style={[styles.frame, { borderColor: theme.border }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}>
      <Image source={{ uri: source }} style={{ width: size, height: size }} contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    padding: Spacing.three,
    borderRadius: Radius.media,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#FFFFFF',
  },
});
