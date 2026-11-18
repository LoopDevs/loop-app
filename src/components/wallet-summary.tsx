import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Notice } from '@/components/ui/form';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemedText } from '@/components/ui/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useWallet, type WalletState } from '@/hooks/use-wallet';
import { money } from '@/money';
import { offeredCurrencies } from '@/stellar/network';
import { units } from '@/stellar/units';

type WalletPrompt = { heading: string; body: string };

function walletPrompt(state: WalletState, problem: string): WalletPrompt | null {
  if (state === 'setup') {
    return {
      heading: 'Finish setting up Loop',
      body: 'Set up Face ID or your fingerprint on Home to cash out.',
    };
  }
  if (state === 'blocked') {
    return { heading: 'Your balance', body: problem };
  }
  return null;
}

export function WalletSummary() {
  const router = useRouter();
  const theme = useTheme();
  const { state, view, problem, reload } = useWallet();

  if (state === 'signed-out') {
    return null;
  }
  if (state === 'failed') {
    return <Notice message={problem || "We couldn't load your balance."} actionLabel="Try again" onAction={reload} />;
  }

  const prompt = walletPrompt(state, problem);
  if (prompt) {
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText type="heading">{prompt.heading}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {prompt.body}
        </ThemedText>
        <Button label="Go to Home" variant="primary" onPress={() => router.navigate('/')} />
      </View>
    );
  }

  const stable = view?.stable ?? null;
  const inStable = (amount: bigint) => (stable ? money.ctx(units.format(amount, units.decimals), stable) : null);
  const inWallet = view && stable ? view.holdings.inWalletIn(stable) : null;
  const balance = inWallet === null ? null : inStable(inWallet);
  const balanceName = stable ? money.name(stable) : 'Balance';
  const onTheWay = view?.stable ? view.holdings.onTheWayIn(view.stable) : null;
  const received =
    view?.account && stable ? view.holdings.sumIn(view.account.receivedCashbackByCurrency(offeredCurrencies), stable) : null;
  const receivedText = received === null ? null : inStable(received);

  return (
    <View style={styles.stack}>
      <View
        style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        accessible={balance !== null}
        accessibilityLabel={balance ? `${balanceName}, ${balance}` : undefined}>
        <ThemedText type="small" themeColor="textSecondary">
          {balanceName}
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
        <Button label="Cash out to bank" onPress={() => router.push('/wallet/cash-out')} />
      </View>

      <ListGroup title="Cashback">
        <ListRow
          label="Cashback received"
          value={receivedText ?? '…'}
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
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
  },
  balance: {
    fontVariant: ['tabular-nums'],
  },
});
