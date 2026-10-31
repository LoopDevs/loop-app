import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/ui/press-scale';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

type HomeActionsProps = {
  onAddMoney: () => void;
  onShop: () => void;
  onSavings: () => void;
  onCashOut: () => void;
};

export function HomeActions({ onAddMoney, onShop, onSavings, onCashOut }: HomeActionsProps) {
  return (
    <View style={styles.row}>
      <Action
        label="Add money"
        icon={{ ios: 'plus', android: 'add', web: 'add' }}
        onPress={onAddMoney}
      />
      <Action
        label="Gift cards"
        accessibilityLabel="Buy a gift card"
        icon={{ ios: 'bag', android: 'shopping_bag', web: 'shopping_bag' }}
        onPress={onShop}
      />
      <Action
        label="Savings"
        icon={{ ios: 'leaf', android: 'savings', web: 'savings' }}
        onPress={onSavings}
      />
      <Action
        label="Cash out"
        accessibilityLabel="Cash out to your bank"
        icon={{ ios: 'building.columns', android: 'account_balance', web: 'account_balance' }}
        onPress={onCashOut}
      />
    </View>
  );
}

type ActionProps = {
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

function Action({ label, icon, onPress, selected = false, disabled = false, accessibilityLabel }: ActionProps) {
  const theme = useTheme();
  return (
    <PressScale
      style={[styles.action, disabled && styles.disabled]}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      disabled={disabled}
      scale={0.94}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, expanded: selected ? true : undefined }}>
      <View
        style={[
          styles.circle,
          selected
            ? { backgroundColor: theme.text, borderColor: theme.text }
            : { backgroundColor: theme.backgroundSubtle, borderColor: theme.border },
        ]}>
        <SymbolView name={icon} size={24} tintColor={selected ? theme.background : theme.text} />
      </View>
      <Text style={[styles.label, { color: theme.text }]} maxFontSizeMultiplier={1.3} numberOfLines={2}>
        {label}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
    maxWidth: 440,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
  },
  disabled: {
    opacity: 0.45,
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
});
