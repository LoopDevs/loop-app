import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CountryPicker } from '@/components/country-picker';
import { Button } from '@/components/form';
import { OrderRowsSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { loopLinks } from '@/constants/loop-links';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { type CountryChoice, Profile } from '@/ctx/profile';
import { useAppRefresh } from '@/hooks/use-app-refresh';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useProfile } from '@/hooks/use-profile';

export default function SettingsScreen() {
  const router = useRouter();
  const { busy, message, run } = useBusyAction();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { profile, setProfile, applyCountryChoice } = useProfile();
  const [changingCountry, setChangingCountry] = useState(false);
  const profileUserId = useRef<string | null>(null);

  const loadAccount = useCallback(
    () =>
      run(async () => {
        const isSignedIn = await ctx.isSignedIn();
        setSignedIn(isSignedIn);
        const userId = isSignedIn ? await ctx.userId() : null;
        if (userId !== profileUserId.current) {
          profileUserId.current = userId;
          setProfile(null);
        }
        if (userId) {
          setProfile(await ctx.me());
        }
      }),
    [run, setProfile],
  );

  useFocusEffect(
    useCallback(() => {
      loadAccount();
    }, [loadAccount]),
  );
  useAppRefresh(loadAccount);

  const chooseCountry = (choice: CountryChoice) =>
    run(async () => {
      await applyCountryChoice(choice);
      setChangingCountry(false);
    });

  const signOut = () =>
    run(async () => {
      await ctx.signOut();
      setSignedIn(false);
      setProfile(null);
      router.navigate('/');
    });

  const errorText = message !== '' && (
    <ThemedText type="small" selectable>
      {message}
    </ThemedText>
  );

  if (profile && changingCountry) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <CountryPicker
            profile={profile}
            busy={busy}
            onChoose={chooseCountry}
            onCancel={() => setChangingCountry(false)}
          />
          {errorText}
        </ScrollView>
      </ThemedView>
    );
  }

  const providerLabel = profile?.signInProviderLabel();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {signedIn === null && <OrderRowsSkeleton />}

        {signedIn && !profile && busy && <OrderRowsSkeleton />}
        {signedIn && !profile && !busy && <Button label="Retry" onPress={loadAccount} />}

        {profile && (
          <>
            <Section title="Account">
              {profile.email && <ThemedText>{profile.email}</ThemedText>}
              {providerLabel && (
                <ThemedText type="small" themeColor="textSecondary">
                  {providerLabel}
                </ThemedText>
              )}
            </Section>

            <Section title="Region">
              <Button
                label={
                  profile.country
                    ? `Country: ${Profile.countryFlag(profile.country)} ${profile.country}`
                    : 'Choose your country'
                }
                onPress={() => setChangingCountry(true)}
                disabled={busy}
              />
              {profile.stableCurrency && (
                <>
                  <ThemedText>
                    Cashback currency: {Profile.currencyLabel(profile.stableCurrency)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Contact support to change
                  </ThemedText>
                </>
              )}
            </Section>
          </>
        )}

        <Section title="Help and legal">
          <Button label="Contact support" onPress={() => Linking.openURL(loopLinks.supportMail())} />
          <Button label="Terms" onPress={() => openBrowserAsync(loopLinks.terms)} />
          <Button label="Privacy Policy" onPress={() => openBrowserAsync(loopLinks.privacy)} />
        </Section>

        {profile && (
          <>
            <Section title="Your data">
              <Button
                label="Request my data"
                onPress={() => Linking.openURL(loopLinks.supportMail('Data request'))}
              />
            </Section>

            <Button label="Sign out" onPress={signOut} disabled={busy} />
          </>
        )}

        {errorText}

        <ThemedText type="small" themeColor="textSecondary">
          Version {Constants.expoConfig?.version}
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
});
