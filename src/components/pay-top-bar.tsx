import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

type PayTopBarProps = {
  title: string;
  onBack?: () => void;
  onClose: () => void;
};

export function PayTopBar({ title, onBack, onClose }: PayTopBarProps) {
  const theme = useTheme();
  const roundButton = [styles.roundButton, { backgroundColor: theme.backgroundElement }];
  return (
    <View style={styles.topBar}>
      <View style={styles.side}>
        {onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={onBack}
            style={roundButton}>
            <SymbolView
              name={{
                ios: 'chevron.left',
                android: 'arrow_back',
                web: 'arrow_back',
              }}
              size={18}
              tintColor={theme.text}
            />
          </Pressable>
        )}
      </View>
      <ThemedText type="smallBold" style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </ThemedText>
      <View style={[styles.side, styles.end]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          onPress={() => {
            haptics.tap();
            onClose();
          }}
          style={roundButton}>
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={16} tintColor={theme.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  side: {
    width: 44,
  },
  end: {
    alignItems: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  roundButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
