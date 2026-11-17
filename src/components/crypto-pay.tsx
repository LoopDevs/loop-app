import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { QrCode } from '@/components/qr-code';
import { Button, Notice } from '@/components/ui/form';
import { ThemedText } from '@/components/ui/themed-text';
import { useToast } from '@/components/ui/toast';
import { Spacing } from '@/constants/theme';
import type { GiftCard } from '@/ctx/client';
import { StellarPayLink } from '@/ctx/stellar-pay-link';
import { useNow } from '@/hooks/use-now';

const assetNames: Readonly<Record<string, string>> = {
  XLM: 'XLM',
  'XLM.USDC': 'USDC',
};

const tickMs = 1000;

function timeLeft(expiresAt: string | undefined, now: number): string | null {
  const expires = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (Number.isNaN(expires)) {
    return null;
  }
  const seconds = Math.max(0, Math.floor((expires - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function CryptoPay({ giftCard }: { giftCard: GiftCard }) {
  const toast = useToast();
  const now = useNow(tickMs);
  const [message, setMessage] = useState('');
  const link = StellarPayLink.of(giftCard);
  const amount = giftCard.paymentCryptoAmount;
  const asset = assetNames[giftCard.paymentCryptoCurrency ?? ''];
  if (!link || !amount || !asset) {
    return <Notice message="We couldn’t load the payment details for this order. Pull down to try again." />;
  }
  if (!link.uri && asset !== 'XLM') {
    return <Notice message="We couldn’t load the payment details for this order. Pull down to try again." />;
  }
  const left = timeLeft(giftCard.paymentUrlExpiration, now);
  if (left === '0:00') {
    return (
      <Notice message="The time to pay for this order has run out. Don’t send a payment for it. Go back to the shop to start a new order." />
    );
  }

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    toast(`${what} copied`);
  };

  const openWallet = async (uri: string) => {
    try {
      await Linking.openURL(uri);
    } catch {
      setMessage('No wallet app opened. Scan the code or copy the details into your wallet.');
    }
  };

  return (
    <View style={styles.stack}>
      <ThemedText type="heading">{`Send ${amount} ${asset}`}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Pay from any Stellar wallet. Send the exact amount{link.memo ? ' with the memo below' : ''}. Your gift card
        arrives here a few minutes after the payment.
      </ThemedText>
      <QrCode value={link.uri ?? link.destination} accessibilityLabel="Payment code for your wallet app" />
      {left && (
        <ThemedText type="smallBold" style={styles.centered} accessibilityLiveRegion="none">
          {`Pay within ${left}`}
        </ThemedText>
      )}
      {link.uri && <Button label="Open my wallet app" variant="primary" onPress={() => openWallet(link.uri ?? '')} />}
      <Detail label="Amount" value={`${amount} ${asset}`} onCopy={() => copy(amount, 'Amount')} />
      <Detail label="Address" value={link.destination} onCopy={() => copy(link.destination, 'Address')} />
      {link.memo && <Detail label="Memo" value={link.memo} onCopy={() => copy(link.memo ?? '', 'Memo')} />}
      {message !== '' && <Notice message={message} />}
    </View>
  );
}

function Detail({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <View style={styles.detail}>
      <View style={styles.detailText}>
        <ThemedText type="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="small" selectable>
          {value}
        </ThemedText>
      </View>
      <Button label="Copy" variant="quiet" onPress={onCopy} accessibilityLabel={`Copy ${label.toLowerCase()}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  detailText: {
    flex: 1,
    gap: Spacing.half,
  },
});
