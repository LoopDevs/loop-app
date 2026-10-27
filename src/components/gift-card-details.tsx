import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { externalUrl, useOpenExternal } from '@/components/external-link';
import { Button, Notice } from '@/components/form';
import { PressScale } from '@/components/press-scale';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Collapsible } from '@/components/ui/collapsible';
import { Elevation, FontFamily, Fonts, Radius, Spacing } from '@/constants/theme';
import type { GiftCard } from '@/ctx/client';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useTheme } from '@/hooks/use-theme';
import { biometrics } from '@/native/biometrics';
import { haptics } from '@/native/haptics';
import { useBlockScreenCapture } from '@/native/screen-privacy';
import { AppLock } from '@/session/app-lock';

const clipboardLifetimeMs = 60_000;
const maskedSecret = '•'.repeat(12);
const copiedResetMs = 2000;

export function statusTone(status: GiftCard['status']): 'success' | 'danger' | 'accent' | 'textSecondary' {
  switch (status) {
    case 'fulfilled':
      return 'success';
    case 'rejected':
    case 'expired':
      return 'danger';
    case 'paid':
      return 'accent';
    default:
      return 'textSecondary';
  }
}

function useSecretReveal() {
  const toast = useToast();
  const { busy, run } = useBusyAction();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        setRevealed(false);
      }
    });
    return () => subscription.remove();
  }, []);

  const reveal = useCallback(async (): Promise<boolean> => {
    if (revealed) {
      return true;
    }
    let confirmed = false;
    await run(async () => {
      const result = await biometrics.confirmUser('Show gift card details');
      if (AppLock.unlocksWith(result)) {
        setRevealed(true);
        confirmed = true;
        return;
      }
      if (!AppLock.isCancel(result)) {
        haptics.error();
        toast(AppLock.notConfirmedMessage);
      }
    });
    return confirmed;
  }, [revealed, run, toast]);

  const hide = useCallback(() => setRevealed(false), []);

  return { revealed, reveal, hide, confirming: busy };
}

export function GiftCardDetails({ giftCard }: { giftCard: GiftCard }) {
  useBlockScreenCapture();
  const theme = useTheme();
  const secrets = useSecretReveal();
  const openExternal = useOpenExternal();
  const redeemUrl = giftCard.redeemUrl && externalUrl.isWeb(giftCard.redeemUrl) ? giftCard.redeemUrl : null;
  const hasCode = Boolean(
    giftCard.barcodeUrl || giftCard.number || giftCard.pin || giftCard.redeemUrlChallenge,
  );
  const openRedeemPage = async (url: string) => {
    if (process.env.EXPO_OS !== 'web' && !(await secrets.reveal())) {
      return;
    }
    openExternal(url);
  };
  const awaitingCode = giftCard.status === 'fulfilled' && !hasCode && !redeemUrl;
  return (
    <View style={styles.section}>
      {awaitingCode && (
        <Notice
          tone="neutral"
          message="Your card is bought, but its code hasn't come through yet. Check back in a few minutes, or get help below."
        />
      )}
      {hasCode && (
        <View
          style={[
            styles.panel,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            Elevation.card,
          ]}>
          {giftCard.barcodeUrl && secrets.revealed && (
            <View style={styles.barcodeFrame}>
              <Image
                source={{ uri: giftCard.barcodeUrl }}
                style={styles.barcode}
                contentFit="contain"
                cachePolicy="none"
                accessibilityLabel="Gift card barcode"
              />
            </View>
          )}
          {giftCard.number ? (
            <CopyableSecret label="Card number" value={giftCard.number} secrets={secrets} />
          ) : null}
          {giftCard.pin ? <CopyableSecret label="PIN" value={giftCard.pin} secrets={secrets} /> : null}
          {giftCard.redeemUrlChallenge && (
            <CopyableSecret label="Code" value={giftCard.redeemUrlChallenge} secrets={secrets} />
          )}
          <Button
            label={secrets.revealed ? 'Hide details' : 'Show details'}
            disabled={secrets.confirming}
            onPress={secrets.revealed ? secrets.hide : () => void secrets.reveal()}
          />
        </View>
      )}
      {redeemUrl && (
        <Button
          label="Open redeem page"
          variant="primary"
          disabled={secrets.confirming}
          onPress={() => void openRedeemPage(redeemUrl)}
        />
      )}
      {giftCard.info?.instructions && (
        <Collapsible title="How to use">
          <ThemedText type="small">{giftCard.info.instructions}</ThemedText>
        </Collapsible>
      )}
      {giftCard.info?.terms && (
        <Collapsible title="Terms">
          <ThemedText type="small">{giftCard.info.terms}</ThemedText>
        </Collapsible>
      )}
    </View>
  );
}

type CopyableSecretProps = {
  label: string;
  value: string;
  secrets: ReturnType<typeof useSecretReveal>;
};

function CopyableSecret({ label, value, secrets }: CopyableSecretProps) {
  const toast = useToast();
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!(await secrets.reveal())) {
      return;
    }
    const copiedToClipboard = await Clipboard.setStringAsync(value, {
      android: { isSensitive: true },
      ios: { localOnly: true, expiresAt: new Date(Date.now() + clipboardLifetimeMs) },
    });
    if (!copiedToClipboard) {
      toast(`${label} not copied. Select it and copy it instead.`);
      return;
    }
    haptics.tap();
    setCopied(true);
    setTimeout(() => setCopied(false), copiedResetMs);
    toast(`${label} copied`);
  };

  return (
    <View style={styles.row}>
      <View style={styles.secret}>
        <Text style={[styles.secretLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
          {label}
        </Text>
        <Text
          selectable={secrets.revealed}
          accessibilityLabel={secrets.revealed ? undefined : `${label} hidden`}
          style={[styles.secretValue, { color: theme.text }]}
          maxFontSizeMultiplier={1.6}>
          {secrets.revealed ? value : maskedSecret}
        </Text>
      </View>
      <PressScale
        onPress={copy}
        accessibilityRole="button"
        accessibilityLabel={`Copy ${label}`}
        style={[styles.copy, { backgroundColor: theme.backgroundSubtle }]}>
        <SymbolView
          name={
            copied
              ? { ios: 'checkmark', android: 'check', web: 'check' }
              : { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }
          }
          size={20}
          tintColor={theme.text}
        />
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  barcodeFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.tile,
    padding: Spacing.three,
  },
  barcode: {
    width: '100%',
    height: 110,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  secret: {
    flex: 1,
    gap: Spacing.half,
  },
  secretLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  secretValue: {
    fontFamily: Fonts.mono,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: 1,
  },
  copy: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
