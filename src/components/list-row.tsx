import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

type ListGroupProps = {
  title?: string;
  footer?: string;
  children: ReactNode;
};

export function ListGroup({ title, footer, children }: ListGroupProps) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title && (
        <ThemedText type="smallBold" themeColor="textSecondary" accessibilityRole="header" style={styles.groupTitle}>
          {title}
        </ThemedText>
      )}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
            {row}
          </Fragment>
        ))}
      </View>
      {footer && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.groupTitle}>
          {footer}
        </ThemedText>
      )}
    </View>
  );
}

type Trailing = 'chevron' | 'external' | 'check' | 'none';

type ListRowProps = {
  label: string;
  detail?: string;
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  tone?: 'text' | 'danger' | 'accent';
  trailing?: Trailing;
  selected?: boolean;
  accessibilityRole?: 'button' | 'link' | 'radio';
  children?: ReactNode;
};

const trailingIcons: Record<Exclude<Trailing, 'none'>, SymbolViewProps['name']> = {
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  external: { ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
};

export function ListRow({
  label,
  detail,
  value,
  onPress,
  disabled = false,
  tone = 'text',
  trailing = onPress ? 'chevron' : 'none',
  selected,
  accessibilityRole = 'button',
  children,
}: ListRowProps) {
  const theme = useTheme();
  const content = (
    <>
      <View style={styles.text}>
        <ThemedText themeColor={tone}>{label}</ThemedText>
        {detail && (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        )}
      </View>
      {value && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.value}>
          {value}
        </ThemedText>
      )}
      {children}
      {trailing !== 'none' && (trailing !== 'check' || selected) && (
        <SymbolView
          name={trailingIcons[trailing]}
          size={trailing === 'check' ? 18 : 15}
          weight="semibold"
          tintColor={trailing === 'check' ? theme.accent : theme.textSecondary}
        />
      )}
    </>
  );
  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ disabled, checked: accessibilityRole === 'radio' ? Boolean(selected) : undefined }}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.backgroundSelected },
        disabled && styles.disabled,
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
  groupTitle: {
    paddingHorizontal: Spacing.one,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.control,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
  disabled: {
    opacity: 0.45,
  },
});
