import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { externalUrl, useOpenExternal } from '@/components/external-link';
import { RedeemBrowser } from '@/components/redeem-browser';
import { Button, Notice } from '@/components/ui/form';
import { PressScale } from '@/components/ui/press-scale';
import { ThemedText } from '@/components/ui/themed-text';
import { useToast } from '@/components/ui/toast';
import { Collapsible } from '@/components/ui/collapsible';
import { Elevation, FontFamily, Fonts, Motion, Radius, Spacing } from '@/constants/theme';
import type { GiftCard } from '@/ctx/client';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';
import { useBlockScreenCapture } from '@/native/screen-privacy';

const clipboardLifetimeMs = 60_000;
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

type GiftCardDetailsProps = {
  giftCard: GiftCard;
  onChange?: (giftCard: GiftCard) => void;
};

export function GiftCardDetails({ giftCard, onChange }: GiftCardDetailsProps) {
  useBlockScreenCapture();
  const theme = useTheme();
  const toast = useToast();
  const [browsing, setBrowsing] = useState(false);
  const openExternal = useOpenExternal();
  const redeemUrl = giftCard.redeemUrl && externalUrl.isWeb(giftCard.redeemUrl) ? giftCard.redeemUrl : null;
  const hasCode = Boolean(
    giftCard.barcodeUrl || giftCard.number || giftCard.pin || giftCard.redeemUrlChallenge,
  );
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
          {giftCard.barcodeUrl && (
            <View style={[styles.barcodeFrame, { backgroundColor: theme.backgroundElement }]}>
              <Image
                source={{ uri: giftCard.barcodeUrl }}
                style={styles.barcode}
                contentFit="contain"
                cachePolicy="none"
                accessibilityLabel="Gift card barcode"
              />
            </View>
          )}
          {giftCard.number ? <CopyableSecret label="Card number" value={giftCard.number} /> : null}
          {giftCard.pin ? <CopyableSecret label="PIN" value={giftCard.pin} /> : null}
          {giftCard.redeemUrlChallenge && <CopyableSecret label="Code" value={giftCard.redeemUrlChallenge} />}
        </View>
      )}
      {redeemUrl && (
        <Button
          label="Open redeem page"
          variant={hasCode ? 'secondary' : 'primary'}
          onPress={() => (process.env.EXPO_OS === 'web' ? openExternal(redeemUrl) : setBrowsing(true))}
        />
      )}
      {browsing && redeemUrl && (
        <RedeemBrowser
          giftCard={giftCard}
          url={redeemUrl}
          onSaved={(saved) => {
            setBrowsing(false);
            onChange?.(saved);
            toast('Card details saved to your wallet');
          }}
          onClose={() => setBrowsing(false)}
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

function CopyableSecret({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
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
        <Text selectable style={[styles.secretValue, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
          {value}
        </Text>
      </View>
      <PressScale
        onPress={copy}
        accessibilityRole="button"
        accessibilityLabel={`Copy ${label}`}
        style={[styles.copy, { backgroundColor: copied ? theme.success : theme.backgroundSubtle }]}>
        <Animated.View
          key={copied ? 'copied' : 'copy'}
          entering={reduceMotion ? undefined : FadeIn.duration(Motion.feedback)}
          exiting={reduceMotion ? undefined : FadeOut.duration(Motion.feedback)}>
          <SymbolView
            name={
              copied
                ? { ios: 'checkmark', android: 'check', web: 'check' }
                : { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }
            }
            size={20}
            tintColor={copied ? theme.onAccent : theme.text}
          />
        </Animated.View>
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
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  barcodeFrame: {
    borderRadius: Radius.medium,
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
