import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { BulletList, SiteSection, SitePage } from '@/components/content-page';
import { Button } from '@/components/ui/form';
import { ThemedText } from '@/components/ui/themed-text';
import { loopLinks } from '@/constants/loop-links';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const details = [
  'The email address on your Loop account.',
  'The brand and amount of the gift card, and roughly when you bought it.',
  'What happened, and what you expected to happen.',
  'A screenshot, if something looks wrong in the app.',
];

const safetyMessage =
  "We will never ask for your sign-in code, PIN or gift card codes by email, phone or message. If someone does, don't share them and let us know.";

export default function SupportScreen() {
  return (
    <SitePage
      title="Support"
      lead="Need a hand? A real person reads every message, and we aim to reply within one working day."
      width="page"
      intro={<ContactActions />}>
      <SiteSection title="Help us help you faster" intro="Include as much of this as you can.">
        <BulletList items={details} />
      </SiteSection>
      <SiteSection title="Before you write" intro="Most questions already have an answer.">
        <ThemedText style={styles.paragraph}>
          The{' '}
          <Link href="/faq">
            <ThemedText type="linkPrimary">FAQ</ThemedText>
          </Link>{' '}
          answers the most common questions about delivery, cashback, refunds and closing your account.
        </ThemedText>
        <SafetyNote />
      </SiteSection>
    </SitePage>
  );
}

function ContactActions() {
  return (
    <View style={styles.contact}>
      <View style={styles.contactButton}>
        <Button
          label="Email support"
          variant="primary"
          onPress={() => Linking.openURL(loopLinks.supportMail())}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        or write to{' '}
        <Link href={`mailto:${loopLinks.supportEmail}`}>
          <ThemedText type="smallBold" themeColor="accent">
            {loopLinks.supportEmail}
          </ThemedText>
        </Link>
      </ThemedText>
    </View>
  );
}

function SafetyNote() {
  const theme = useTheme();
  return (
    <View style={[styles.note, { backgroundColor: theme.accentSoft }]}>
      <SymbolView
        name={{ ios: 'lock.shield', android: 'verified_user', web: 'verified_user' }}
        size={22}
        tintColor={theme.accent}
      />
      <ThemedText style={styles.noteText}>{safetyMessage}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  contact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.two,
  },
  contactButton: {
    minWidth: 200,
  },
  paragraph: {
    maxWidth: 680,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    maxWidth: 680,
  },
  noteText: {
    flex: 1,
  },
});
