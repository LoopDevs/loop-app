import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/form';
import { StatusBarScrim, useScrimScroll } from '@/components/home-panel';
import { ListGroup } from '@/components/list-row';
import { PageHeader } from '@/components/page-header';
import { PressScale } from '@/components/press-scale';
import { useOnSignIn, useSignIn } from '@/components/sign-in';
import { SiteFooter } from '@/components/site-footer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { loopLinks } from '@/constants/loop-links';
import { Layout, MaxContentWidth, Radius, ScrollEndInset, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';

const bagIcon = { ios: 'bag', android: 'shopping_bag', web: 'shopping_bag' } as const;
const leafIcon = { ios: 'leaf', android: 'savings', web: 'savings' } as const;
const bankIcon = { ios: 'building.columns', android: 'account_balance', web: 'account_balance' } as const;
const personIcon = { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' } as const;
const helpIcon = { ios: 'questionmark.circle', android: 'help', web: 'help' } as const;
const privacyIcon = { ios: 'lock', android: 'lock', web: 'lock' } as const;
const signOutIcon = {
  ios: 'rectangle.portrait.and.arrow.right',
  android: 'logout',
  web: 'logout',
} as const;
const chevronIcon = { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' } as const;

export default function ProfileScreen() {
  const router = useRouter();
  const { gutter } = usePageLayout();
  const { signedIn, openSignIn, check } = useSignIn();
  const { scrollRef, onScroll, scrim } = useScrimScroll();
  const [email, setEmail] = useState<string | null>(null);

  const loadEmail = useCallback(async () => {
    if (!(await ctx.isSignedIn())) {
      setEmail(null);
      return;
    }
    try {
      const profile = await ctx.me();
      setEmail(profile.email ?? null);
    } catch {
      setEmail(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEmail();
    }, [loadEmail]),
  );
  useOnSignIn(loadEmail);

  const signOut = async () => {
    await ctx.signOut();
    setEmail(null);
    router.navigate('/');
    await check();
  };

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

  const helpRow = (
    <IconRow
      icon={helpIcon}
      label="Get help"
      onPress={() => Linking.openURL(loopLinks.supportMail())}
    />
  );
  const privacyRow = (
    <IconRow icon={privacyIcon} label="Privacy" onPress={() => openBrowserAsync(loopLinks.privacy)} />
  );

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scroll}>
        <PageHeader title="Profile" width="page" />
        <View style={[styles.page, { paddingHorizontal: gutter }]}>
          <View style={styles.body}>
            {signedIn === false ? (
              <>
                <SignedOutCard onSignIn={() => openSignIn('Sign in to see your profile.')} />
                <ListGroup>
                  {helpRow}
                  {privacyRow}
                </ListGroup>
              </>
            ) : (
              <>
                <AccountCard email={email} />
                <View style={styles.tileRow}>
                  <Tile
                    icon={bagIcon}
                    label="Gift cards"
                    detail="Your cards and codes"
                    onPress={() => router.navigate('/wallet')}
                  />
                  <Tile
                    icon={leafIcon}
                    label="Savings"
                    detail="Grow your cashback"
                    onPress={() => router.navigate('/savings')}
                  />
                </View>
                <WideCard
                  icon={bankIcon}
                  label="Cash out to your bank"
                  detail="Move dollars to a UK bank account"
                  onPress={() => router.push('/wallet/cash-out')}
                />
                <ListGroup>
                  <IconRow
                    icon={personIcon}
                    label="Account settings"
                    onPress={() => router.push('/profile/settings')}
                  />
                  {helpRow}
                  {privacyRow}
                  <IconRow icon={signOutIcon} label="Sign out" tone="danger" onPress={confirmSignOut} />
                </ListGroup>
              </>
            )}
          </View>
        </View>
        <SiteFooter />
      </Animated.ScrollView>
      <StatusBarScrim style={scrim} />
    </ThemedView>
  );
}

function AccountCard({ email }: { email: string | null }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, styles.accountCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
        <ThemedText type="title" themeColor="accent" style={styles.avatarLetter}>
          {email ? email.charAt(0).toUpperCase() : ''}
        </ThemedText>
      </View>
      <View style={styles.accountText}>
        {email ? (
          <ThemedText type="subtitle" numberOfLines={1} style={styles.email}>
            {email}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          Loop account
        </ThemedText>
      </View>
    </View>
  );
}

function SignedOutCard({ onSignIn }: { onSignIn: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, styles.signedOutCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="subtitle">Sign in to see your profile</ThemedText>
      <Button label="Sign in" variant="primary" onPress={onSignIn} />
    </View>
  );
}

type CardProps = {
  icon: SymbolViewProps['name'];
  label: string;
  detail: string;
  onPress: () => void;
};

function Tile({ icon, label, detail, onPress }: CardProps) {
  const theme = useTheme();
  return (
    <PressScale
      style={[styles.card, styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <SymbolView name={icon} size={30} tintColor={theme.text} />
      <View style={styles.tileText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
    </PressScale>
  );
}

function WideCard({ icon, label, detail, onPress }: CardProps) {
  const theme = useTheme();
  return (
    <PressScale
      style={[styles.card, styles.wideCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <View style={styles.accountText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <SymbolView name={icon} size={30} tintColor={theme.text} />
    </PressScale>
  );
}

type IconRowProps = {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  tone?: 'text' | 'danger';
};

function IconRow({ icon, label, onPress, tone = 'text' }: IconRowProps) {
  const theme = useTheme();
  const tint = tone === 'danger' ? theme.danger : theme.text;
  return (
    <PressScale
      style={styles.row}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      scale={0.99}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <SymbolView name={icon} size={22} tintColor={tint} />
      <ThemedText themeColor={tone} style={styles.rowLabel}>
        {label}
      </ThemedText>
      {tone === 'danger' ? null : <SymbolView name={chevronIcon} size={15} weight="semibold" tintColor={theme.textSecondary} />}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: ScrollEndInset,
  },
  page: {
    width: '100%',
    maxWidth: Layout.pageMaxWidth,
    alignSelf: 'center',
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.four,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  signedOutCard: {
    gap: Spacing.three,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 28,
    lineHeight: 34,
  },
  accountText: {
    flex: 1,
    gap: Spacing.half,
  },
  email: {
    fontSize: 20,
    lineHeight: 26,
  },
  tileRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  tile: {
    flex: 1,
    height: 140,
    justifyContent: 'space-between',
  },
  tileText: {
    gap: Spacing.half,
  },
  wideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  rowLabel: {
    flex: 1,
  },
});
