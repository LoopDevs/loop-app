import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Children, Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Notice } from '@/components/form';
import { PressScale } from '@/components/press-scale';
import { Skeleton } from '@/components/skeleton';
import { cachedMerchant } from '@/components/storefront';
import { ThemedText } from '@/components/themed-text';
import { Elevation, FontFamily, Radius, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import { Merchant } from '@/ctx/merchant';
import { errorMessage } from '@/hooks/use-busy-action';
import type { HoldingsView } from '@/hooks/use-holdings';
import { useTheme } from '@/hooks/use-theme';
import { dates, money } from '@/money';
import { stablePeg, type PaymentCurrency } from '@/stellar/network';
import { units } from '@/stellar/units';
import { haptics } from '@/native/haptics';
import { Savings } from '@/wallet/savings';

const recentShown = 4;

const pegNames: Record<'USD' | 'EUR' | 'GBP', { name: string; symbol: string }> = {
  USD: { name: 'US dollars', symbol: '$' },
  EUR: { name: 'Euros', symbol: '€' },
  GBP: { name: 'British pounds', symbol: '£' },
};

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
          style={[styles.sectionTitle, { color: theme.accent }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        {accessory}
      </View>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
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

function SymbolDisc({ symbol }: { symbol: string }) {
  const theme = useTheme();
  return (
    <Disc>
      <Text style={[styles.discSymbol, { color: theme.accent }]} maxFontSizeMultiplier={1.2}>
        {symbol}
      </Text>
    </Disc>
  );
}

function IconDisc({ icon }: { icon: SymbolViewProps['name'] }) {
  const theme = useTheme();
  return (
    <Disc>
      <SymbolView name={icon} size={20} tintColor={theme.accent} />
    </Disc>
  );
}

export function SpendingBalances({ view }: { view: HoldingsView | null }) {
  if (!view) {
    return (
      <OverviewCard title="Spending balance">
        <RowSkeleton />
      </OverviewCard>
    );
  }
  const { holdings, stable } = view;
  const stableCode = stable && Object.hasOwn(stablePeg, stable) ? stablePeg[stable as PaymentCurrency] : stable;
  const pegged = holdings.balances.tokens.filter(
    ({ token, amount }) =>
      stablePeg[token.currency] !== null && (amount > 0n || stablePeg[token.currency] === stableCode),
  );
  const others = holdings.balances.tokens.filter(
    ({ token, amount }) => stablePeg[token.currency] === null && amount > 0n,
  );
  const otherValue =
    stable && others.length > 0
      ? others.reduce<bigint | null>((sum, { token, amount }) => {
          const value = holdings.valueIn(amount, token.currency, stable);
          return sum === null || value === null ? null : sum + value;
        }, 0n)
      : null;
  const rows =
    pegged.length > 0 || otherValue !== null
      ? pegged
      : holdings.balances.tokens.filter(({ token }) => stablePeg[token.currency] !== null).slice(0, 1);
  return (
    <OverviewCard title="Spending balance">
      {rows.map(({ token, amount }) => {
        const peg = stablePeg[token.currency];
        const named = peg ? pegNames[peg] : null;
        return (
          <MoneyRow
            key={token.currency}
            leading={<SymbolDisc symbol={named?.symbol ?? '¤'} />}
            label={named?.name ?? 'Balance'}
            detail={peg === stableCode ? 'Main balance' : 'Ready to spend'}
            amount={money.token(amount, token.currency)}
            amountDetail={peg ?? undefined}
          />
        );
      })}
      {otherValue !== null && stable && (
        <MoneyRow
          leading={
            <IconDisc
              icon={{
                ios: 'arrow.triangle.2.circlepath',
                android: 'sync',
                web: 'sync',
              }}
            />
          }
          label="Other money"
          detail="Valued at today's rate"
          amount={money.ctx(units.format(otherValue, units.decimals), stable)}
        />
      )}
    </OverviewCard>
  );
}

type SavingsCardProps = {
  view: HoldingsView | null;
  onWithdraw: () => void;
  withdrawDisabled: boolean;
  onCashback: () => void;
};

export function SavingsCard({ view, onWithdraw, withdrawDisabled, onCashback }: SavingsCardProps) {
  const theme = useTheme();
  if (!view) {
    return (
      <OverviewCard title="Savings">
        <RowSkeleton />
      </OverviewCard>
    );
  }
  const { holdings, stable } = view;
  const savings = holdings.savings();
  const onTheWay = stable ? holdings.onTheWayIn(stable) : null;
  return (
    <OverviewCard
      title="Savings"
      accessory={
        savings > 0n ? (
          <PressScale
            onPress={onWithdraw}
            disabled={withdrawDisabled}
            accessibilityRole="button"
            accessibilityLabel="Withdraw savings"
            style={[styles.textButton, withdrawDisabled && styles.disabled]}>
            <ThemedText type="smallBold" themeColor="accent">
              Withdraw
            </ThemedText>
          </PressScale>
        ) : null
      }>
      <MoneyRow
        leading={
          <Disc ground={theme.accent}>
            <SymbolView
              name={{ ios: 'leaf', android: 'savings', web: 'savings' }}
              size={20}
              tintColor={theme.onAccent}
            />
          </Disc>
        }
        label="Savings"
        detail={savings > 0n ? 'Earning interest' : 'Cashback lands here and earns interest'}
        amount={money.token(savings, Savings.currency)}
      />
      {onTheWay !== null && onTheWay > 0n && stable && (
        <MoneyRow
          leading={<IconDisc icon={{ ios: 'clock', android: 'schedule', web: 'schedule' }} />}
          label="Cashback on the way"
          detail="Counted in your total balance"
          amount={money.ctx(units.format(onTheWay, units.decimals), stable)}
          onPress={onCashback}
          accessibilityHint="Shows where your cashback goes"
        />
      )}
    </OverviewCard>
  );
}

type NextStepProps = {
  view: HoldingsView | null;
  topMerchant: Merchant | null;
  onAddMoney: () => void;
  onOpenMerchant: (merchant: Merchant) => void;
};

export function NextStep({ view, topMerchant, onAddMoney, onOpenMerchant }: NextStepProps) {
  const theme = useTheme();
  if (!view) {
    return null;
  }
  const total = view.stable ? view.holdings.totalIn(view.stable) : null;
  const step =
    total === 0n
      ? {
          icon: {
            ios: 'plus',
            android: 'add',
            web: 'add',
          } as SymbolViewProps['name'],
          title: 'Add money to get started',
          body: 'Then buy your first gift card and earn cashback on it.',
          onPress: onAddMoney,
        }
      : topMerchant && topMerchant.cashbackBasisPoints() > 0
        ? {
            icon: {
              ios: 'gift',
              android: 'redeem',
              web: 'redeem',
            } as SymbolViewProps['name'],
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
      style={[styles.nextStep, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.nextIcon, { backgroundColor: theme.backgroundElement }]}>
        <SymbolView name={step.icon} size={22} tintColor={theme.accent} />
      </View>
      <View style={styles.rowText}>
        <ThemedText type="smallBold" style={styles.nextTitle}>
          {step.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {step.body}
        </ThemedText>
      </View>
      <SymbolView
        name={{
          ios: 'chevron.right',
          android: 'chevron_right',
          web: 'chevron_right',
        }}
        size={16}
        tintColor={theme.accent}
      />
    </PressScale>
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

function MerchantDisc({ merchantId, name }: { merchantId: string; name: string }) {
  const merchant = cachedMerchant(merchantId);
  if (merchant?.logoUrl) {
    return (
      <Disc ground="#FFFFFF">
        <Image source={{ uri: merchant.logoUrl }} contentFit="contain" style={styles.discImage} accessible={false} />
      </Disc>
    );
  }
  const hue = merchant?.tileHue() ?? 225;
  return (
    <Disc ground={`hsl(${hue}, 42%, 34%)`}>
      <Text style={styles.discInitial}>{name.trim().charAt(0).toUpperCase()}</Text>
    </Disc>
  );
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
    borderRadius: Radius.card,
    overflow: 'hidden',
    ...Elevation.card,
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
  discSymbol: {
    fontFamily: FontFamily.semibold,
    fontSize: 18,
  },
  discImage: {
    width: '72%',
    height: '72%',
  },
  discInitial: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bold,
    fontSize: 16,
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
    borderRadius: Radius.card,
    minHeight: 80,
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
