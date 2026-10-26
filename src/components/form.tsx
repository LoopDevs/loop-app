import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PressScale } from '@/components/press-scale';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

export function Field(props: React.ComponentProps<typeof TextInput>) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      accessibilityLabel={props.placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={theme.textSecondary}
      selectionColor={theme.accent}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.field,
        {
          color: theme.text,
          backgroundColor: theme.backgroundElement,
          borderColor: focused ? theme.accent : theme.border,
        },
      ]}
      {...props}
    />
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
  variant?: ButtonVariant;
};

export function Button({
  label,
  onPress,
  disabled = false,
  selected = false,
  accessibilityLabel,
  variant = 'secondary',
}: ButtonProps) {
  const theme = useTheme();
  const press = () => {
    haptics.tap();
    onPress();
  };
  const surface = {
    primary: { backgroundColor: theme.accent, borderColor: theme.accent },
    secondary: {
      backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
      borderColor: selected ? theme.accent : theme.border,
    },
    quiet: { backgroundColor: 'transparent', borderColor: 'transparent' },
  }[variant];
  const labelColor = variant === 'primary' ? theme.onAccent : variant === 'quiet' ? theme.accent : theme.text;
  return (
    <PressScale
      onPress={press}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected }}
      style={{ opacity: disabled ? 0.45 : 1 }}>
      <View style={[styles.button, surface, selected && styles.selected]}>
        <Text maxFontSizeMultiplier={1.6} style={[styles.label, { color: labelColor }]}>
          {label}
        </Text>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.three,
    minHeight: 50,
    fontSize: 17,
    fontFamily: FontFamily.regular,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    borderWidth: 1,
  },
  selected: {
    borderWidth: 2,
  },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
});
