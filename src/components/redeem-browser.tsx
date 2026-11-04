import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useToast } from '@/components/ui/toast';
import { FontFamily, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import { pageLinesScript, parseCardDetails, readPageLines } from '@/ctx/redeem-scrape';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

const saveFailedMessage = "Couldn't save the card details. Copy them from the page instead.";

type RedeemBrowserProps = {
  giftCard: GiftCard;
  url: string;
  onSaved: (giftCard: GiftCard) => void;
  onClose: () => void;
};

export function RedeemBrowser({ giftCard, url, onSaved, onClose }: RedeemBrowserProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const saving = useRef(false);
  const [progress, setProgress] = useState(0);
  const awaitingCode = !giftCard.number && !giftCard.pin;

  const onMessage = async (event: WebViewMessageEvent) => {
    if (!awaitingCode || saving.current) {
      return;
    }
    const details = parseCardDetails(readPageLines(event.nativeEvent.data));
    if (!details) {
      return;
    }
    saving.current = true;
    try {
      const saved = await ctx.saveGiftCardCode(giftCard.id, details.number, details.pin);
      haptics.success();
      onSaved(saved);
    } catch {
      toast(saveFailedMessage);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.two, borderBottomColor: theme.border }]}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} tintColor={theme.text} />
          </Pressable>
          <View style={styles.titles}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {giftCard.merchantName}
            </Text>
            {awaitingCode && (
              <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                Your card details save to your wallet as soon as they appear
              </Text>
            )}
          </View>
          <View style={styles.close} />
        </View>
        <View style={[styles.track, { backgroundColor: theme.border }]}>
          {progress < 1 && <View style={[styles.bar, { backgroundColor: theme.accent, width: `${progress * 100}%` }]} />}
        </View>
        <WebView
          source={{ uri: url }}
          style={[styles.web, { backgroundColor: theme.background }]}
          injectedJavaScript={pageLinesScript}
          onMessage={onMessage}
          onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
          startInLoadingState
          renderLoading={() => (
            <View style={[StyleSheet.absoluteFill, styles.loading, { backgroundColor: theme.background }]}>
              <ActivityIndicator color={theme.textSecondary} />
            </View>
          )}
          setSupportMultipleWindows={false}
          domStorageEnabled
          sharedCookiesEnabled
          allowsBackForwardNavigationGestures
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
  },
  track: {
    height: 2,
  },
  bar: {
    height: 2,
  },
  web: {
    flex: 1,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
