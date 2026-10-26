import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/press-scale';
import { ThemedText } from '@/components/themed-text';
import { Elevation, FontFamily, Motion, Radius, Spacing } from '@/constants/theme';
import { Merchant } from '@/ctx/merchant';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

const stripCardWidth = 248;
const coverAspect = 16 / 10;
const badgeSizes = { card: 52, hero: 76 } as const;
const badgeOverhang = 0.25;

type CoverSize = keyof typeof badgeSizes;

export function coverClearance(size: CoverSize) {
  return badgeSizes[size] * badgeOverhang + Spacing.three;
}

type Favourite = {
  saved: boolean;
  onToggle: () => void;
};

type CardProps = {
  merchant: Merchant;
  onPress: () => void;
  favourite?: Favourite;
};

export function MerchantCard({ merchant, onPress, favourite }: CardProps) {
  const category = merchant.categories[0];
  return (
    <View style={styles.card}>
      <PressScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${merchant.name}, ${merchant.rateLabel()}`}>
        <MerchantCover merchant={merchant} size="card" />
        <View style={[styles.text, { paddingTop: coverClearance('card') }]}>
          <ThemedText type="smallBold" style={styles.name} numberOfLines={1} ellipsizeMode="tail">
            {merchant.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {category ? Merchant.categoryLabel(category) : 'Gift card'}
          </ThemedText>
        </View>
      </PressScale>
      {favourite && <FavouriteButton merchant={merchant} favourite={favourite} />}
    </View>
  );
}

type CoverProps = {
  merchant: Merchant;
  size: CoverSize;
};

export function MerchantCover({ merchant, size }: CoverProps) {
  const theme = useTheme();
  const badgeSize = badgeSizes[size];
  const tint = `hsl(${merchant.tileHue()}, 45%, 92%)`;
  return (
    <View>
      <View
        style={[
          styles.cover,
          size === 'hero' && styles.coverHero,
          { backgroundColor: merchant.cardImageUrl ? theme.backgroundSelected : tint },
        ]}>
        {merchant.cardImageUrl && (
          <Image
            source={{ uri: merchant.cardImageUrl }}
            contentFit="cover"
            transition={Motion.state}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        )}
      </View>
      <CashbackPill merchant={merchant} />
      <View
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            bottom: -badgeSize * badgeOverhang,
            left: size === 'hero' ? Spacing.four : Spacing.three,
            borderWidth: size === 'hero' ? 4 : 3,
          },
        ]}>
        {merchant.logoUrl ? (
          <Image
            source={{ uri: merchant.logoUrl }}
            contentFit="contain"
            transition={Motion.state}
            style={styles.badgeImage}
            accessible={false}
          />
        ) : (
          <View style={[styles.badgeInitial, { backgroundColor: `hsl(${merchant.tileHue()}, 42%, 34%)` }]}>
            <Text style={[styles.badgeInitialText, { fontSize: badgeSize * 0.38 }]}>{merchant.initial()}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function CashbackPill({ merchant }: { merchant: Merchant }) {
  const theme = useTheme();
  if (merchant.cashbackBasisPoints() <= 0) {
    return null;
  }
  return (
    <View
      style={[styles.pill, { backgroundColor: theme.accentSoft }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text maxFontSizeMultiplier={1.3} style={[styles.pillText, { color: theme.accent }]}>
        {merchant.rateLabel()}
      </Text>
    </View>
  );
}

function FavouriteButton({ merchant, favourite }: { merchant: Merchant; favourite: Favourite }) {
  const theme = useTheme();
  const icon: SymbolViewProps['name'] = favourite.saved
    ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
    : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' };
  return (
    <PressScale
      style={styles.favourite}
      scale={0.88}
      onPress={() => {
        haptics.tap();
        favourite.onToggle();
      }}
      accessibilityRole="button"
      accessibilityLabel={
        favourite.saved ? `Remove ${merchant.name} from favourites` : `Add ${merchant.name} to favourites`
      }
      accessibilityState={{ selected: favourite.saved }}>
      <View style={styles.favouriteDisc}>
        <SymbolView name={icon} size={20} tintColor={favourite.saved ? theme.accent : '#FFFFFF'} />
      </View>
    </PressScale>
  );
}

type SectionHeadingProps = {
  title: string;
  onSeeAll?: () => void;
};

export function SectionHeading({ title, onSeeAll }: SectionHeadingProps) {
  const theme = useTheme();
  return (
    <View style={styles.heading}>
      <ThemedText type="heading" accessibilityRole="header" style={styles.headingTitle}>
        {title}
      </ThemedText>
      {onSeeAll && (
        <PressScale
          onPress={onSeeAll}
          scale={0.92}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`See all: ${title}`}
          style={[styles.seeAll, { backgroundColor: theme.backgroundSelected }]}>
          <SymbolView
            name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
            size={18}
            tintColor={theme.text}
          />
        </PressScale>
      )}
    </View>
  );
}

type StripProps = {
  title: string;
  merchants: Merchant[];
  onOpen: (merchant: Merchant) => void;
  onSeeAll?: () => void;
  favouriteOf?: (merchant: Merchant) => Favourite;
};

export function MerchantCardStrip({ title, merchants, onOpen, onSeeAll, favouriteOf }: StripProps) {
  const { gutter } = usePageLayout();
  if (merchants.length === 0) {
    return null;
  }
  return (
    <View style={styles.strip}>
      <SectionHeading title={title} onSeeAll={onSeeAll} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -gutter }}
        contentContainerStyle={[styles.stripRow, { paddingHorizontal: gutter }]}>
        {merchants.map((merchant) => (
          <View key={merchant.id} style={styles.stripCard}>
            <MerchantCard merchant={merchant} onPress={() => onOpen(merchant)} favourite={favouriteOf?.(merchant)} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const categoryIcons: { match: RegExp; icon: SymbolViewProps['name'] }[] = [
  {
    match: /food|restaurant|dining|coffee|meal/i,
    icon: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  },
  {
    match: /grocer|supermarket/i,
    icon: { ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' },
  },
  {
    match: /fashion|cloth|apparel|shoe/i,
    icon: { ios: 'tshirt', android: 'checkroom', web: 'checkroom' },
  },
  {
    match: /electronic|tech/i,
    icon: { ios: 'desktopcomputer', android: 'devices', web: 'devices' },
  },
  {
    match: /gam/i,
    icon: {
      ios: 'gamecontroller',
      android: 'sports_esports',
      web: 'sports_esports',
    },
  },
  {
    match: /travel|hotel|flight|airline/i,
    icon: { ios: 'airplane', android: 'flight', web: 'flight' },
  },
  {
    match: /entertain|movie|cinema|stream|music/i,
    icon: { ios: 'film', android: 'movie', web: 'movie' },
  },
  {
    match: /home|garden|furni|diy/i,
    icon: { ios: 'house', android: 'home', web: 'home' },
  },
  {
    match: /beauty|health|spa|pharm/i,
    icon: { ios: 'sparkles', android: 'spa', web: 'spa' },
  },
  {
    match: /sport|fitness|outdoor/i,
    icon: {
      ios: 'figure.run',
      android: 'directions_run',
      web: 'directions_run',
    },
  },
  {
    match: /gift|department/i,
    icon: { ios: 'gift', android: 'redeem', web: 'redeem' },
  },
];

const allIcon: SymbolViewProps['name'] = {
  ios: 'square.grid.2x2',
  android: 'apps',
  web: 'apps',
};
const fallbackIcon: SymbolViewProps['name'] = {
  ios: 'tag',
  android: 'sell',
  web: 'sell',
};

function categoryIcon(category: string): SymbolViewProps['name'] {
  return categoryIcons.find(({ match }) => match.test(category))?.icon ?? fallbackIcon;
}

type CategoryTilesProps = {
  categories: string[];
  selected: string | null;
  onSelect: (category: string | null) => void;
};

export function CategoryTiles({ categories, selected, onSelect }: CategoryTilesProps) {
  const { gutter } = usePageLayout();
  if (categories.length === 0) {
    return null;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -gutter }}
      contentContainerStyle={[styles.categoryRow, { paddingHorizontal: gutter }]}>
      <CategoryChip label="All" icon={allIcon} selected={selected === null} onPress={() => onSelect(null)} />
      {categories.map((category) => (
        <CategoryChip
          key={category}
          label={Merchant.categoryLabel(category)}
          icon={categoryIcon(category)}
          selected={selected === category}
          onPress={() => onSelect(selected === category ? null : category)}
        />
      ))}
    </ScrollView>
  );
}

type CategoryChipProps = {
  label: string;
  icon: SymbolViewProps['name'];
  selected: boolean;
  onPress: () => void;
};

function CategoryChip({ label, icon, selected, onPress }: CategoryChipProps) {
  const theme = useTheme();
  return (
    <PressScale
      scale={0.95}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}>
      <View
        style={[
          styles.chip,
          selected
            ? { backgroundColor: theme.backgroundSelected, borderColor: theme.backgroundSelected }
            : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          !selected && Elevation.card,
        ]}>
        <SymbolView name={icon} size={20} tintColor={theme.accent} />
        <ThemedText type={selected ? 'smallBold' : 'small'} numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  cover: {
    aspectRatio: coverAspect,
    borderRadius: Radius.media,
    overflow: 'hidden',
  },
  coverHero: {
    borderRadius: Radius.card,
  },
  badge: {
    position: 'absolute',
    borderRadius: Radius.pill,
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.badge,
  },
  badgeImage: {
    width: '72%',
    height: '72%',
  },
  badgeInitial: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInitialText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bold,
  },
  pill: {
    position: 'absolute',
    top: Spacing.two + Spacing.one,
    left: Spacing.two + Spacing.one,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two + Spacing.one,
    paddingVertical: Spacing.one,
  },
  pillText: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
    fontFamily: FontFamily.bold,
  },
  text: {
    paddingHorizontal: Spacing.half,
    gap: Spacing.half,
  },
  name: {
    fontSize: 16,
    lineHeight: 21,
  },
  favourite: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favouriteDisc: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(15, 27, 45, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  strip: {
    gap: Spacing.three,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headingTitle: {
    flex: 1,
    fontFamily: FontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  seeAll: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripRow: {
    gap: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.two,
  },
  stripCard: {
    width: stripCardWidth,
  },
  categoryRow: {
    gap: Spacing.two,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.three,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
});
