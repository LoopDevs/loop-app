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
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Brand, MaxContentWidth, Spacing } from '@/constants/theme';
import type { Account, OnTheWayItem } from '@/ctx/account';
import { ctx, type CashbackDestination } from '@/ctx/client';
import { Profile } from '@/ctx/profile';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { errorMessage, useBusyAction } from '@/hooks/use-busy-action';
import { useProfile } from '@/hooks/use-profile';
import { useSessionOwner } from '@/hooks/use-session-owner';
import { money } from '@/money';
import { Savings } from '@/wallet/savings';

const destinationCopy: Record<CashbackDestination, { label: string; detail: string }> = {
  account: { label: 'Account', detail: 'Cashback is paid to your wallet.' },
  savings: {
    label: 'Savings',
    detail: 'Cashback goes to savings and earns interest when savings is available. Otherwise it stays with Loop.',
  },
};

const savingsNote = `Loop savings holds ${Profile.currencyLabel(Savings.currency)}. Cashback in another currency stays with Loop; switch to Account to have it paid to your wallet.`;

const signInFailure = 'Sign in to see your cashback.';
const destinationFooter = 'Your choice applies to future cashback. Cashback already paid out stays where it is.';

export default function CashbackScreen() {
  const router = useRouter();
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const { onScroll, backdrop } = useScrimScroll();
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
    run(async () => {
      setProfile(profile.withUser(await ctx.updateUser(update)));
    });
  };

  const showDestination = () => scroll.current?.scrollTo({ y: destinationY.current, animated: true });

  const items = profile && account ? account.onTheWay(profile) : [];
  const destinations = profile ? profile.cashbackDestinations() : [];

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <Animated.View pointerEvents="none" style={backdrop} />
      <Animated.ScrollView
        ref={scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading && profile !== null} onRefresh={load} tintColor={Brand.onRoyal} />
        }>
        <PageHeader title="Cashback" belowNavigationHeader />

        {failure !== '' && (
          <View style={styles.section}>
            {failure === signInFailure ? (
              <Notice
                message={failure}
                tone="neutral"
                actionLabel="Sign in"
                onAction={() => openSignIn(signInFailure)}
              />
            ) : (
              <Notice message={failure} actionLabel="Retry" onAction={load} disabled={loading} />
            )}
          </View>
        )}

        {!profile && failure === '' && (
          <View style={styles.section}>
            <OrderRowsSkeleton />
          </View>
        )}

        {profile && (
          <View
            style={styles.section}
            onLayout={(event) => {
              destinationY.current = event.nativeEvent.layout.y;
            }}>
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
          </View>
        )}

        {profile && account && (
          <View style={styles.section}>
            <ListGroup title="On the way">
              {items.length === 0 ? (
                <ListRow label="Nothing on the way right now." />
              ) : (
                items.map((item) => <OnTheWayRow key={item.key} item={item} onShowDestination={showDestination} />)
              )}
            </ListGroup>
            <Pressable
              onPress={() => router.navigate('/orders')}
              accessibilityRole="link"
              style={[styles.note, styles.link]}>
              <ThemedText type="linkPrimary">Cashback still settling is shown on each order</ThemedText>
            </Pressable>
          </View>
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
  section: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  note: {
    paddingHorizontal: Spacing.one,
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
