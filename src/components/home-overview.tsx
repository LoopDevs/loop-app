import { useFocusEffect } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Children, Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MerchantDisc } from '@/components/merchant-mark';
import { Notice } from '@/components/ui/form';
import { PressScale } from '@/components/ui/press-scale';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemedText } from '@/components/ui/themed-text';
import { Elevation, FontFamily, Radius, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import { Merchant } from '@/ctx/merchant';
import { Rates } from '@/ctx/rates';
import { errorMessage } from '@/hooks/use-busy-action';
import type { HoldingsView } from '@/hooks/use-holdings';
import { useTheme } from '@/hooks/use-theme';
import { dates, money } from '@/money';
import { stablePeg, type PaymentCurrency } from '@/stellar/network';
import { haptics } from '@/native/haptics';
import type { SavingsHolding } from '@/wallet/holdings';

const recentShown = 4;

const amountStyle = { fontVariant: ['tabular-nums' as const] };

export function OverviewCard({
  title,
  accessory,
  children,
}: {
  title: string;
  accessory?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text
          style={[styles.sectionTitle, { color: theme.text }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        {accessory}
      </View>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

type MoneyRowProps = {
  leading: ReactNode;
  label: string;
  detail: string;
  amount: string;
  amountDetail?: string;
  onPress?: () => void;
  accessibilityHint?: string;
};

function MoneyRow({ leading, label, detail, amount, amountDetail, onPress, accessibilityHint }: MoneyRowProps) {
  const theme = useTheme();
  const content = (
    <>
      {leading}
      <View style={styles.rowText}>
        <ThemedText type="smallBold" style={styles.rowLabel}>
          {label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <View style={styles.rowAmount}>
        <ThemedText type="smallBold" style={[styles.rowLabel, amountStyle]}>
          {amount}
        </ThemedText>
        {amountDetail ? (
          <ThemedText type="small" themeColor="textSecondary">
            {amountDetail}
          </ThemedText>
        ) : null}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={`${label}, ${detail}, ${amount}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${detail}, ${amount}`}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      {content}
    </Pressable>
  );
}

function Disc({ children, ground }: { children: ReactNode; ground?: string }) {
  const theme = useTheme();
  return <View style={[styles.disc, { backgroundColor: ground ?? theme.backgroundSelected }]}>{children}</View>;
}

function IconDisc({ icon }: { icon: SymbolViewProps['name'] }) {
  const theme = useTheme();
  return (
    <Disc>
      <SymbolView name={icon} size={20} tintColor={theme.accent} />
    </Disc>
  );
}

type SavingsCardProps = {
  view: HoldingsView | null;
  onCashOut: () => void;
  onShop: () => void;
};

export function SavingsCard({ view, onCashOut, onShop }: SavingsCardProps) {
  if (!view) {
    return (
      <OverviewCard title="Savings">
        <RowSkeleton />
      </OverviewCard>
    );
  }
  const { holdings, stable } = view;
  const savings = holdings.savingsHoldings();
  return (
    <>
      <SavingsOverview savings={savings} stable={stable} onCashOut={onCashOut} />
      {savings.length === 0 && <SavingsPromo onPress={onShop} />}
    </>
  );
}

type SavingsOverviewProps = {
  savings: SavingsHolding[];
  stable: HoldingsView['stable'];
  onCashOut: () => void;
};

function SavingsOverview({ savings, stable, onCashOut }: SavingsOverviewProps) {
  const theme = useTheme();
  const leaf = (
    <Disc ground={theme.accent}>
      <SymbolView name={{ ios: 'leaf', android: 'savings', web: 'savings' }} size={20} tintColor={theme.onAccent} />
    </Disc>
  );
  return (
    <OverviewCard
      title="Savings"
      accessory={
        savings.length > 0 ? (
          <PressScale
            onPress={onCashOut}
            accessibilityRole="button"
            accessibilityLabel="Cash out to bank"
            style={styles.textButton}>
            <ThemedText type="smallBold" themeColor="accent">
              Cash out
            </ThemedText>
          </PressScale>
        ) : null
      }>
      {savings.length === 0 && (
        <MoneyRow
          leading={leaf}
          label="Savings"
          detail="Cashback lands here and earns interest"
          amount={money.ctx('0', stable ?? Rates.usd)}
        />
      )}
      {savings.map(({ currency, amount }) => (
        <MoneyRow
          key={currency}
          leading={leaf}
          label="Savings"
          detail="Earning interest"
          amount={money.token(amount, currency)}
        />
      ))}
    </OverviewCard>
  );
}

type NextStepProps = {
  view: HoldingsView | null;
  topMerchant: Merchant | null;
  onOpenMerchant: (merchant: Merchant) => void;
};

export function NextStep({ view, topMerchant, onOpenMerchant }: NextStepProps) {
  const theme = useTheme();
  if (!view) {
    return null;
  }
  const step =
    topMerchant && topMerchant.cashbackBasisPoints() > 0
      ? {
          icon: {
            ios: 'gift',
            android: 'redeem',
            web: 'redeem',
          } as SymbolViewProps['name'],
          label: 'Top cashback',
          title: `Earn ${topMerchant.rateFigure()} back at ${topMerchant.name}`,
          body: 'The highest cashback rate in the shop right now.',
          onPress: () => onOpenMerchant(topMerchant),
        }
      : null;
  if (!step) {
    return null;
  }
  return (
    <PressScale
      onPress={() => {
        haptics.tap();
        step.onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${step.title}. ${step.body}`}
      style={[
        styles.nextStep,
        Elevation.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <View style={styles.rowText}>
        <Text style={[styles.cardLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
          {step.label}
        </Text>
        <ThemedText type="smallBold" style={styles.nextTitle}>
          {step.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {step.body}
        </ThemedText>
      </View>
      <View style={[styles.nextIcon, { backgroundColor: theme.accentSoft }]}>
        <SymbolView name={step.icon} size={22} tintColor={theme.accent} />
      </View>
      <SymbolView
        name={{
          ios: 'chevron.right',
          android: 'chevron_right',
          web: 'chevron_right',
        }}
        size={16}
        tintColor={theme.textSecondary}
      />
    </PressScale>
  );
}

function SavingsPromo({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.promo,
        Elevation.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <View style={styles.promoText}>
        <Text style={[styles.promoTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
          Cashback that grows while you save
        </Text>
        <PressScale
          onPress={() => {
            haptics.tap();
            onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel="Shop gift cards"
          style={[styles.promoButton, { backgroundColor: theme.backgroundSelected }]}>
          <Text style={[styles.promoButtonLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            Shop gift cards
          </Text>
        </PressScale>
      </View>
      <View style={[styles.promoDisc, { backgroundColor: theme.accentSoft }]}>
        <SymbolView
          name={{ ios: 'leaf.fill', android: 'savings', web: 'savings' }}
          size={44}
          tintColor={theme.accent}
        />
      </View>
    </View>
  );
}

type RecentGiftCardsProps = {
  refreshKey: number;
  onOpenOrder: (id: string) => void;
  onSeeAll: () => void;
  onShop: () => void;
};

export function RecentGiftCards({ refreshKey, onOpenOrder, onSeeAll, onShop }: RecentGiftCardsProps) {
  const [giftCards, setGiftCards] = useState<GiftCard[] | null>(null);
  const [failure, setFailure] = useState('');
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setFailure('');
    try {
      const { result } = await ctx.giftCards({
        status: ['fulfilled'],
        perPage: recentShown,
      });
      if (request === latestRequest.current) {
        setGiftCards(result);
      }
    } catch (error) {
      if (request === latestRequest.current) {
        setFailure(errorMessage(error));
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        latestRequest.current += 1;
      };
    }, [load]),
  );

  const loadedKey = useRef(refreshKey);
  useEffect(() => {
    if (loadedKey.current !== refreshKey) {
      loadedKey.current = refreshKey;
      load();
    }
  }, [refreshKey, load]);

  const seeAll =
    giftCards && giftCards.length > 0 ? (
      <PressScale
        onPress={onSeeAll}
        accessibilityRole="button"
        accessibilityLabel="See all orders"
        style={styles.textButton}>
        <ThemedText type="smallBold" themeColor="accent">
          See all
        </ThemedText>
      </PressScale>
    ) : null;

  if (failure !== '') {
    return (
      <OverviewCard title="Recent gift cards">
        <View style={styles.rowPadding}>
          <Notice message={failure} actionLabel="Try again" onAction={load} />
        </View>
      </OverviewCard>
    );
  }
  if (giftCards === null) {
    return (
      <OverviewCard title="Recent gift cards">
        <RowSkeleton />
        <RowSkeleton />
      </OverviewCard>
    );
  }
  if (giftCards.length === 0) {
    return (
      <OverviewCard title="Recent gift cards">
        <MoneyRow
          leading={
            <IconDisc
              icon={{
                ios: 'bag',
                android: 'shopping_bag',
                web: 'shopping_bag',
              }}
            />
          }
          label="No gift cards yet"
          detail="Your gift cards show here, ready to use"
          amount=""
          onPress={onShop}
          accessibilityHint="Opens the shop"
        />
      </OverviewCard>
    );
  }
  return (
    <OverviewCard title="Recent gift cards" accessory={seeAll}>
      {giftCards.map((giftCard) => (
        <MoneyRow
          key={giftCard.id}
          leading={<MerchantDisc merchantId={giftCard.merchantId} name={giftCard.merchantName} />}
          label={giftCard.merchantName}
          detail={dates.day(giftCard.created)}
          amount={money.fiat(giftCard.cardFiatAmount, giftCard.cardFiatCurrency)}
          amountDetail={cashbackLine(giftCard)}
          onPress={() => onOpenOrder(giftCard.id)}
        />
      ))}
    </OverviewCard>
  );
}

function cashbackLine({ cashbackAmount, cashbackCurrency }: GiftCard): string | undefined {
  if (!cashbackAmount || !cashbackCurrency) {
    return undefined;
  }
  if (Object.hasOwn(stablePeg, cashbackCurrency) && !stablePeg[cashbackCurrency as PaymentCurrency]) {
    return undefined;
  }
  return `+${money.ctx(cashbackAmount, cashbackCurrency)} cashback`;
}

function RowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={40} height={40} />
      <View style={styles.rowText}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
    paddingHorizontal: Spacing.one,
  },
  sectionTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    lineHeight: 22,
  },
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three + 40 + Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    minHeight: 72,
  },
  rowPadding: {
    padding: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  rowLabel: {
    fontSize: 16,
    lineHeight: 22,
  },
  rowAmount: {
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
  disc: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  textButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  disabled: {
    opacity: 0.5,
  },
  nextStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 80,
  },
  cardLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
  },
  promoText: {
    flex: 1,
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  promoTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 20,
    lineHeight: 26,
  },
  promoButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
  },
  promoButtonLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
  },
  promoDisc: {
    width: 96,
    height: 96,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
});
