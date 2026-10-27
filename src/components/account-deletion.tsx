import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';

import { Button, Notice } from '@/components/form';
import { ListGroup, ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { loopLinks } from '@/constants/loop-links';
import { Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import type { Profile } from '@/ctx/profile';
import { useBusyAction } from '@/hooks/use-busy-action';
import { LocalAccountData } from '@/session/local-account-data';
import { deviceSigner } from '@/wallet/device-signer';

const consequences = [
  'Loop support closes your account and replies to confirm.',
  'Spend your Loop balance and let open orders finish first. Once the account is closed you can’t use your balance in Loop.',
  'Save any gift card codes you still need. You won’t see them in Loop afterwards.',
  'Loop signs you out and forgets your favourites and spending access on this device.',
];

type AccountDeletionProps = {
  profile: Profile;
  onCancel: () => void;
  onDeleted: () => Promise<void>;
};

export function AccountDeletion({ profile, onCancel, onDeleted }: AccountDeletionProps) {
  const { busy, message, setMessage, run } = useBusyAction();
  const toast = useToast();

  const requestDeletion = () =>
    run(async () => {
      const opened = await Linking.openURL(profile.deletionRequestMail()).then(
        () => true,
        () => false,
      );
      if (!opened) {
        setMessage(
          `Couldn't open your email app. Email ${loopLinks.supportEmail} with your account id ${profile.id}.`,
        );
        return;
      }
      const userId = await ctx.userId();
      await new LocalAccountData(
        { storage: AsyncStorage, removeDeviceKey: (id) => deviceSigner.remove(id) },
        userId,
      ).forget();
      toast('Send the email to finish deleting your account.');
      await onDeleted();
    });

  return (
    <View style={styles.sheet}>
      <ThemedText type="subtitle">Delete your account</ThemedText>
      {consequences.map((line) => (
        <ThemedText key={line} themeColor="textSecondary">
          {line}
        </ThemedText>
      ))}
      <ListGroup footer={`Opens an email to ${loopLinks.supportEmail} with your account id.`}>
        <ListRow
          label={busy ? 'Deleting…' : 'Email my deletion request'}
          tone="danger"
          trailing="external"
          onPress={requestDeletion}
          disabled={busy}
        />
      </ListGroup>
      <Button label="Keep my account" variant="quiet" onPress={onCancel} disabled={busy} />
      {message !== '' && <Notice message={message} />}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: Spacing.three,
  },
});
