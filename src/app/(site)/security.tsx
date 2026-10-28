import * as Linking from 'expo-linking';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { BulletList, SiteSection, SitePage } from '@/components/content-page';
import { Button } from '@/components/ui/form';
import { ThemedText } from '@/components/ui/themed-text';
import { loopLinks } from '@/constants/loop-links';
import { Radius, Spacing } from '@/constants/theme';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';

type Protection = {
  icon: SymbolViewProps['name'];
  title: string;
  body: string;
};

const protections: readonly Protection[] = [
  {
    icon: { ios: 'key', android: 'key', web: 'key' },
    title: 'No password to steal',
    body: 'Signing in uses a one-time code or your Apple or Google account. There is no password to steal or reuse.',
  },
  {
    icon: { ios: 'faceid', android: 'fingerprint', web: 'fingerprint' },
    title: 'You confirm every payment',
    body: "Payments need your confirmation on your own device, using your phone's face, fingerprint or screen lock.",
  },
  {
    icon: { ios: 'lock', android: 'lock', web: 'lock' },
    title: 'Lock the app',
    body: 'You can lock the app so it asks for your face, fingerprint or screen lock each time it opens.',
  },
  {
    icon: { ios: 'lock.shield', android: 'verified_user', web: 'verified_user' },
    title: 'Encrypted details',
    body: 'Your details travel over encrypted connections and are stored encrypted.',
  },
  {
    icon: { ios: 'eye', android: 'visibility', web: 'visibility' },
    title: 'Watching for unusual activity',
    body: 'We watch for unusual activity and may pause an account to protect it while we check.',
  },
];

const habits = [
  'Keep your phone up to date and protected with a screen lock.',
  'Never share your sign-in codes, PINs or gift card codes. Loop will never ask for them.',
  'If you lose your phone or think someone else has access to your account, contact support straight away.',
];

const reportSteps =
  "If you've found a security weakness in Loop, include steps to reproduce and any supporting details. We'll acknowledge your report within three working days and keep you updated.";

const reportEtiquette =
  'Please give us reasonable time to fix the issue before sharing it publicly, and avoid accessing other people’s data or disrupting the service while testing.';

export default function SecurityScreen() {
  return (
    <SitePage
      title="Security"
      lead="How we keep your account and your money safe, and what you can do too."
      width="page">
      <SiteSection title="How we protect your account" intro="Built in for every Loop account, with nothing to switch on.">
        <Protections />
      </SiteSection>
      <SiteSection title="What you can do" intro="A few habits that keep your account yours.">
        <BulletList items={habits} />
      </SiteSection>
      <SiteSection title="Report a security issue" intro="Tell us privately so we can fix it.">
        <ThemedText style={styles.paragraph}>{reportSteps}</ThemedText>
        <ThemedText style={styles.paragraph}>{reportEtiquette}</ThemedText>
        <View style={styles.report}>
          <Button
            label={`Email ${loopLinks.securityEmail}`}
            onPress={() => Linking.openURL(`mailto:${loopLinks.securityEmail}`)}
          />
        </View>
      </SiteSection>
    </SitePage>
  );
}

function Protections() {
  const theme = useTheme();
  const { wide } = usePageLayout();
  return (
    <View style={[styles.grid, wide && styles.gridWide]}>
      {protections.map((protection) => (
        <View
          key={protection.title}
          style={[styles.protection, wide && styles.protectionWide, { borderTopColor: theme.border }]}>
          <View style={[styles.icon, { backgroundColor: theme.accentSoft }]}>
            <SymbolView name={protection.icon} size={20} tintColor={theme.accent} />
          </View>
          <View style={styles.protectionText}>
            <ThemedText type="smallBold">{protection.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {protection.body}
            </ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 0,
  },
  gridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  protection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderTopWidth: 1,
  },
  protectionWide: {
    width: '47%',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  protectionText: {
    flex: 1,
    gap: Spacing.one,
  },
  paragraph: {
    maxWidth: 680,
  },
  report: {
    alignSelf: 'flex-start',
  },
});
