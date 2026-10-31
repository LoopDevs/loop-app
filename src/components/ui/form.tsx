import { SymbolView } from 'expo-symbols';
import { useId, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { PressScale } from '@/components/ui/press-scale';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

type FieldProps = React.ComponentProps<typeof TextInput> & {
  label?: string;
  disabled?: boolean;
};

export function Field({
  label,
  disabled = false,
  editable = true,
  style,
  onFocus,
  onBlur,
  ...props
}: FieldProps) {
  const theme = useTheme();
  const labelId = useId();
  const [focused, setFocused] = useState(false);
  const focusBorder = { borderColor: theme.text, borderWidth: 2 };
  const labelled = label ? ({ 'aria-labelledby': labelId } as object) : {};
  const input = (
    <TextInput
      accessibilityLabel={label ?? props.placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={theme.textSecondary}
      selectionColor={theme.accent}
      {...labelled}
      {...props}
      editable={editable && !disabled}
      accessibilityState={{ ...props.accessibilityState, disabled }}
      aria-disabled={disabled}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        styles.field,
        {
          color: theme.text,
          backgroundColor: theme.backgroundElement,
          borderColor: theme.borderStrong,
        },
        style,
        focused && focusBorder,
        disabled && styles.disabled,
      ]}
    />
  );
  if (!label) {
    return input;
  }
  return (
    <View style={styles.labelled}>
      <Text
        nativeID={labelId}
        accessible={false}
        importantForAccessibility="no"
        maxFontSizeMultiplier={1.6} style={[styles.fieldLabel, { color: theme.text }]}>
        {label}
      </Text>
      {input}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'quiet';

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
  selected,
  accessibilityLabel,
  variant = 'secondary',
}: ButtonProps) {
  const theme = useTheme();
  const webChoiceState =
    Platform.OS === 'web' && selected !== undefined ? ({ 'aria-pressed': selected } as object) : {};
  const press = () => {
    haptics.tap();
    onPress();
  };
  const surface = {
    primary: { backgroundColor: theme.accent, borderColor: theme.accent },
    secondary: {
      backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
      borderColor: selected ? theme.text : theme.borderStrong,
    },
    quiet: { backgroundColor: 'transparent', borderColor: 'transparent' },
  }[variant];
  const labelColor = {
    primary: theme.onAccent,
    secondary: theme.text,
    quiet: theme.accent,
  }[variant];
  return (
    <PressScale
      {...webChoiceState}
      onPress={press}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected }}
      aria-disabled={disabled}
      style={{ opacity: disabled ? 0.45 : 1 }}>
      <View style={[styles.button, surface, selected && styles.selected]}>
        <Text maxFontSizeMultiplier={1.6} style={[styles.label, { color: labelColor }]}>
          {label}
        </Text>
      </View>
    </PressScale>
  );
}

type NoticeProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  tone?: 'danger' | 'neutral';
};

export function Notice({ message, actionLabel, onAction, disabled = false, tone = 'danger' }: NoticeProps) {
  const theme = useTheme();
  const tint = tone === 'danger' ? theme.danger : theme.accent;
  return (
    <View
      style={[styles.notice, { backgroundColor: theme.backgroundSubtle, borderColor: theme.border }]}
      accessibilityLiveRegion="polite">
      <View style={styles.noticeRow}>
        <SymbolView
          name={
            tone === 'danger'
              ? { ios: 'exclamationmark.circle', android: 'error', web: 'error' }
              : { ios: 'info.circle', android: 'info', web: 'info' }
          }
          size={20}
          tintColor={tint}
        />
        <Text selectable maxFontSizeMultiplier={1.6} style={[styles.noticeText, { color: theme.text }]}>
          {message}
        </Text>
      </View>
      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} disabled={disabled} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  noticeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  noticeText: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    lineHeight: 20,
  },
  field: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    minHeight: 50,
    fontSize: 17,
    fontFamily: FontFamily.regular,
  },
  labelled: {
    gap: Spacing.one,
  },
  fieldLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  disabled: {
    opacity: 0.45,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
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
