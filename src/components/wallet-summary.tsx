import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AddMoney } from '@/components/add-money';
import { Button } from '@/components/form';
import { ListGroup, ListRow } from '@/components/list-row';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Motion, Radius, Spacing } from '@/constants/theme';
import type { Account } from '@/ctx/account';
import { ctx } from '@/ctx/client';
import { useTheme } from '@/hooks/use-theme';
import { useWallet } from '@/hooks/use-wallet';
import { money } from '@/money';
import { offeredCurrencies } from '@/stellar/network';
import { units } from '@/stellar/units';

const dollars = 'XLM.USDC';

export function WalletSummary() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ add?: string }>();
  const { state, wallet, view, refresh } = useWallet();
  const [opened, setOpened] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const addRequested = params.add === '1';
  const adding = opened || addRequested;

  const closeAddMoney = () => {
    setOpened(false);
    if (addRequested) {
      router.setParams({ add: undefined });
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (state === 'ready') {
        ctx
          .account()
          .then(setAccount)
          .catch(() => undefined);
      }
    }, [state]),
  );

  if (state === 'signed-out' || state === 'failed') {
    return null;
  }

  if (state === 'setup') {
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText type="heading">Finish setting up Loop</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Set up Face ID or your fingerprint on Home to add money and cash out.
        </ThemedText>
        <Button label="Go to Home" variant="primary" onPress={() => router.navigate('/')} />
      </View>
    );
  }

  const balance = view ? money.token(view.holdings.inWallet(dollars), dollars) : null;
  const onTheWay = view?.stable ? view.holdings.onTheWayIn(view.stable) : null;
  const received = account?.payouts
    .filter((payout) => payout.status === 'complete' && offeredCurrencies.has(payout.currency))
    .reduce((sum, payout) => sum + units.parse(payout.netAmount()), 0n);

  return (
    <View style={styles.stack}>
      <View
        style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        accessible={balance !== null}
        accessibilityLabel={balance ? `Dollars, ${balance}` : undefined}>
        <ThemedText type="small" themeColor="textSecondary">
          Dollars
        </ThemedText>
        {balance === null ? (
          <Skeleton width={160} height={40} />
        ) : (
          <ThemedText type="title" style={styles.balance}>
            {balance}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          Ready to spend on gift cards
        </ThemedText>
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button
              label="Add money"
              variant="primary"
              onPress={() => (adding ? closeAddMoney() : setOpened(true))}
              disabled={!wallet}
            />
          </View>
          <View style={styles.action}>
            <Button label="Cash out to bank" onPress={() => router.push('/wallet/cash-out')} />
          </View>
        </View>
      </View>

      {adding && wallet && (
        <Animated.View entering={FadeInDown.duration(Motion.state)}>
          <AddMoney wallet={wallet} view={view} refresh={refresh} onClose={closeAddMoney} />
        </Animated.View>
      )}

      <ListGroup title="Cashback">
        <ListRow
          label="Cashback received"
          value={received === undefined ? '…' : money.token(received, dollars)}
          trailing="none"
        />
        {onTheWay !== null && onTheWay > 0n && view?.stable && (
          <ListRow
            label="On the way"
            value={money.ctx(units.format(onTheWay, units.decimals), view.stable)}
            trailing="none"
          />
        )}
        <ListRow label="Where your cashback goes" onPress={() => router.push('/wallet/cashback')} />
      </ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.four,
  },
  card: {
    padding: Spacing.four,
    gap: Spacing.two,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  balance: {
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  action: {
    flexGrow: 1,
    flexBasis: 140,
  },
});
