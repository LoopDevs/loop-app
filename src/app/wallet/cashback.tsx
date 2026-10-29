import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';

import { Notice } from '@/components/form';
import { useScrimScroll } from '@/components/home-panel';
import { ListGroup, ListRow } from '@/components/list-row';
import { PageHeader } from '@/components/page-header';
import { useOnSignIn, useSignIn } from '@/components/sign-in';
import { OrderRowsSkeleton } from '@/components/skeleton';
import { SplitLayout } from '@/components/split-layout';
import { PageWidth } from '@/components/storefront';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import type { Account, OnTheWayItem } from '@/ctx/account';
import { ctx, type CashbackDestination } from '@/ctx/client';
import { Profile } from '@/ctx/profile';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/hooks/use-profile';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { money } from '@/money';
import { Savings } from '@/wallet/savings';

const destinationCopy: Record<CashbackDestination, { label: string; detail: string }> = {
  account: { label: 'Account', detail: 'Cashback is paid into your balance.' },
  savings: {
    label: 'Savings',
    detail: 'Cashback goes to savings and earns interest when savings is available. Otherwise it stays with Loop.',
  },
};

const savingsNote = `Loop savings holds ${Profile.currencyLabel(Savings.currency)}. Cashback in another currency stays with Loop; switch to Account to have it paid into your balance.`;

const signInFailure = 'Sign in to see your cashback.';
const destinationFooter = 'Your choice applies to future cashback. Cashback already paid out stays where it is.';

export default function CashbackScreen() {
  const router = useRouter();
  const { wide } = usePageLayout();
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const { onScroll } = useScrimScroll();
  const theme = useTheme();
  const destinationY = useRef(0);
  const { profile, setProfile } = useProfile();
  const destinationWrites = useRef(0);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const { busy, message, run } = useBusyAction();
  const readSession = useSessionOwner();

  const load = useCallback(async () => {
    setLoading(true);
    setFailure('');
    const writesAtStart = destinationWrites.current;
    try {
      const { userId, changed } = await readSession();
      if (changed || !userId) {
        setProfile(null);
        setAccount(null);
      }
      if (!userId) {
        setFailure(signInFailure);
        return;
      }
      const [me, loaded] = await Promise.all([ctx.me(), ctx.account()]);
      if (writesAtStart === destinationWrites.current) {
        setProfile(me);
      }
      setAccount(loaded);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [setProfile, readSession]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useAppRefresh(load);
  useOnSignIn(load);
  const { openSignIn } = useSignIn();

  const choose = (destination: CashbackDestination) => {
    const update = profile?.destinationUpdate(destination);
    if (!profile || !update) {
      return;
    }
    destinationWrites.current += 1;
    setProfile(profile.withUpdate(update));
    run(async () => {
      try {
        setProfile(profile.withUser(await ctx.updateUser(update)));
      } catch (error) {
        setProfile(profile);
        throw error;
      }
    });
  };

  const showDestination = () => scroll.current?.scrollTo({ y: destinationY.current, animated: true });

  const items = profile && account ? account.onTheWay(profile) : [];
  const destinations = profile ? profile.cashbackDestinations() : [];

  const statusSection =
    failure === signInFailure ? (
      <Notice message={failure} tone="neutral" actionLabel="Sign in" onAction={() => openSignIn(signInFailure)} />
    ) : failure !== '' ? (
      <Notice message={failure} actionLabel="Retry" onAction={load} disabled={loading} />
    ) : (
      <OrderRowsSkeleton />
    );

  const destinationSection = profile && (
    <>
      <ListGroup title="Where cashback goes" footer={destinationFooter}>
        {destinations.length === 1 ? (
          <ListRow label={destinationCopy.account.label} detail={destinationCopy.account.detail} />
        ) : (
          destinations.map((destination) => (
            <ListRow
              key={destination}
              label={destinationCopy[destination].label}
              detail={destinationCopy[destination].detail}
              accessibilityRole="radio"
              trailing="check"
              selected={profile.cashbackDestination === destination}
              disabled={busy || loading}
              onPress={() => choose(destination)}
            />
          ))
        )}
      </ListGroup>
      {destinations.includes('savings') && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          {savingsNote}
        </ThemedText>
      )}
      {message !== '' && <Notice message={message} />}
    </>
  );

  const onTheWaySection = profile && account && (
    <>
      <ListGroup title="On the way">
        {items.length === 0 ? (
          <ListRow label="Nothing on the way right now." />
        ) : (
          items.map((item) => <OnTheWayRow key={item.key} item={item} onShowDestination={showDestination} />)
        )}
      </ListGroup>
      <Pressable onPress={() => router.navigate('/wallet')} accessibilityRole="link" style={[styles.note, styles.link]}>
        <ThemedText type="linkPrimary">Cashback still settling is shown on each order</ThemedText>
      </Pressable>
    </>
  );

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        ref={scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, wide && styles.wideContent]}
        refreshControl={
          <RefreshControl refreshing={loading && profile !== null} onRefresh={load} tintColor={theme.textSecondary} />
        }>
        <PageHeader
          title="Cashback"
          detail={wide ? 'Choose where your cashback goes and see what is on the way.' : undefined}
          belowNavigationHeader
          width={wide ? 'page' : 'content'}
        />

        {wide ? (
          <PageWidth style={styles.widePage}>
            {profile && failure !== '' && <View style={styles.wideStatus}>{statusSection}</View>}
            {destinationSection ? (
              <SplitLayout asideWidth={440} aside={onTheWaySection || null}>
                {destinationSection}
              </SplitLayout>
            ) : (
              <View style={styles.wideStatus}>{statusSection}</View>
            )}
          </PageWidth>
        ) : (
          <>
            {!profile && <View style={styles.section}>{statusSection}</View>}
            {profile && failure !== '' && <View style={styles.section}>{statusSection}</View>}
            {destinationSection && (
              <View
                style={styles.section}
                onLayout={(event) => {
                  destinationY.current = event.nativeEvent.layout.y;
                }}>
                {destinationSection}
              </View>
            )}
            {onTheWaySection && <View style={styles.section}>{onTheWaySection}</View>}
          </>
        )}
      </Animated.ScrollView>
    </ThemedView>
  );
}

type OnTheWayRowProps = {
  item: OnTheWayItem;
  onShowDestination: () => void;
};

function OnTheWayRow({ item, onShowDestination }: OnTheWayRowProps) {
  const status = item.destination ? `${item.destination} · ${item.label}` : item.label;
  return (
    <ListRow
      label={money.ctx(item.amount, item.currency)}
      detail={status}
      onPress={item.heldBySavings ? onShowDestination : undefined}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.four,
  },
  wideContent: {
    paddingBottom: Spacing.six,
    gap: Spacing.five,
  },
  section: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  widePage: {
    gap: Spacing.four,
  },
  wideStatus: {
    maxWidth: 560,
  },
  note: {
    paddingHorizontal: Spacing.one,
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
