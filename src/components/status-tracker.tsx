import { SymbolView } from 'expo-symbols';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TrackedStep = {
  label: string;
  detail: string;
};

type StatusTrackerProps = {
  steps: TrackedStep[];
  current: number;
};

export function StatusTracker({ steps, current }: StatusTrackerProps) {
  const theme = useTheme();
  return (
    <View accessibilityRole="list">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const reached = done || active;
        return (
          <Fragment key={step.label}>
            <View
              style={styles.step}
              accessible
              accessibilityLabel={`${step.label}, ${done ? 'done' : active ? 'now' : 'next'}. ${step.detail}`}>
              <View style={styles.markColumn}>
                <View
                  style={[
                    styles.mark,
                    reached
                      ? { backgroundColor: theme.accent, borderColor: theme.accent }
                      : { backgroundColor: theme.backgroundElement, borderColor: theme.borderStrong },
                  ]}>
                  {done && (
                    <SymbolView
                      name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                      size={14}
                      weight="bold"
                      tintColor={theme.onAccent}
                    />
                  )}
                  {active && <View style={[styles.dot, { backgroundColor: theme.onAccent }]} />}
                </View>
                {index < steps.length - 1 && (
                  <View style={[styles.line, { backgroundColor: done ? theme.accent : theme.border }]} />
                )}
              </View>
              <View style={styles.text}>
                <ThemedText type="smallBold" themeColor={reached ? 'text' : 'textSecondary'} style={styles.label}>
                  {step.label}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {step.detail}
                </ThemedText>
              </View>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  step: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  markColumn: {
    alignItems: 'center',
    width: 24,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
  },
  line: {
    flex: 1,
    width: 2,
    minHeight: 28,
    marginVertical: Spacing.one,
  },
  text: {
    flex: 1,
    paddingBottom: Spacing.four,
    gap: Spacing.half,
  },
  label: {
    fontSize: 16,
    lineHeight: 22,
  },
});
