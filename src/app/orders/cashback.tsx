import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/form';
import { OrderRowsSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import type { Account, OnTheWayItem } from '@/ctx/account';
import { ctx, type CashbackDestination } from '@/ctx/client';
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

const savingsNote = `Loop savings holds ${Savings.currency}. Cashback in another currency stays with Loop; switch to Account to have it paid to your wallet.`;

export default function CashbackScreen() {
  const router = useRouter();
  const scroll = useRef<ScrollViewInstance>(null);
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
        setFailure('Sign in to see your cashback.');
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

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading && profile !== null} onRefresh={load} />}>
        {failure !== '' && (
          <>
            <ThemedText type="small">{failure}</ThemedText>
            <Button label="Retry" onPress={load} disabled={loading} />
          </>
        )}

        {!profile && failure === '' && <OrderRowsSkeleton />}

        {profile && (
          <View
            style={styles.section}
            onLayout={(event) => {
              destinationY.current = event.nativeEvent.layout.y;
            }}>
            <ThemedText type="smallBold">Where cashback goes</ThemedText>
            {profile.cashbackDestinations().length === 1 ? (
              <ThemedText type="small">
                {destinationCopy.account.label}: {destinationCopy.account.detail}
              </ThemedText>
            ) : (
              profile.cashbackDestinations().map((destination) => (
                <View key={destination} style={styles.option}>
                  <Button
                    label={destinationCopy[destination].label}
                    selected={profile.cashbackDestination === destination}
                    disabled={busy || loading}
                    onPress={() => choose(destination)}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    {destinationCopy[destination].detail}
                  </ThemedText>
                  {destination === 'savings' && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {savingsNote}
                    </ThemedText>
                  )}
                </View>
              ))
            )}
            <ThemedText type="small" themeColor="textSecondary">
              Your choice applies to future cashback. Cashback already paid out stays where it is.
            </ThemedText>
            {message !== '' && (
              <ThemedText type="small" selectable>
                {message}
              </ThemedText>
            )}
          </View>
        )}

        {profile && account && (
          <View style={styles.section}>
            <ThemedText type="smallBold">On the way</ThemedText>
            {items.length === 0 ? (
              <ThemedText type="small">Nothing on the way right now.</ThemedText>
            ) : (
              items.map((item) => <OnTheWayRow key={item.key} item={item} onShowDestination={showDestination} />)
            )}
            <Pressable onPress={() => router.navigate('/orders')}>
              <ThemedText type="link">Cashback still settling is shown on each order</ThemedText>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

type OnTheWayRowProps = {
  item: OnTheWayItem;
  onShowDestination: () => void;
};

function OnTheWayRow({ item, onShowDestination }: OnTheWayRowProps) {
  const status = item.destination ? `${item.destination} · ${item.label}` : item.label;
  const row = (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedText type="smallBold">{money.ctx(item.amount, item.currency)}</ThemedText>
      <ThemedText type="small">{status}</ThemedText>
    </ThemedView>
  );
  return item.heldBySavings ? <Pressable onPress={onShowDestination}>{row}</Pressable> : row;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  option: {
    gap: Spacing.one,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
});
