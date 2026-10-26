import { Image } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CashbackPill } from '@/components/merchant-tile';
import { PressScale } from '@/components/press-scale';
import { ThemedText } from '@/components/themed-text';
import { Brand, Elevation, FontFamily, Motion, Radius, Spacing } from '@/constants/theme';
import { Merchant } from '@/ctx/merchant';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

const stripCardWidth = 264;
const mediaAspect = 16 / 10;
const badgeSize = 48;

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
  const theme = useTheme();
  const photo = Boolean(merchant.cardImageUrl);
  const category = merchant.categories[0];
  return (
    <View style={[styles.shadow, { backgroundColor: theme.backgroundElement, borderRadius: Radius.card }]}>
      <PressScale
        style={[styles.card, { backgroundColor: theme.backgroundElement }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${merchant.name}, ${merchant.rateLabel()}`}>
        <View>
          <CardMedia merchant={merchant} />
          <CashbackPill merchant={merchant} />
          {photo && <LogoBadge merchant={merchant} borderColor={theme.backgroundElement} />}
        </View>
        <View style={[styles.text, photo && styles.textUnderBadge]}>
          <ThemedText type="smallBold" style={styles.name} numberOfLines={2}>
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

function CardMedia({ merchant }: { merchant: Merchant }) {
  const theme = useTheme();
  if (merchant.cardImageUrl) {
    return (
      <View style={[styles.media, { backgroundColor: theme.backgroundSelected }]}>
        <Image
          source={{ uri: merchant.cardImageUrl }}
          contentFit="cover"
          transition={Motion.state}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      </View>
    );
  }
  if (merchant.logoUrl) {
    return (
      <View style={[styles.media, styles.logoGround, { borderBottomColor: theme.border }]}>
        <Image
          source={{ uri: merchant.logoUrl }}
          contentFit="contain"
          transition={Motion.state}
          style={styles.logoImage}
          accessible={false}
        />
      </View>
    );
  }
  return (
    <View style={[styles.media, { backgroundColor: `hsl(${merchant.tileHue()}, 42%, 34%)` }]}>
      <Text style={styles.initial}>{merchant.initial()}</Text>
    </View>
  );
}

function LogoBadge({ merchant, borderColor }: { merchant: Merchant; borderColor: string }) {
  return (
    <View style={[styles.badge, { borderColor }]}>
      {merchant.logoUrl ? (
        <Image source={{ uri: merchant.logoUrl }} contentFit="contain" style={styles.badgeImage} accessible={false} />
      ) : (
        <View style={[styles.badgeInitial, { backgroundColor: `hsl(${merchant.tileHue()}, 42%, 34%)` }]}>
          <Text style={styles.badgeInitialText}>{merchant.initial()}</Text>
        </View>
      )}
    </View>
  );
}

function FavouriteButton({ merchant, favourite }: { merchant: Merchant; favourite: Favourite }) {
  const icon: SymbolViewProps['name'] = favourite.saved
    ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' }
    : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' };
  return (
    <PressScale
      style={styles.favourite}
      scale={0.88}
      hitSlop={6}
      onPress={() => {
        haptics.tap();
        favourite.onToggle();
      }}
      accessibilityRole="button"
      accessibilityLabel={
        favourite.saved ? `Remove ${merchant.name} from favourites` : `Add ${merchant.name} to favourites`
      }
      accessibilityState={{ selected: favourite.saved }}>
      <SymbolView name={icon} size={18} tintColor={Brand.royal} />
    </PressScale>
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
  const theme = useTheme();
  const { gutter } = usePageLayout();
  if (merchants.length === 0) {
    return null;
  }
  return (
    <View style={styles.strip}>
      <View style={styles.stripHeading}>
        <ThemedText type="heading" accessibilityRole="header" style={styles.stripTitle}>
          {title}
        </ThemedText>
        {onSeeAll && (
          <PressScale
            onPress={onSeeAll}
            scale={0.92}
            accessibilityRole="button"
            accessibilityLabel={`See all: ${title}`}
            style={[styles.seeAll, { backgroundColor: theme.backgroundSelected }]}>
            <SymbolView
              name={{
                ios: 'chevron.right',
                android: 'chevron_right',
                web: 'chevron_right',
              }}
              size={18}
              tintColor={theme.accent}
            />
          </PressScale>
        )}
      </View>
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
      <CategoryTile label="All" icon={allIcon} selected={selected === null} onPress={() => onSelect(null)} />
      {categories.map((category) => (
        <CategoryTile
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

type CategoryTileProps = {
  label: string;
  icon: SymbolViewProps['name'];
  selected: boolean;
  onPress: () => void;
};

function CategoryTile({ label, icon, selected, onPress }: CategoryTileProps) {
  const theme = useTheme();
  return (
    <PressScale
      style={styles.category}
      scale={0.94}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}>
      <View
        style={[
          styles.categoryIcon,
          {
            backgroundColor: selected ? theme.accent : theme.backgroundElement,
          },
          !selected && Elevation.card,
        ]}>
        <SymbolView name={icon} size={26} tintColor={selected ? theme.onAccent : theme.accent} />
      </View>
      <ThemedText
        type={selected ? 'smallBold' : 'small'}
        themeColor={selected ? 'text' : 'textSecondary'}
        numberOfLines={1}
        style={styles.categoryLabel}>
        {label}
      </ThemedText>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  shadow: {
    ...Elevation.card,
  },
  card: {
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  media: {
    aspectRatio: mediaAspect,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoGround: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logoImage: {
    width: '58%',
    height: '58%',
  },
  initial: {
    color: '#FFFFFF',
    fontSize: 40,
    fontFamily: FontFamily.bold,
  },
  badge: {
    position: 'absolute',
    left: Spacing.three,
    bottom: -badgeSize / 2,
    width: badgeSize,
    height: badgeSize,
    borderRadius: Radius.pill,
    borderWidth: 3,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.badge,
  },
  badgeImage: {
    width: '74%',
    height: '74%',
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
    fontSize: 18,
    fontFamily: FontFamily.bold,
  },
  text: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.half,
  },
  textUnderBadge: {
    paddingTop: badgeSize / 2 + Spacing.two,
  },
  name: {
    fontSize: 16,
    lineHeight: 21,
  },
  favourite: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.badge,
  },
  strip: {
    gap: Spacing.three,
  },
  stripHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stripTitle: {
    flex: 1,
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
    paddingBottom: Spacing.four,
  },
  stripCard: {
    width: stripCardWidth,
  },
  categoryRow: {
    gap: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: Spacing.three,
  },
  category: {
    width: 76,
    alignItems: 'center',
    gap: Spacing.two,
  },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.media,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    textAlign: 'center',
  },
});
