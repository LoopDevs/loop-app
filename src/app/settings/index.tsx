import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppLockToggle } from '@/components/app-lock';
import { CountryPicker } from '@/components/country-picker';
import { Button, Notice } from '@/components/form';
import { useScrimScroll } from '@/components/home-panel';
import { ListGroup, ListRow } from '@/components/list-row';
import { PageHeader } from '@/components/page-header';
import { useOnSignIn, useSignIn } from '@/components/sign-in';
import { OrderRowsSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { loopLinks } from '@/constants/loop-links';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
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
  const { onScroll, scrim, backdrop } = useScrimScroll();

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
  useOnSignIn(loadAccount);
  const { openSignIn, check } = useSignIn();

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
      await check();
      router.navigate('/');
    });

  const confirmSignOut = () => {
    const prompt = 'You can sign back in any time with your email.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Sign out of Loop? ${prompt}`)) {
        signOut();
      }
      return;
    }
    Alert.alert('Sign out of Loop?', prompt, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const errorText = message !== '' && <Notice message={message} />;

  if (profile && changingCountry) {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style="light" />
        <Animated.View pointerEvents="none" style={backdrop} />
        <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.scroll}>
          <PageHeader title="Change country" />
          <View style={styles.body}>
            <CountryPicker
              profile={profile}
              busy={busy}
              onChoose={chooseCountry}
              onCancel={() => setChangingCountry(false)}
            />
            {errorText}
          </View>
        </Animated.ScrollView>
        <Animated.View pointerEvents="none" style={scrim} />
      </ThemedView>
    );
  }

  const providerLabel = profile?.signInProviderLabel();

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" />
      <Animated.View pointerEvents="none" style={backdrop} />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.scroll}>
        <PageHeader title="Settings" detail={profile?.email ?? undefined} />
        <View style={styles.body}>
          {signedIn === null && <OrderRowsSkeleton />}

          {signedIn && !profile && busy && <OrderRowsSkeleton />}
          {signedIn && !profile && !busy && message === '' && (
            <Notice message="Your account details didn't load." actionLabel="Try again" onAction={loadAccount} />
          )}
          {signedIn && !profile && !busy && message !== '' && (
            <Notice message={message} actionLabel="Try again" onAction={loadAccount} />
          )}

          {signedIn === false && (
            <View style={styles.signedOut}>
              <ThemedText type="heading">You&apos;re signed out</ThemedText>
              <Button label="Sign in" variant="primary" onPress={() => openSignIn()} />
            </View>
          )}

          {profile && (
            <>
              <ListGroup title="Account">
                <ListRow label="Email" value={profile.email ?? 'Not set'} />
                {providerLabel && <ListRow label={providerLabel} />}
              </ListGroup>

              <ListGroup
                title="Region"
                footer={profile.stableCurrency ? 'Contact support to change your cashback currency.' : undefined}>
                <ListRow
                  label="Country"
                  value={profile.country ?? 'Choose'}
                  onPress={() => setChangingCountry(true)}
                  disabled={busy}
                />
                {profile.stableCurrency && (
                  <ListRow label="Cashback currency" value={Profile.currencyLabel(profile.stableCurrency)} />
                )}
                <ListRow label="Cashback" detail="Where it goes and what's on the way" onPress={() => router.push('/orders/cashback')} />
              </ListGroup>
            </>
          )}

          <AppLockToggle />

          <ListGroup title="Help and legal">
            <ListRow
              label="Contact support"
              trailing="external"
              accessibilityRole="link"
              onPress={() => Linking.openURL(loopLinks.supportMail())}
            />
            <ListRow
              label="Terms"
              trailing="external"
              accessibilityRole="link"
              onPress={() => openBrowserAsync(loopLinks.terms)}
            />
            <ListRow
              label="Privacy Policy"
              trailing="external"
              accessibilityRole="link"
              onPress={() => openBrowserAsync(loopLinks.privacy)}
            />
          </ListGroup>

          {profile && (
            <>
              <ListGroup title="Your data" footer="Both open an email to Loop support.">
                <ListRow
                  label="Request my data"
                  trailing="external"
                  onPress={() => Linking.openURL(loopLinks.supportMail('Data request'))}
                />
                <ListRow
                  label="Delete my account"
                  tone="danger"
                  trailing="external"
                  onPress={() =>
                    Linking.openURL(
                      loopLinks.supportMail(
                        'Delete my account',
                        `Please delete my Loop account.\n\nAccount email: ${profile.email ?? ''}`,
                      ),
                    )
                  }
                />
              </ListGroup>

              <ListGroup>
                <ListRow
                  label={busy ? 'Signing out…' : 'Sign out'}
                  tone="danger"
                  trailing="none"
                  onPress={confirmSignOut}
                  disabled={busy}
                />
              </ListGroup>
            </>
          )}

          {profile && errorText}

          <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
            Version {Constants.expoConfig?.version}
          </ThemedText>
        </View>
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingBottom: BottomTabInset + Spacing.five,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  signedOut: {
    gap: Spacing.three,
  },
  version: {
    textAlign: 'center',
  },
});
