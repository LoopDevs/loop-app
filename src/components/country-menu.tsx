import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale } from '@/components/press-scale';
import { ThemedText } from '@/components/themed-text';
import { Brand, FontFamily, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { Market } from '@/ctx/market';
import { useMarket } from '@/hooks/use-market';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

export function CountryMenu() {
  const { country, choose } = useMarket();
  const [open, setOpen] = useState(false);
  const { wide, gutter } = usePageLayout();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const pick = (picked: string) => {
    haptics.tap();
    choose(picked);
    setOpen(false);
  };

  return (
    <>
      <PressScale
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Shopping in ${Market.countryName(country)}. Change country`}
        style={styles.trigger}>
        <SymbolView name={{ ios: 'globe', android: 'public', web: 'public' }} size={18} tintColor={Brand.onRoyal} />
        <Text style={styles.triggerText} maxFontSizeMultiplier={1.3}>
          {country}
        </Text>
      </PressScale>
      <Modal transparent visible={open} animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={[styles.backdrop, wide ? styles.backdropWide : styles.backdropNarrow]}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close country list">
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(Motion.state).easing(Motion.easeOut)}
            style={[
              styles.menu,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              wide
                ? { marginTop: Layout.headerHeight - Spacing.two, marginRight: gutter, width: 320 }
                : { paddingBottom: insets.bottom + Spacing.two },
            ]}>
            <Pressable accessible={false}>
              <ThemedText type="smallBold" style={styles.menuTitle}>
                Shop gift cards in
              </ThemedText>
              <ScrollView style={styles.list}>
                {Market.countries.map((code) => (
                  <CountryRow key={code} code={code} selected={code === country} onPress={() => pick(code)} />
                ))}
              </ScrollView>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

function CountryRow({ code, selected, onPress }: { code: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        (pressed || hovered || selected) && { backgroundColor: theme.backgroundSelected },
      ]}>
      <ThemedText style={styles.code} themeColor={selected ? 'accent' : 'textSecondary'}>
        {code}
      </ThemedText>
      <ThemedText style={styles.name} type={selected ? 'smallBold' : 'small'}>
        {Market.countryName(code)}
      </ThemedText>
      {selected && (
        <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={18} tintColor={theme.accent} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Brand.navy,
  },
  triggerText: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.semibold,
    fontSize: 15,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 22, 64, 0.32)',
  },
  backdropWide: {
    alignItems: 'flex-end',
  },
  backdropNarrow: {
    justifyContent: 'flex-end',
  },
  menu: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    boxShadow: '0 16px 40px rgba(10, 22, 64, 0.24)',
  },
  menuTitle: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  list: {
    maxHeight: 420,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
  },
  code: {
    width: 28,
    fontFamily: FontFamily.semibold,
  },
  name: {
    flex: 1,
  },
});
