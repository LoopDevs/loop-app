import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/form';
import { FontFamily } from '@/constants/theme';
import type { Merchant } from '@/ctx/merchant';
import { useTheme } from '@/hooks/use-theme';

export function AmountChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <View style={styles.chip}>
      <Button label={label} onPress={onPress} selected={selected} variant="secondary" />
    </View>
  );
}

export function AmountEntry({
  merchant,
  value,
  onChange,
}: {
  merchant: Merchant;
  value: string;
  onChange: (next: string) => void;
}) {
  const theme = useTheme();
  const wholeUnits = merchant.denominationType === 'min-max-major';
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={merchant.shortAmount('0')}
      accessibilityLabel={`Amount in ${merchant.currency}`}
      keyboardType={wholeUnits ? 'number-pad' : 'decimal-pad'}
      inputMode={wholeUnits ? 'numeric' : 'decimal'}
      placeholderTextColor={theme.textSecondary}
      selectionColor={theme.accent}
      style={[styles.amountEntry, { color: theme.text }]}
    />
  );
}

const styles = StyleSheet.create({
  amountEntry: {
    alignSelf: 'stretch',
    minHeight: 64,
    fontSize: 56,
    lineHeight: 64,
    letterSpacing: -1.5,
    fontFamily: FontFamily.bold,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
  chip: {
    minWidth: 72,
  },
});
