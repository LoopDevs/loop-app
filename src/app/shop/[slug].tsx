import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { ExternalLink } from '@/components/external-link';
import { Button, Notice } from '@/components/form';
import { GiftCardPurchase } from '@/components/gift-card-purchase';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { useScrimScroll } from '@/components/home-panel';
import { coverClearance, MerchantCover } from '@/components/merchant-card';
import { PressScale } from '@/components/press-scale';
import { Skeleton } from '@/components/skeleton';
import { SplitLayout } from '@/components/split-layout';
import { SiteFooter } from '@/components/site-footer';
import { cachedMerchant, loadMerchant, PageWidth, WhyShopWithLoop } from '@/components/storefront';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useOnSignIn, useSignIn } from '@/components/sign-in';
import { FontFamily, Layout, MaxContentWidth, Motion, Radius, ScrollEndInset, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { Merchant } from '@/ctx/merchant';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useFavourites } from '@/hooks/use-favourites';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';
import { SmartWallet } from '@/wallet/smart-wallet';

const coverAspect = 16 / 10;
const wideCoverWidth = 300;
const badgeOverhang = coverClearance('hero') - Spacing.three;
const clampCharacters = 320;
const clampLines = 5;

export default function MerchantScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { busy, message, run } = useBusyAction();
  const [merchant, setMerchant] = useState<Merchant | null>(() => cachedMerchant(slug));
  const [wallet, setWallet] = useState<SmartWallet | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { favourites, toggle: toggleFavourite } = useFavourites();
  const { openSignIn } = useSignIn();
  const { wide } = usePageLayout();

  const loadedSlug = useRef<string | undefined>(undefined);

  const load = useCallback(
    () =>
      run(async () => {
        if (loadedSlug.current !== slug) {
          loadedSlug.current = slug;
          setMerchant(cachedMerchant(slug));
          setSignedIn(null);
        }
        const isSignedIn = await ctx.isSignedIn();
        const walletLoad = isSignedIn
          ? SmartWallet.load().catch(SmartWallet.unlessUnlinked)
          : Promise.resolve(null);
        await Promise.all([
          loadMerchant(slug).then(setMerchant),
          walletLoad.then((loadedWallet) => {
            setWallet(loadedWallet);
            setSignedIn(isSignedIn);
          }),
        ]);
      }),
    [run, slug],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useOnSignIn(load);
  const { onScroll } = useScrimScroll();

  const retry = message !== '' && <Notice message={message} actionLabel="Try again" onAction={load} disabled={busy} />;

  if (!merchant) {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style="dark" />
        <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.scroll}>
          <MerchantLayout
            wide={wide}
            hero={<HeroSkeleton wide={wide} />}
            buy={retry || <BuySkeleton />}
            details={<DetailsSkeleton />}
          />
        </Animated.ScrollView>
      </ThemedView>
    );
  }

  const earnLine = merchant.cashbackBasisPoints() > 0 ? ` and earn ${merchant.rateLabel()}` : '';
  const cardStyle = [styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }];

  const buyCard = wallet ? (
    <GiftCardPurchase merchant={merchant} wallet={wallet} />
  ) : signedIn === null ? (
    <BuySkeleton />
  ) : signedIn ? (
    <View style={cardStyle}>
      <ThemedText type="heading">Finish setting up Loop</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Turn on Face ID or your fingerprint to pay for gift cards and collect your cashback.
      </ThemedText>
      <Button label="Finish setup" variant="primary" onPress={() => router.navigate('/')} />
    </View>
  ) : (
    <View style={cardStyle}>
      <ThemedText type="heading">Buy a {merchant.name} gift card</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Sign in to choose an amount{earnLine}. Pay with XLM, USDC or EURC.
      </ThemedText>
      <Button
        label="Sign in to buy"
        variant="primary"
        onPress={() => openSignIn(`Sign in to buy a ${merchant.name} gift card${earnLine}.`)}
      />
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Stack.Screen options={{ title: merchant.name }} />
      <KeyboardAvoid>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}>
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(Motion.transition).easing(Motion.easeOut)}>
          <MerchantLayout
            wide={wide}
            hero={
              <MerchantHero
                merchant={merchant}
                wide={wide}
                favourite={favourites.has(merchant.id)}
                onFavourite={() =>
                  signedIn
                    ? toggleFavourite(merchant.id)
                    : openSignIn(`Sign in to save ${merchant.name} to your favourites.`)
                }
              />
            }
            buy={
              <>
                {retry}
                {buyCard}
              </>
            }
            details={<MerchantDetails key={merchant.id} merchant={merchant} signedOut={signedIn === false} />}
          />
        </Animated.View>
        <WhyShopWithLoop />
        <SiteFooter />
      </Animated.ScrollView>
      </KeyboardAvoid>
    </ThemedView>
  );
}

type LayoutProps = {
  wide: boolean;
  hero: ReactNode;
  buy: ReactNode;
  details: ReactNode;
};

function MerchantLayout({ wide, hero, buy, details }: LayoutProps) {
  if (wide) {
    return (
      <PageWidth style={styles.widePage}>
        <SplitLayout asideWidth={Layout.sheetWidth} aside={buy}>
          <View style={styles.mainColumn}>
            {hero}
            {details}
          </View>
        </SplitLayout>
      </PageWidth>
    );
  }
  return (
    <View style={styles.narrowPage}>
      {hero}
      <View style={styles.buy}>{buy}</View>
      {details}
    </View>
  );
}

type HeroProps = {
  merchant: Merchant;
  wide: boolean;
  favourite: boolean;
  onFavourite: () => void;
};

function MerchantHero({ merchant, wide, favourite, onFavourite }: HeroProps) {
  const theme = useTheme();
  const intro = merchant.info?.intro;
  return (
    <View style={[styles.hero, wide && styles.heroWide]}>
      <View style={wide ? styles.heroCoverWide : styles.heroCover}>
        <MerchantCover merchant={merchant} size="hero" />
      </View>
      <View style={[styles.heroText, wide && styles.heroTextWide]}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.name, { color: theme.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
              {merchant.name}
            </Text>
            {merchant.cashbackBasisPoints() > 0 && (
              <Text style={[styles.rate, { color: theme.accent }]} maxFontSizeMultiplier={1.6}>
                {merchant.rateLabel()} on every card
              </Text>
            )}
          </View>
          <FavouriteButton favourite={favourite} onPress={onFavourite} />
        </View>
        {intro && (
          <ThemedText type="small" themeColor="textSecondary">
            {intro}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

type Fact = {
  label: string;
  value: string | null;
  icon: SymbolViewProps['name'];
};

function MerchantDetails({ merchant, signedOut }: { merchant: Merchant; signedOut: boolean }) {
  const theme = useTheme();
  const { info } = merchant;
  const websiteUrl = merchant.websiteUrl();
  const categories = merchant.categories.map(Merchant.categoryLabel).join(', ');
  const facts: Fact[] = [
    {
      label: 'Card amounts',
      value: merchant.amountsLabel(),
      icon: { ios: 'banknote', android: 'payments', web: 'payments' },
    },
    {
      label: 'Where to use it',
      value: merchant.whereToUse(),
      icon: { ios: 'bag', android: 'shopping_bag', web: 'shopping_bag' },
    },
    {
      label: 'What you get',
      value: merchant.deliveryLabel(),
      icon: { ios: 'gift', android: 'redeem', web: 'redeem' },
    },
    {
      label: 'Category',
      value: categories || null,
      icon: { ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' },
    },
  ];
  const shownFacts = facts.filter((fact) => fact.value);

  return (
    <View style={styles.details}>
      {shownFacts.length > 0 && (
        <DetailSection>
          {shownFacts.map((fact) => (
            <FactRow key={fact.label} fact={fact} />
          ))}
        </DetailSection>
      )}

      {(info?.description || websiteUrl) && (
        <DetailSection title={`About ${merchant.name}`}>
          {info?.description && <ExpandableText text={info.description} />}
          {websiteUrl && (
            <View style={styles.website}>
              <SymbolView
                name={{ ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }}
                size={16}
                tintColor={theme.accent}
              />
              <ExternalLink href={websiteUrl}>
                <ThemedText type="linkPrimary" numberOfLines={1}>
                  {merchant.websiteLabel()}
                </ThemedText>
              </ExternalLink>
            </View>
          )}
        </DetailSection>
      )}

      {info?.instructions && (
        <DetailSection title="How to use it">
          <ExpandableText text={info.instructions} />
        </DetailSection>
      )}

      {info?.terms && (
        <DetailSection title="Terms">
          <ExpandableText text={info.terms} />
        </DetailSection>
      )}

      {!info && signedOut && (
        <DetailSection>
          <ThemedText type="small" themeColor="textSecondary">
            Sign in to see how to use this card and its terms.
          </ThemedText>
        </DetailSection>
      )}
    </View>
  );
}

function DetailSection({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { borderTopColor: theme.border }]}>
      {title && (
        <ThemedText type="heading" accessibilityRole="header">
          {title}
        </ThemedText>
      )}
      {children}
    </View>
  );
}

function FactRow({ fact }: { fact: Fact }) {
  const theme = useTheme();
  return (
    <View style={styles.fact}>
      <View style={[styles.factIcon, { backgroundColor: theme.backgroundSubtle }]}>
        <SymbolView name={fact.icon} size={20} tintColor={theme.text} />
      </View>
      <View style={styles.factText}>
        <ThemedText type="small" themeColor="textSecondary">
          {fact.label}
        </ThemedText>
        <ThemedText type="smallBold">{fact.value}</ThemedText>
      </View>
    </View>
  );
}

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > clampCharacters;
  return (
    <View style={styles.expandable}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={long && !expanded ? clampLines : undefined}>
        {text}
      </ThemedText>
      {long && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={styles.more}>
          <ThemedText type="smallBold" style={styles.moreText}>
            {expanded ? 'Show less' : 'Show more'}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function FavouriteButton({ favourite, onPress }: { favourite: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressScale
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      scale={0.92}
      accessibilityRole="button"
      accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
      accessibilityState={{ selected: favourite }}
      style={[styles.favourite, { backgroundColor: theme.backgroundElement, borderColor: theme.borderStrong }]}>
      <SymbolView
        name={
          favourite
            ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
            : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }
        }
        size={22}
        tintColor={favourite ? theme.accent : theme.text}
      />
    </PressScale>
  );
}

function HeroSkeleton({ wide }: { wide: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.hero, wide && styles.heroWide]} accessible accessibilityLabel="Loading">
      <View style={wide ? styles.heroCoverWide : styles.heroCover}>
        <View style={[styles.coverPlaceholder, { backgroundColor: theme.backgroundSelected }]} />
      </View>
      <View style={[styles.heroText, wide && styles.heroTextWide]}>
        <View style={styles.skeletonTitle}>
          <Skeleton width="60%" height={36} color={theme.backgroundSelected} />
          <Skeleton width="40%" height={20} color={theme.backgroundSelected} />
        </View>
      </View>
    </View>
  );
}

function BuySkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Skeleton width="50%" height={22} color={theme.backgroundSelected} />
      <Skeleton width="100%" height={72} color={theme.backgroundSelected} />
      <Skeleton width="100%" height={48} color={theme.backgroundSelected} />
    </View>
  );
}

function DetailsSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.section, { borderTopColor: theme.border }]}>
      <Skeleton width="70%" height={44} color={theme.backgroundSelected} />
      <Skeleton width="55%" height={44} color={theme.backgroundSelected} />
      <Skeleton width="65%" height={44} color={theme.backgroundSelected} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingTop: Spacing.two,
    paddingBottom: ScrollEndInset,
  },
  narrowPage: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.four,
  },
  widePage: {
    paddingTop: Spacing.four,
  },
  mainColumn: {
    gap: Spacing.four,
  },
  buy: {
    gap: Spacing.three,
  },
  hero: {
    gap: coverClearance('hero'),
  },
  heroWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  heroCover: {
    width: '100%',
  },
  heroCoverWide: {
    width: wideCoverWidth,
    paddingBottom: badgeOverhang,
  },
  coverPlaceholder: {
    aspectRatio: coverAspect,
    borderRadius: Radius.card,
  },
  heroText: {
    gap: Spacing.two,
  },
  heroTextWide: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  skeletonTitle: {
    gap: Spacing.two,
    minHeight: 48,
  },
  name: {
    fontFamily: FontFamily.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  rate: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  favourite: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.control,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  details: {
    gap: Spacing.four,
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  factIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  expandable: {
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  more: {
    minHeight: 44,
    justifyContent: 'center',
  },
  moreText: {
    textDecorationLine: 'underline',
  },
  website: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
});
