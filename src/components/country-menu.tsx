import { SymbolView } from 'expo-symbols';
import { type ComponentRef, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale } from '@/components/press-scale';
import { ThemedText } from '@/components/themed-text';
import { Elevation, FontFamily, Motion, Radius, Spacing } from '@/constants/theme';
import { Market } from '@/ctx/market';
import { useMarket } from '@/hooks/use-market';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

export function CountryMenu() {
  const { country, choose } = useMarket();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<ComponentRef<typeof View>>(null);
  const { wide } = usePageLayout();
  const { width: windowWidth } = useWindowDimensions();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const show = () => {
    if (!wide || !triggerRef.current) {
      setOpen(true);
      return;
    }
    triggerRef.current.measureInWindow((x, y, width, height) => {
      setAnchor({ top: y + height + Spacing.two, right: windowWidth - (x + width) });
      setOpen(true);
    });
  };

  const pick = (picked: string) => {
    haptics.tap();
    choose(picked);
    setOpen(false);
  };

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <PressScale
          onPress={show}
          accessibilityRole="button"
          accessibilityLabel={`Shopping in ${Market.countryName(country)}. Change country`}
          style={[styles.trigger, { backgroundColor: theme.backgroundSubtle }]}>
          <SymbolView name={{ ios: 'globe', android: 'public', web: 'public' }} size={18} tintColor={theme.text} />
          <Text style={[styles.triggerText, { color: theme.text }]}maxFontSizeMultiplier={1.3}>
            {country}
          </Text>
        </PressScale>
      </View>
      <Modal transparent visible={open} animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: theme.scrim }, wide ? styles.backdropWide : styles.backdropNarrow]}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close country list">
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(Motion.state).easing(Motion.easeOut)}
            style={[
              styles.menu,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              wide
                ? { position: 'absolute', top: anchor.top, right: anchor.right, width: 320 }
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
    borderRadius: Radius.pill,
  },
  triggerText: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
  },
  backdrop: {
    flex: 1,
  },
  backdropWide: {},
  backdropNarrow: {
    justifyContent: 'flex-end',
  },
  menu: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.two,
    ...Elevation.sheet,
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
