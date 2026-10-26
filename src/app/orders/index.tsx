import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';

import { Button } from '@/components/form';
import { OrderRowsSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import {
  giftCardStatusLabel,
  isHiddenFromHistory,
  outcomeText,
  unpaidStatuses,
} from '@/ctx/gift-card-status';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { dates, money } from '@/money';

const ordersPerPage = 20;

export default function OrdersScreen() {
  const router = useRouter();
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
      <FlatList
        data={giftCards}
        keyExtractor={(giftCard) => giftCard.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading && page <= 1} onRefresh={reload} />}
        ListEmptyComponent={
          failure ? undefined : !signedIn ? (
            <>
              <ThemedText type="small">Sign in to see your orders.</ThemedText>
              <Button label="Sign in" onPress={() => router.navigate('/')} />
            </>
          ) : loading ? (
            <OrderRowsSkeleton />
          ) : (
            <>
              <ThemedText type="small">No orders yet.</ThemedText>
              <Button label="Buy a gift card" onPress={() => router.navigate('/shop')} />
            </>
          )
        }
        ListFooterComponent={
          <>
            {failure && (
              <>
                <ThemedText type="small">{failure.message}</ThemedText>
                <Button label="Retry" onPress={() => load(failure.page)} disabled={loading} />
              </>
            )}
            {!failure && canLoadMore && (
              <Button label="Load more" onPress={() => load(page + 1)} disabled={loading} />
            )}
          </>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/orders/${item.id}`)}>
            <ThemedView type="backgroundElement" style={styles.row}>
              <ThemedText type="smallBold">{item.merchantName}</ThemedText>
              <ThemedText type="small">
                {money.ctx(item.cardFiatAmount, item.cardFiatCurrency)} · {giftCardStatusLabel(item.status)} ·{' '}
                {dates.day(item.created)}
              </ThemedText>
              {outcomeText(item) && <ThemedText type="small">{outcomeText(item)}</ThemedText>}
            </ThemedView>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.two,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
});
