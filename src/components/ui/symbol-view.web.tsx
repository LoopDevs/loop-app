import type { SymbolViewProps } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { SymbolFont, symbolCodepoint } from '@/components/symbol-codepoints';

export type { SymbolViewProps };

export function SymbolView({ name, size = 24, tintColor, style, fallback }: SymbolViewProps) {
  const codepoint = symbolCodepoint(name);
  if (codepoint === undefined) {
    return <>{fallback}</>;
  }
  return (
    <View style={[{ width: size, height: size }, styles.box, style]}>
      <Text
        aria-hidden
        selectable={false}
        style={[styles.glyph, { fontSize: size, lineHeight: size, color: tintColor ?? undefined }]}>
        {String.fromCharCode(codepoint)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontFamily: SymbolFont.family,
  },
});
