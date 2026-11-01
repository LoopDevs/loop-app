import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brandTint, LogoDisc } from '@/components/merchant-mark';
import { useCatalog } from '@/components/storefront';
import { Wordmark } from '@/components/wordmark';
import { FontFamily, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import type { Merchant } from '@/ctx/merchant';
import { useMarket } from '@/hooks/use-market';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';
import { Savings } from '@/wallet/savings';

const welcomeSeenKey = 'welcome.seen';
const wallColumns = 3;
const wallRows = 2;

export function useWelcomeSeen(): [boolean | null, () => void] {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(welcomeSeenKey)
      .then((stored) => setSeen(stored === '1'))
      .catch(() => setSeen(true));
  }, []);
  const dismiss = useCallback(() => {
    setSeen(true);
    AsyncStorage.setItem(welcomeSeenKey, '1').catch(() => undefined);
  }, []);
  return [seen, dismiss];
}

type Slide = {
  key: string;
  title: string;
  body: string;
  visual: ReactNode;
};

export function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.duration(Motion.state).delay(delay).easing(Motion.easeOut);
  const slides: Slide[] = [
    {
      key: 'brands',
      title: 'Gift cards from brands you love',
      body: 'Buy in seconds and use them straight away, in store or online.',
      visual: <BrandWall />,
    },
    {
      key: 'bank',
      title: 'Pay straight from your bank',
      body: 'Approve each payment in your own banking app. No card numbers to type.',
      visual: (
        <FeatureCard
          icon={{ ios: 'building.columns.fill', android: 'account_balance', web: 'account_balance' }}
          title="Approve in your bank"
          detail="Pay in pounds, with nothing to top up first."
        />
      ),
    },
    {
      key: 'savings',
      title: 'Cashback that keeps growing',
      body: 'Every purchase pays cashback into Savings, where it earns interest every day.',
      visual: (
        <FeatureCard
          icon={{ ios: 'leaf.fill', android: 'savings', web: 'savings' }}
          title="Savings"
          detail={Savings.rateHeadline}
        />
      ),
    },
  ];
  const continueWith = () => {
    haptics.tap();
    onContinue();
  };
  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.accent,
          paddingTop: insets.top + Spacing.two,
          paddingBottom: insets.bottom + Spacing.three,
        },
      ]}>
      <StatusBar style="light" />
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(Motion.state)} style={styles.header}>
        <Wordmark height={28} color={theme.onAccent} />
      </Animated.View>
      <Slides slides={slides} enter={enter} />
      <Animated.View entering={enter(360)} style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={continueWith}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.onAccent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={[styles.buttonLabel, { color: theme.accent }]} maxFontSizeMultiplier={1.4}>
            Get started
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={continueWith}
          style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.buttonLabel, { color: theme.onAccent }]} maxFontSizeMultiplier={1.4}>
            I already have an account
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

type SlidesProps = {
  slides: Slide[];
  enter: (delay: number) => ReturnType<typeof FadeInDown.duration> | undefined;
};

function Slides({ slides, enter }: SlidesProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.set(event.contentOffset.x);
  });
  return (
    <View style={styles.slides}>
      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.pager}>
        {slides.map((slide, index) => (
          <View key={slide.key} style={[styles.slide, { width }]}>
            <View style={styles.visual}>{slide.visual}</View>
            <Animated.View entering={enter(160 + index * 60)} style={styles.copy}>
              <Text style={[styles.title, { color: theme.onAccent }]} maxFontSizeMultiplier={1.3}>
                {slide.title}
              </Text>
              <Text style={[styles.body, { color: theme.onAccent }]} maxFontSizeMultiplier={1.4}>
                {slide.body}
              </Text>
            </Animated.View>
          </View>
        ))}
      </Animated.ScrollView>
      <View style={styles.dots}>
        {slides.map((slide, index) => (
          <PageDot key={slide.key} index={index} count={slides.length} scrollX={scrollX} pageWidth={width} />
        ))}
      </View>
    </View>
  );
}

type PageDotProps = {
  index: number;
  count: number;
  scrollX: SharedValue<number>;
  pageWidth: number;
};

function PageDot({ index, count, scrollX, pageWidth }: PageDotProps) {
  const theme = useTheme();
  const dotStyle = useAnimatedStyle(() => {
    const page = scrollX.get() / Math.max(1, pageWidth);
    const nearness = interpolate(Math.abs(page - index), [0, 1], [1, 0], Extrapolation.CLAMP);
    return {
      width: 8 + nearness * 16,
      opacity: 0.4 + nearness * 0.6,
    };
  });
  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: theme.onAccent }, dotStyle]}
      accessibilityLabel={`Page ${index + 1} of ${count}`}
    />
  );
}

function BrandWall() {
  const { country } = useMarket();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const catalog = useCatalog(country, wallColumns * wallRows);
  const wall = catalog?.top.slice(0, wallColumns * wallRows) ?? [];
  const tileWidth = Math.min(108, (width - Spacing.four * 2 - Spacing.two * (wallColumns - 1)) / wallColumns);
  const columns = Array.from({ length: wallColumns }, (_, column) =>
    wall.filter((_, index) => index % wallColumns === column),
  );
  return (
    <View style={styles.wall}>
      {columns.map((column, columnIndex) => (
        <View key={columnIndex} style={[styles.wallColumn, columnIndex !== 1 && styles.wallColumnOffset]}>
          {column.map((merchant, rowIndex) => (
            <Animated.View
              key={merchant.id}
              entering={
                reduceMotion
                  ? undefined
                  : FadeInDown.duration(Motion.state)
                      .delay(rowIndex * 120 + columnIndex * 60)
                      .easing(Motion.easeOut)
              }>
              <BrandTile merchant={merchant} width={tileWidth} />
            </Animated.View>
          ))}
        </View>
      ))}
    </View>
  );
}

function BrandTile({ merchant, width }: { merchant: Merchant; width: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { width, height: width * 1.25, backgroundColor: brandTint(merchant) }]}>
      {merchant.cardImageUrl && (
        <Image
          source={{ uri: merchant.cardImageUrl }}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      )}
      <View style={[styles.tileLogo, { borderColor: theme.backgroundElement }]}>
        <LogoDisc merchant={merchant} name={merchant.name} size={44} />
      </View>
    </View>
  );
}

type FeatureCardProps = {
  icon: SymbolViewProps['name'];
  title: string;
  detail: string;
};

function FeatureCard({ icon, title, detail }: FeatureCardProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(Motion.state).delay(80).easing(Motion.easeOut)}
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.cardIcon, { backgroundColor: theme.accentSoft }]}>
        <SymbolView name={icon} size={28} tintColor={theme.accent} />
      </View>
      <Text style={[styles.cardTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      <Text style={[styles.cardDetail, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
        {detail}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  slides: {
    flex: 1,
    justifyContent: 'center',
  },
  pager: {
    flexGrow: 0,
  },
  slide: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  visual: {
    minHeight: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copy: {
    width: '100%',
    maxWidth: Layout.formMaxWidth,
    alignSelf: 'center',
    gap: Spacing.two,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  body: {
    fontFamily: FontFamily.regular,
    fontSize: 17,
    lineHeight: 24,
    opacity: 0.84,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.four,
  },
  dot: {
    height: 8,
    borderRadius: Radius.pill,
  },
  actions: {
    width: '100%',
    maxWidth: Layout.formMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.one,
  },
  button: {
    minHeight: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  buttonLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    lineHeight: 22,
  },
  wall: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  wallColumn: {
    gap: Spacing.two,
  },
  wallColumnOffset: {
    marginTop: Spacing.five,
  },
  tile: {
    borderRadius: Radius.medium,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  tileLogo: {
    borderRadius: Radius.pill,
    borderWidth: 3,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: Radius.large,
    padding: Spacing.five,
    gap: Spacing.two,
    alignItems: 'flex-start',
    borderCurve: 'continuous',
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  cardTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 20,
    lineHeight: 26,
  },
  cardDetail: {
    fontFamily: FontFamily.regular,
    fontSize: 15,
    lineHeight: 21,
  },
});
