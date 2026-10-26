import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/press-scale';
import { Brand, FontFamily, Radius, Spacing } from '@/constants/theme';
import { haptics } from '@/native/haptics';

type HomeActionsProps = {
  depositOpen: boolean;
  onAddMoney: () => void;
  onShop: () => void;
  onCashback: () => void;
  onWithdraw: () => void;
  withdrawDisabled: boolean;
};

export function HomeActions({
  depositOpen,
  onAddMoney,
  onShop,
  onCashback,
  onWithdraw,
  withdrawDisabled,
}: HomeActionsProps) {
  return (
    <View style={styles.row}>
      <Action
        label="Add money"
        icon={{ ios: 'plus', android: 'add', web: 'add' }}
        onPress={onAddMoney}
        selected={depositOpen}
      />
      <Action
        label="Gift cards"
        accessibilityLabel="Buy a gift card"
        icon={{ ios: 'bag', android: 'shopping_bag', web: 'shopping_bag' }}
        onPress={onShop}
      />
      <Action
        label="Cashback"
        icon={{ ios: 'arrow.uturn.backward', android: 'replay', web: 'replay' }}
        onPress={onCashback}
      />
      <Action
        label="Withdraw"
        accessibilityLabel="Withdraw savings"
        icon={{ ios: 'arrow.down.to.line', android: 'savings', web: 'savings' }}
        onPress={onWithdraw}
        disabled={withdrawDisabled}
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
      <View style={[styles.square, selected && styles.squareSelected]}>
        <SymbolView name={icon} size={24} tintColor={Brand.onRoyal} />
      </View>
      <Text style={styles.label} maxFontSizeMultiplier={1.3} numberOfLines={2}>
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
    opacity: 0.5,
  },
  square: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    backgroundColor: Brand.actionGround,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  squareSelected: {
    backgroundColor: Brand.actionGroundSelected,
    borderColor: Brand.onRoyal,
  },
  label: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
  },
});
