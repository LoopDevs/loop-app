import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { Profile } from '@/ctx/profile';
import { useBusyAction } from '@/hooks/use-busy-action';

type Props = {
  profile: Profile;
  onSaved: (profile: Profile) => void;
  onBack: () => void;
};

export function NameStep({ profile, onSaved, onBack }: Props) {
  const [name, setName] = useState(profile.name ?? '');
  const [showHint, setShowHint] = useState(false);
  const { busy, message, run } = useBusyAction();

  const changeName = (next: string) => {
    setName(next);
    setShowHint(false);
  };

  const save = () =>
    run(async () => {
      const update = Profile.nameUpdate(name);
      if (!update) {
        setShowHint(true);
        return;
      }
      onSaved(profile.withUser(await ctx.updateUser(update)));
    });

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Full name (as on your bank account)</ThemedText>
      <Field
        value={name}
        onChangeText={changeName}
        placeholder={Profile.fullNameHint}
        accessibilityLabel="Full name (as on your bank account)"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />
      {showHint && <ThemedText type="small">{Profile.fullNameHint}</ThemedText>}
      <Button label="Save name" onPress={save} disabled={busy || !name.trim()} />
      <Button label="Back" onPress={onBack} disabled={busy} />
      {message !== '' && (
        <ThemedText type="small" selectable>
          {message}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
});
