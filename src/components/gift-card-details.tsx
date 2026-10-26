import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { GiftCard } from '@/ctx/client';

const clipboardLifetimeMs = 60_000;

export function GiftCardDetails({ giftCard }: { giftCard: GiftCard }) {
  return (
    <View style={styles.section}>
      {giftCard.barcodeUrl && (
        <Image
          source={{ uri: giftCard.barcodeUrl }}
          style={styles.barcode}
          contentFit="contain"
          cachePolicy="none"
        />
      )}
      {giftCard.number && <CopyableSecret label="Number" value={giftCard.number} />}
      {giftCard.pin && <CopyableSecret label="PIN" value={giftCard.pin} />}
      {giftCard.redeemUrlChallenge && (
        <ThemedText type="code" selectable>
          Code: {giftCard.redeemUrlChallenge}
        </ThemedText>
      )}
      {giftCard.redeemUrl && (
        <Button
          label="Open redeem page"
          onPress={() => WebBrowser.openBrowserAsync(giftCard.redeemUrl as string)}
        />
      )}
      {giftCard.info?.instructions && (
        <>
          <ThemedText type="smallBold">How to use</ThemedText>
          <ThemedText type="small">{giftCard.info.instructions}</ThemedText>
        </>
      )}
      {giftCard.info?.terms && (
        <>
          <ThemedText type="smallBold">Terms</ThemedText>
          <ThemedText type="small">{giftCard.info.terms}</ThemedText>
        </>
      )}
    </View>
  );
}

function CopyableSecret({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(value, {
      android: { isSensitive: true },
      ios: { localOnly: true, expiresAt: new Date(Date.now() + clipboardLifetimeMs) },
    });
    setCopied(true);
  };

  return (
    <View style={styles.row}>
      <ThemedText type="code" selectable style={styles.secret}>
        {label}: {value}
      </ThemedText>
      <Button label={copied ? 'Copied' : 'Copy'} onPress={copy} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  secret: {
    flex: 1,
  },
  barcode: {
    width: '100%',
    height: 120,
    backgroundColor: 'white',
  },
});
