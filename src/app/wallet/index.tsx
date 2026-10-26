import * as Linking from "expo-linking";
import { useFocusEffect, useRouter, useScrollToTop } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type FlatList,
  type ScrollViewInstance,
} from "react-native";
import Animated, {
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";

import { Button, Notice } from "@/components/form";
import { statusTone } from "@/components/gift-card-details";
import { useScrimScroll } from "@/components/home-panel";
import { PageHeader } from "@/components/page-header";
import { PressScale } from "@/components/press-scale";
import { useOnSignIn, useSignIn } from "@/components/sign-in";
import { OrderRowsSkeleton } from "@/components/skeleton";
import { SplitLayout } from "@/components/split-layout";
import { PageWidth } from "@/components/storefront";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { WalletSummary } from "@/components/wallet-summary";
import { loopLinks } from "@/constants/loop-links";
import {
  BottomTabInset,
  MaxContentWidth,
  Motion,
  Radius,
  Spacing,
} from "@/constants/theme";
import { ctx, type GiftCard } from "@/ctx/client";
import {
  giftCardStatusLabel,
  isHiddenFromHistory,
  outcomeText,
  unpaidStatuses,
} from "@/ctx/gift-card-status";
import { useAppRefresh } from "@/hooks/use-app-refresh";
import { usePageLayout } from "@/hooks/use-page-layout";
import { useSessionOwner } from "@/hooks/use-session-owner";
import { useTheme } from "@/hooks/use-theme";
import { dates, money } from "@/money";

const ordersPerPage = 20;
const staggeredRows = 8;

export default function WalletScreen() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { wide } = usePageLayout();
  const theme = useTheme();
  const { scrollRef, onScroll, scrim } =
    useScrimScroll<FlatList<GiftCard>>();
  const wideScrollRef = useRef<ScrollViewInstance>(null);
  useScrollToTop(wideScrollRef);
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<{
    message: string;
    page: number;
  } | null>(null);
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
        const shownResult = result.filter(
          (giftCard) => !isHiddenFromHistory(giftCard),
        );
        setGiftCards((shown) =>
          next === 1 ? shownResult : [...shown, ...shownResult],
        );
        setPage(next);
        setPages(pagination.pages);
        loadedPages.current = next;
      } catch (error) {
        setFailure({
          message: error instanceof Error ? error.message : String(error),
          page: requested,
        });
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
  useOnSignIn(reload);
  const { openSignIn } = useSignIn();

  const canLoadMore = page > 0 && page < pages;
  const openOrder = (giftCard: GiftCard) =>
    router.push(`/wallet/${giftCard.id}`);

  const emptyState = failure ? null : !signedIn ? (
    <EmptyState
      icon="lock"
      title="Sign in to see your wallet"
      detail="Your dollars, gift cards and cashback show here."
      action="Sign in"
      onAction={() =>
        openSignIn("Sign in to see your dollars, gift cards and cashback.")
      }
    />
  ) : loading ? (
    <OrderRowsSkeleton />
  ) : (
    <EmptyState
      icon="cart"
      title="No gift cards yet"
      detail="Gift cards you buy show here, ready to use."
      action="Shop gift cards"
      onAction={() => router.navigate("/shop")}
    />
  );

  const giftCardsTitle = signedIn ? (
    <ThemedText type="heading" accessibilityRole="header">
      Your gift cards
    </ThemedText>
  ) : null;

  const footer = (
    <>
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
          label={loading ? "Loading…" : "Load more"}
          onPress={() => load(page + 1)}
          disabled={loading}
        />
      )}
    </>
  );

  if (wide) {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style="dark" />
        <Animated.ScrollView
          ref={wideScrollRef}
          contentContainerStyle={styles.wideContent}
          keyboardShouldPersistTaps="handled"
        >
          <PageHeader title="Wallet" width="page" />
          <PageWidth style={styles.wideBody}>
            <SplitLayout
              aside={
                signedIn ? (
                  <>
                    <WalletSummary />
                    <WalletHelp />
                  </>
                ) : null
              }
            >
              {giftCardsTitle}
              {giftCards.length > 0 ? (
                <OrdersTable giftCards={giftCards} onOpen={openOrder} />
              ) : (
                <View style={styles.wideEmpty}>{emptyState}</View>
              )}
              {footer}
            </SplitLayout>
          </PageWidth>
        </Animated.ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Animated.FlatList
        data={giftCards}
        ref={scrollRef}
        keyExtractor={(giftCard) => giftCard.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading && page <= 1 && giftCards.length > 0}
            onRefresh={reload}
            tintColor={theme.textSecondary}
          />
        }
        ListHeaderComponent={
          <>
            <PageHeader title="Wallet" />
            {signedIn && (
              <View style={[styles.body, styles.summary]}>
                <WalletSummary />
                {giftCardsTitle}
              </View>
            )}
          </>
        }
        ListEmptyComponent={<View style={styles.body}>{emptyState}</View>}
        ListFooterComponent={
          <View style={[styles.body, styles.footer]}>{footer}</View>
        }
        renderItem={({ item, index }) => (
          <Animated.View
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.state)
                    .delay(
                      (index % ordersPerPage < staggeredRows
                        ? index % ordersPerPage
                        : 0) * Motion.stagger,
                    )
                    .easing(Motion.easeOut)
            }
            style={styles.body}
          >
            <OrderRow giftCard={item} onPress={() => openOrder(item)} />
          </Animated.View>
        )}
      />
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

function OrdersTable({
  giftCards,
  onOpen,
}: {
  giftCards: GiftCard[];
  onOpen: (giftCard: GiftCard) => void;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="list"
      style={[
        styles.table,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View
        style={[
          styles.tableRow,
          styles.tableHead,
          { borderColor: theme.border },
        ]}
      >
        <ThemedText
          type="smallBold"
          themeColor="textSecondary"
          style={styles.cellMain}
        >
          Gift card
        </ThemedText>
        <ThemedText
          type="smallBold"
          themeColor="textSecondary"
          style={styles.cell}
        >
          Ordered
        </ThemedText>
        <ThemedText
          type="smallBold"
          themeColor="textSecondary"
          style={styles.cell}
        >
          Status
        </ThemedText>
        <ThemedText
          type="smallBold"
          themeColor="textSecondary"
          style={[styles.cell, styles.cellAmount]}
        >
          Amount
        </ThemedText>
        <View style={styles.chevronCell} />
      </View>
      {giftCards.map((giftCard, index) => (
        <OrderTableRow
          key={giftCard.id}
          giftCard={giftCard}
          last={index === giftCards.length - 1}
          onPress={() => onOpen(giftCard)}
        />
      ))}
    </View>
  );
}

function OrderTableRow({
  giftCard,
  last,
  onPress,
}: {
  giftCard: GiftCard;
  last: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  const outcome = outcomeText(giftCard);
  const amount = money.ctx(giftCard.cardFiatAmount, giftCard.cardFiatCurrency);
  const status = giftCardStatusLabel(giftCard.status);
  const tone = statusTone(giftCard.status);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityLabel={`${giftCard.merchantName}, ${amount}, ${status}, ${dates.day(giftCard.created)}`}
      style={({ pressed }) => [
        styles.tableRow,
        styles.tableBodyRow,
        { borderColor: theme.border },
        last && styles.lastRow,
        (hovered || pressed) && { backgroundColor: theme.backgroundSelected },
      ]}
    >
      <View style={styles.cellMain}>
        <ThemedText type="smallBold">{giftCard.merchantName}</ThemedText>
        {outcome && (
          <ThemedText type="small" themeColor="textSecondary">
            {outcome}
          </ThemedText>
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.cell}>
        {dates.day(giftCard.created)}
      </ThemedText>
      <View style={[styles.cell, styles.statusCell]}>
        <View style={[styles.statusDot, { backgroundColor: theme[tone] }]} />
        <ThemedText type="small" themeColor={tone}>
          {status}
        </ThemedText>
      </View>
      <ThemedText
        type="smallBold"
        style={[styles.cell, styles.cellAmount, styles.amount]}
      >
        {amount}
      </ThemedText>
      <View style={styles.chevronCell}>
        <SymbolView
          name={{
            ios: "chevron.right",
            android: "chevron_right",
            web: "chevron_right",
          }}
          size={16}
          tintColor={hovered ? theme.text : theme.textSecondary}
        />
      </View>
    </Pressable>
  );
}

function WalletHelp() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.asideCard,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <ThemedText type="smallBold">Need help with a gift card?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Open the gift card for its code and how to use it. For anything else,
        email Loop support with the shop name and date.
      </ThemedText>
      <Button
        label="Contact support"
        onPress={() => Linking.openURL(loopLinks.supportMail())}
      />
    </View>
  );
}

function OrderRow({
  giftCard,
  onPress,
}: {
  giftCard: GiftCard;
  onPress: () => void;
}) {
  const theme = useTheme();
  const outcome = outcomeText(giftCard);
  const amount = money.ctx(giftCard.cardFiatAmount, giftCard.cardFiatCurrency);
  const status = giftCardStatusLabel(giftCard.status);
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${giftCard.merchantName}, ${amount}, ${status}, ${dates.day(giftCard.created)}`}
      style={[
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <ThemedText type="smallBold" style={styles.rowName}>
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
        name={{
          ios: "chevron.right",
          android: "chevron_right",
          web: "chevron_right",
        }}
        size={16}
        tintColor={theme.textSecondary}
      />
    </PressScale>
  );
}

type EmptyStateProps = {
  icon: "lock" | "cart";
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
};

const emptyIcons = {
  lock: { ios: "lock", android: "lock", web: "lock" },
  cart: { ios: "bag", android: "shopping_bag", web: "shopping_bag" },
} as const;

function EmptyState({
  icon,
  title,
  detail,
  action,
  onAction,
}: EmptyStateProps) {
  const theme = useTheme();
  const { wide } = usePageLayout();
  return (
    <View style={styles.empty}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <SymbolView
          name={emptyIcons[icon]}
          size={22}
          tintColor={theme.accent}
        />
      </View>
      <ThemedText type="heading">{title}</ThemedText>
      <ThemedText themeColor="textSecondary">{detail}</ThemedText>
      <View style={wide && styles.emptyAction}>
        <Button label={action} variant="primary" onPress={onAction} />
      </View>
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
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.three,
  },
  summary: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.five,
  },
  footer: {
    paddingTop: Spacing.two,
    gap: Spacing.three,
  },
  wideContent: {
    paddingBottom: Spacing.six,
  },
  wideBody: {
    paddingTop: Spacing.five,
  },
  wideEmpty: {
    alignItems: "flex-start",
  },
  table: {
    borderWidth: 1,
    borderRadius: Radius.control,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
  },
  tableHead: {
    minHeight: 44,
  },
  tableBodyRow: {
    minHeight: 64,
    paddingVertical: Spacing.three,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  cellMain: {
    flex: 2.2,
    minWidth: 0,
    gap: Spacing.half,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  cellAmount: {
    textAlign: "right",
  },
  statusCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
  },
  chevronCell: {
    width: 16,
  },
  asideCard: {
    borderWidth: 1,
    borderRadius: Radius.control,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  rowName: {
    flex: 1,
  },
  amount: {
    fontVariant: ["tabular-nums"],
  },
  empty: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
    maxWidth: 440,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.control,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.one,
  },
  emptyAction: {
    paddingTop: Spacing.two,
    alignSelf: "flex-start",
  },
});
