import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { BankWithdrawalForm } from '@/ctx/bank-withdrawal';
import { ctx, type BankWithdrawal } from '@/ctx/client';
import { Profile } from '@/ctx/profile';
import { WithdrawalPayment } from '@/ctx/withdrawal-payment';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { useBusyAction } from '@/hooks/use-busy-action';
import { haptics } from '@/native/haptics';
import type { SmartWallet } from '@/wallet/smart-wallet';

type RowProps = {
  withdrawal: BankWithdrawal;
  busy: boolean;
  onFinish: () => void;
};

export function BankWithdrawalRow({ withdrawal, busy, onFinish }: RowProps) {
  const now = useClock();
  const { lines, canFinish } = BankWithdrawalForm.status(withdrawal, now);
  return (
    <View style={styles.row}>
      <ThemedText type="smallBold">
        {withdrawal.amount} {Profile.currencyLabel(withdrawal.currency)} to {withdrawal.accountName}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {BankWithdrawalForm.shownSortCode(withdrawal.sortCode)} ••••{withdrawal.accountNumberLast4}
      </ThemedText>
      {lines.map((line) => (
        <ThemedText key={line} type="small">
          {line}
        </ThemedText>
      ))}
      {canFinish && <Button label="Finish" onPress={onFinish} disabled={busy} />}
    </View>
  );
}

export function LatestBankWithdrawal({ wallet }: { wallet: SmartWallet }) {
  const [withdrawal, setWithdrawal] = useState<BankWithdrawal | null>(null);
  const { busy, message, setMessage, run } = useBusyAction();

  const load = useCallback(async () => {
    try {
      setWithdrawal(await ctx.latestBankWithdrawal());
    } catch {
      return;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useAppRefresh(load);

  const finish = () =>
    run(async () => {
      if (!withdrawal) {
        return;
      }
      const task = WithdrawalPayment.send(wallet, withdrawal, withdrawal.amount);
      const outcome = task && (await task);
      if (!outcome) {
        return;
      }
      if (outcome.state.kind === 'confirming') {
        haptics.success();
        setMessage('Payment sent, waiting for confirmation');
      } else {
        haptics.error();
        setMessage(WithdrawalPayment.failureText(outcome.state));
      }
      await load();
    });

  if (!withdrawal) {
    return null;
  }
  return (
    <View style={styles.row}>
      <ThemedText type="small">Bank withdrawal</ThemedText>
      <BankWithdrawalRow withdrawal={withdrawal} busy={busy} onFinish={finish} />
      {message !== '' && (
        <ThemedText type="small" selectable>
          {message}
        </ThemedText>
      )}
    </View>
  );
}

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.one,
  },
});
