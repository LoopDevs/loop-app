import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { AppLockScope } from '@/components/app-lock';
import { useToast } from '@/components/ui/toast';
import { FontFamily, Spacing } from '@/constants/theme';
import { ctx, type GiftCard } from '@/ctx/client';
import {
  pageLinesScript,
  parseCardDetails,
  readPageLines,
  readPageTouched,
  RedeemPage,
  typedFieldsScript,
} from '@/ctx/redeem-scrape';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';
import { errorReporting } from '@/ops/error-reporting';
import { RedeemCapture, type RedeemCaptureStage } from '@/ops/redeem-capture';
import { RedeemCaptureFolder } from '@/ops/redeem-capture-folder';
import { RedeemTiming } from '@/ops/redeem-timing';

const saveFailedMessage = "Couldn't save the card details. Copy them from the page instead.";
const maxSaveAttempts = 3;

type PageMessage = Pick<WebViewMessageEvent['nativeEvent'], 'url' | 'data'>;

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
  const failedSaves = useRef(0);
  const [progress, setProgress] = useState(0);
  const pageBack = useRef<(() => void) | null>(null);
  const canGoBack = useRef(false);
  const pageInject = useRef<((script: string) => void) | null>(null);
  const captures = useRef(0);
  const holdPage = (page: { goBack(): void; injectJavaScript(script: string): void } | null): void => {
    pageBack.current = page ? () => page.goBack() : null;
    pageInject.current = page ? (script) => page.injectJavaScript(script) : null;
  };
  const capture = (stage: RedeemCaptureStage) => {
    if (RedeemCapture.enabled) {
      pageInject.current?.(RedeemCapture.script(stage));
    }
  };
  const saveCapture = async (pageUrl: string, data: string): Promise<boolean> => {
    const captured = RedeemCapture.enabled ? RedeemCapture.read(data) : null;
    if (!captured) {
      return false;
    }
    const host = RedeemTiming.hostOf(pageUrl);
    captures.current += 1;
    try {
      await RedeemCaptureFolder.save(
        RedeemCapture.fileName(host, captured, captures.current),
        RedeemCapture.document(host, giftCard.merchantName, captured),
      );
      if (captured.stage === 'asked') {
        toast('Page saved');
      }
    } catch {
      toast("Couldn't save the page");
    }
    return true;
  };
  const goBackOrClose = () => {
    if (canGoBack.current) {
      pageBack.current?.();
      return;
    }
    onClose();
  };
  const awaitingCode = !giftCard.number && !giftCard.pin;
  const [page] = useState(() => new RedeemPage(url));
  const [timing] = useState(() => new RedeemTiming(url, giftCard.merchantName));
  const finishTiming = useCallback(
    (outcome: 'saved' | 'closed') => {
      const timings = timing.finish(outcome);
      if (timings) {
        errorReporting.reportTiming(RedeemTiming.reportName, timings);
      }
    },
    [timing],
  );
  useEffect(() => () => finishTiming('closed'), [finishTiming]);

  const heldMessage = useRef<PageMessage | null>(null);

  const readMessage = async (message: PageMessage) => {
    if (!awaitingCode || saving.current || failedSaves.current >= maxSaveAttempts) {
      return;
    }
    if (!page.trusts(message.url)) {
      heldMessage.current = message;
      return;
    }
    heldMessage.current = null;
    const details = parseCardDetails(readPageLines(message.data));
    if (!details) {
      return;
    }
    saving.current = true;
    timing.mark('read');
    capture('read');
    try {
      const saved = await ctx.saveGiftCardCode(giftCard.id, details.number, details.pin);
      haptics.success();
      finishTiming('saved');
      onSaved(saved);
    } catch (error) {
      const stored = await ctx.giftCard(giftCard.id).catch(() => null);
      if (stored && (stored.number || stored.pin)) {
        haptics.success();
        finishTiming('saved');
        onSaved(stored);
        return;
      }
      errorReporting.reportError(error, 'Gift card code save');
      failedSaves.current += 1;
      saving.current = false;
      if (failedSaves.current === 1) {
        toast(saveFailedMessage);
      }
    }
  };

  const onMessage = ({ nativeEvent }: WebViewMessageEvent) => {
    if (readPageTouched(nativeEvent.data)) {
      page.settle();
      return;
    }
    void saveCapture(nativeEvent.url, nativeEvent.data).then((captured) => {
      if (!captured) {
        void readMessage({ url: nativeEvent.url, data: nativeEvent.data });
      }
    });
  };

  const land = (landedUrl: string) => {
    page.land(landedUrl);
    const held = heldMessage.current;
    if (held && page.trusts(held.url)) {
      void readMessage(held);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={goBackOrClose} statusBarTranslucent>
      <AppLockScope>
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
          {RedeemCapture.enabled ? (
            <Pressable
              onPress={() => capture('asked')}
              hitSlop={12}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Save page">
              <SymbolView
                name={{ ios: 'square.and.arrow.down', android: 'download', web: 'download' }}
                size={20}
                tintColor={theme.text}
              />
            </Pressable>
          ) : (
            <View style={styles.close} />
          )}
        </View>
        <View style={[styles.track, { backgroundColor: theme.border }]}>
          {progress < 1 && <View style={[styles.bar, { backgroundColor: theme.accent, width: `${progress * 100}%` }]} />}
        </View>
        <WebView
          ref={holdPage}
          onNavigationStateChange={(state: WebViewNavigation): void => {
            canGoBack.current = state.canGoBack;
            land(state.url);
          }}
          source={{ uri: url }}
          style={[styles.web, { backgroundColor: theme.background }]}
          injectedJavaScript={pageLinesScript}
          injectedJavaScriptBeforeContentLoaded={typedFieldsScript}
          onTouchStart={() => page.settle()}
          onMessage={onMessage}
          onLoadEnd={({ nativeEvent }) => {
            timing.mark('loaded');
            capture('loaded');
            land(nativeEvent.url);
          }}
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
      </AppLockScope>
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
