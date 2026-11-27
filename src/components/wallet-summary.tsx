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
import { Savings } from '@/wallet/savings';

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
  const total = view && stable ? view.holdings.totalIn(stable) : null;
  const balance = total === null ? null : inStable(total);
  const balanceName = Savings.takes(stable) ? 'Savings' : 'Balance';
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
          Spend it on gift cards or cash out
        </ThemedText>
        <Button label="Cash out to bank" onPress={() => router.push('/wallet/cash-out')} />
      </View>

      <ListGroup title="Cashback">
        <ListRow
          label="Cashback received"
          value={receivedText ?? '…'}
          trailing="none"
        />
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
