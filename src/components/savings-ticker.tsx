import { StyleSheet, View } from 'react-native';

import { Odometer } from '@/components/odometer';
import { FontFamily } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { money } from '@/money';
import type { PaymentCurrency } from '@/stellar/network';
import { units } from '@/stellar/units';
import type { SavingsRate } from '@/wallet/savings';

const tickMs = 100;
const penceDecimals = 2;
const subPenceDigits = 7;

const balanceType = {
  fontFamily: FontFamily.bold,
  fontSize: 40,
  lineHeight: 46,
  letterSpacing: -0.8,
};

const subPenceType = {
  fontFamily: FontFamily.medium,
  fontSize: 17,
  lineHeight: 22,
  letterSpacing: 0.4,
};

type SavingsTickerProps = {
  value: bigint;
  currency: PaymentCurrency;
  rate: SavingsRate;
};

function splitPence(amount: number): { pence: bigint; subPence: string } {
  const wholePence = Math.floor(amount * 10 ** penceDecimals);
  const remainder = amount * 10 ** penceDecimals - wholePence;
  const subPence = Math.min(Math.floor(remainder * 10 ** subPenceDigits), 10 ** subPenceDigits - 1);
  return { pence: BigInt(wholePence), subPence: String(subPence).padStart(subPenceDigits, '0') };
}

export function SavingsTicker({ value, currency, rate }: SavingsTickerProps) {
  const theme = useTheme();
  const now = useNow(tickMs);
  const { pence, subPence } = splitPence(rate.projected(value, now));
  const shown = money.token(pence * 10n ** BigInt(units.decimals - penceDecimals), currency);
  return (
    <View style={styles.row}>
      <View>
        <Odometer
          value={shown}
          tempo="live"
          style={{ ...balanceType, color: theme.text }}
          accessibilityLabel={`${shown} in savings, growing ${rate.figure()} a year`}
        />
      </View>
      <View
        style={styles.subPence}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Odometer value={subPence} tempo="live" style={{ ...subPenceType, color: theme.textSecondary }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  subPence: {
    paddingBottom: 6,
  },
});
