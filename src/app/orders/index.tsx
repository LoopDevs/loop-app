import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';

import { Button } from '@/components/form';
import { OrderRowsSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import { giftCardStatusLabel, historyHiddenStatuses } from '@/ctx/gift-card-status';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { dates, money } from '@/money';

const ordersPerPage = 20;

export default function OrdersScreen() {
  const router = useRouter();
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<{ message: string; page: number } | null>(null);
  const loadedPages = useRef(0);

  const load = useCallback(async (next: number) => {
    setLoading(true);
    setFailure(null);
    try {
      const { result, pagination } = await ctx.giftCards({
        notStatus: historyHiddenStatuses,
        perPage: ordersPerPage,
        page: next,
      });
      setGiftCards((shown) => (next === 1 ? result : [...shown, ...result]));
      setPage(next);
      setPages(pagination.pages);
      loadedPages.current = next;
    } catch (error) {
      setFailure({ message: error instanceof Error ? error.message : String(error), page: next });
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => load(1), [load]);

  const reloadUnlessPaged = useCallback(() => {
    if (loadedPages.current <= 1) {
      reload();
    }
  }, [reload]);

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
          failure ? undefined : loading ? (
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
