import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { Button, Notice } from '@/components/form';
import { statusTone } from '@/components/gift-card-details';
import { useScrimScroll } from '@/components/home-panel';
import { PageHeader } from '@/components/page-header';
import { PressScale } from '@/components/press-scale';
import { OrderRowsSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Brand, FontFamily, MaxContentWidth, Motion, Radius, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import {
  giftCardStatusLabel,
  isHiddenFromHistory,
  outcomeText,
  unpaidStatuses,
} from '@/ctx/gift-card-status';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { useTheme } from '@/hooks/use-theme';
import { dates, money } from '@/money';

const ordersPerPage = 20;
const staggeredRows = 8;

export default function OrdersScreen() {
  const router = useRouter();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { onScroll, scrim } = useScrimScroll();
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<{ message: string; page: number } | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const loadedPages = useRef(0);
  const readSession = useSessionOwner();

  const load = useCallback(
    async (requested: number, keepPaged = false) => {
      setLoading(true);
      setFailure(null);
      try {
        const { userId, changed } = await readSession();
        if (changed || !userId) {
          setGiftCards([]);
          setPage(0);
          setPages(0);
          loadedPages.current = 0;
        }
        setSignedIn(userId !== null);
        if (!userId) {
          return;
        }
        if (keepPaged && !changed && loadedPages.current > 1) {
          return;
        }
        const next = changed ? 1 : requested;
        const { result, pagination } = await ctx.giftCards({
          notStatus: unpaidStatuses,
          perPage: ordersPerPage,
          page: next,
        });
        const shownResult = result.filter((giftCard) => !isHiddenFromHistory(giftCard));
        setGiftCards((shown) => (next === 1 ? shownResult : [...shown, ...shownResult]));
        setPage(next);
        setPages(pagination.pages);
        loadedPages.current = next;
      } catch (error) {
        setFailure({ message: error instanceof Error ? error.message : String(error), page: requested });
      } finally {
        setLoading(false);
      }
    },
    [readSession],
  );

  const reload = useCallback(() => load(1), [load]);

  const reloadUnlessPaged = useCallback(() => {
    load(1, true);
  }, [load]);

  useFocusEffect(reloadUnlessPaged);
  useAppRefresh(reloadUnlessPaged);

  const canLoadMore = page > 0 && page < pages;

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <Animated.FlatList
        data={giftCards}
        keyExtractor={(giftCard) => giftCard.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading && page <= 1 && giftCards.length > 0} onRefresh={reload} tintColor={theme.accent} />
        }
        ListHeaderComponent={
          <PageHeader
            title="Orders"
            accessory={
              signedIn ? (
                <PressScale
                  onPress={() => router.push('/orders/cashback')}
                  accessibilityRole="button"
                  accessibilityLabel="Cashback"
                  style={styles.cashbackButton}>
                  <SymbolView
                    name={{ ios: 'percent', android: 'percent', web: 'percent' }}
                    size={18}
                    tintColor={Brand.onRoyal}
                  />
                  <Text style={styles.cashbackText} maxFontSizeMultiplier={1.3}>
                    Cashback
                  </Text>
                </PressScale>
              ) : null
            }
          />
        }
        ListEmptyComponent={
          <View style={styles.body}>
            {failure ? null : !signedIn ? (
              <EmptyState
                title="Sign in to see your orders"
                detail="Gift cards you buy show here with their codes."
                action="Sign in"
                onAction={() => router.navigate('/')}
              />
            ) : loading ? (
              <OrderRowsSkeleton />
            ) : (
              <EmptyState
                title="No orders yet"
                detail="Gift cards you buy show here, ready to use."
                action="Shop gift cards"
                onAction={() => router.navigate('/shop')}
              />
            )}
          </View>
        }
        ListFooterComponent={
          <View style={[styles.body, styles.footer]}>
            {failure && (
              <Notice
                message={failure.message}
                actionLabel="Try again"
                onAction={() => load(failure.page)}
                disabled={loading}
              />
            )}
            {!failure && canLoadMore && (
              <Button
                label={loading ? 'Loading…' : 'Load more'}
                onPress={() => load(page + 1)}
                disabled={loading}
              />
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.state)
                    .delay((index % ordersPerPage < staggeredRows ? index % ordersPerPage : 0) * Motion.stagger)
                    .easing(Motion.easeOut)
            }
            style={styles.body}>
            <OrderRow giftCard={item} onPress={() => router.push(`/orders/${item.id}`)} />
          </Animated.View>
        )}
      />
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

function OrderRow({ giftCard, onPress }: { giftCard: GiftCard; onPress: () => void }) {
  const theme = useTheme();
  const outcome = outcomeText(giftCard);
  const amount = money.ctx(giftCard.cardFiatAmount, giftCard.cardFiatCurrency);
  const status = giftCardStatusLabel(giftCard.status);
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${giftCard.merchantName}, ${amount}, ${status}, ${dates.day(giftCard.created)}`}
      style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.rowName}>
            {giftCard.merchantName}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.amount}>
            {amount}
          </ThemedText>
        </View>
        <View style={styles.rowTop}>
          <ThemedText type="small" themeColor={statusTone(giftCard.status)}>
            {status}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {dates.day(giftCard.created)}
          </ThemedText>
        </View>
        {outcome && (
          <ThemedText type="small" themeColor="textSecondary">
            {outcome}
          </ThemedText>
        )}
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={16}
        tintColor={theme.textSecondary}
      />
    </PressScale>
  );
}

function EmptyState({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.empty}>
      <ThemedText type="heading">{title}</ThemedText>
      <ThemedText themeColor="textSecondary">{detail}</ThemedText>
      <Button label={action} variant="primary" onPress={onAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.two,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
  },
  footer: {
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
  cashbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Brand.navy,
  },
  cashbackText: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.semibold,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    minHeight: 72,
    borderWidth: 1,
    borderRadius: Radius.control,
  },
  rowMain: {
    flex: 1,
    gap: Spacing.half,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  rowName: {
    flex: 1,
  },
  amount: {
    fontVariant: ['tabular-nums'],
  },
  empty: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
});
