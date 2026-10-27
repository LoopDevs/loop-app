import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Notice } from '@/components/form';
import { ListGroup, ListRow } from '@/components/list-row';
import { ThemedText } from '@/components/themed-text';
import { loopLinks } from '@/constants/loop-links';
import { Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import type { Profile } from '@/ctx/profile';
import { useBusyAction } from '@/hooks/use-busy-action';
import { FavouriteIds } from '@/session/favourite-ids';

const consequences = [
  'Loop support closes your account and replies to confirm.',
  'Spend your Loop balance and let open orders finish first. Once the account is closed you can’t use your balance in Loop.',
  'Save any gift card codes you still need. You won’t see them in Loop afterwards.',
  'Once you’ve sent the email you can sign out here. Loop forgets your favourites on this device. Until support closes the account you can sign back in and spend your balance.',
];

type AccountDeletionProps = {
  profile: Profile;
  onCancel: () => void;
  onDeleted: () => Promise<void>;
};

export function AccountDeletion({ profile, onCancel, onDeleted }: AccountDeletionProps) {
  const { busy, message, setMessage, run } = useBusyAction();
  const [mailOpened, setMailOpened] = useState(false);

  const requestDeletion = () =>
    run(async () => {
      await Linking.openURL(profile.deletionRequestMail()).then(
        () => setMailOpened(true),
        () =>
          setMessage(
            `Couldn't open your email app. Email ${loopLinks.supportEmail} with your account id ${profile.id}.`,
          ),
      );
    });

  const signOutAfterRequest = () =>
    run(async () => {
      await AsyncStorage.removeItem(FavouriteIds.storageKey(await ctx.userId()));
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
      <ListGroup
        footer={`Opens an email to ${loopLinks.supportEmail}. If it doesn’t open, email us with your account id ${profile.id}.`}>
        <ListRow
          label="Email my deletion request"
          tone="danger"
          trailing="external"
          onPress={requestDeletion}
          disabled={busy}
        />
      </ListGroup>
      {mailOpened && (
        <Notice
          tone="neutral"
          message="Sent the email? Sign out of Loop on this device."
          actionLabel={busy ? 'Signing out…' : 'Sign me out'}
          onAction={signOutAfterRequest}
          disabled={busy}
        />
      )}
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
