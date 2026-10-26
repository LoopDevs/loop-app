import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Collapsible } from '@/components/ui/collapsible';
import { Spacing } from '@/constants/theme';
import type { HoldingsView } from '@/hooks/use-holdings';
import { money } from '@/money';
import { units } from '@/stellar/units';
import { Savings } from '@/wallet/savings';

export function HoldingsSummary({ view }: { view: HoldingsView }) {
  const { holdings, stable, problem } = view;
  const approximate = (value: bigint | null) =>
    value === null || !stable ? null : `≈ ${money.ctx(units.format(value, units.decimals), stable)}`;
  const total = approximate(stable ? holdings.totalIn(stable) : null);
  const spendable = approximate(stable ? holdings.spendableIn(stable) : null);
  const onTheWay = approximate(stable ? holdings.onTheWayIn(stable) : null);

  return (
    <View style={styles.section}>
      {total && <ThemedText type="title">{total}</ThemedText>}
      <Figure title="Spendable" value={spendable}>
        {holdings.balances.tokens.map(({ token, amount }) => (
          <ThemedText key={token.currency} type="small">
            {token.symbol}: {money.token(amount, token.currency)}
          </ThemedText>
        ))}
        <ThemedText type="small">
          Savings: {money.token(holdings.savings(), Savings.currency)}
        </ThemedText>
      </Figure>
      {holdings.onTheWay ? (
        <Figure title="On the way" value={onTheWay}>
          {holdings.onTheWay.length === 0 && <ThemedText type="small">Nothing on the way</ThemedText>}
          {holdings.onTheWay.map(({ currency, amount }, index) => (
            <ThemedText key={`${currency}-${index}`} type="small">
              {money.ctx(units.format(amount, units.decimals), currency)}
            </ThemedText>
          ))}
        </Figure>
      ) : (
        <ThemedText type="small">On the way: unavailable</ThemedText>
      )}
      {problem !== '' && (
        <ThemedText type="small" selectable>
          {problem}
        </ThemedText>
      )}
    </View>
  );
}

function Figure({ title, value, children }: { title: string; value: string | null; children: ReactNode }) {
  if (value) {
    return <Collapsible title={`${title} ${value}`}>{children}</Collapsible>;
  }
  return (
    <View style={styles.breakdown}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
  breakdown: {
    gap: Spacing.one,
  },
});
