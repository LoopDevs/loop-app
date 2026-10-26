import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { SiteSection, SitePage, SupportPanel } from '@/components/content-page';
import { ThemedText } from '@/components/themed-text';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';

type Step = {
  title: string;
  body: string;
};

type Outcome = Step & {
  icon: SymbolViewProps['name'];
};

const steps: readonly Step[] = [
  {
    title: 'Pick a brand',
    body: "Browse or search for a shop, restaurant or service. Each brand shows how much cashback you'll get, so you know before you buy.",
  },
  {
    title: 'Buy a gift card',
    body: 'Choose an amount and pay. Most gift cards arrive in the app within a few minutes, ready to use online or in store.',
  },
  {
    title: 'Get cashback',
    body: 'Your cashback is added to your Loop balance once your gift card is delivered. It shows in the app straight away.',
  },
  {
    title: 'Spend it or save it',
    body: 'Your cashback is your money. Use it, grow it or take it out, whenever you like.',
  },
];

const outcomes: readonly Outcome[] = [
  {
    icon: { ios: 'bag', android: 'shopping_bag', web: 'shopping_bag' },
    title: 'Spend',
    body: 'Put your balance towards your next gift card.',
  },
  {
    icon: { ios: 'leaf', android: 'savings', web: 'savings' },
    title: 'Save',
    body: 'Move it into Savings, where it can grow over time.',
  },
  {
    icon: { ios: 'building.columns', android: 'account_balance', web: 'account_balance' },
    title: 'Withdraw',
    body: 'Take it out to your bank account when you need it.',
  },
];

export default function HowItWorksScreen() {
  const router = useRouter();
  return (
    <SitePage
      title="How Loop works"
      lead="Buy a gift card, get money back, then spend it or save it."
      width="page">
      <Steps />
      <SiteSection title="Your cashback, your choice" intro="Cashback lands in your Loop balance. What happens next is up to you.">
        <Outcomes />
      </SiteSection>
      <SupportPanel
        title="Start earning cashback"
        line="Pick a brand you already shop with and see your cashback before you pay."
        actionLabel="Browse gift cards"
        onAction={() => router.navigate('/shop')}
      />
    </SitePage>
  );
}

function Steps() {
  const theme = useTheme();
  const { wide } = usePageLayout();
  return (
    <View style={[styles.steps, wide && styles.stepsWide]}>
      {steps.map((step, index) => (
        <View key={step.title} style={[styles.step, wide && styles.stepWide]}>
          <View style={[styles.marker, wide && styles.markerWide]}>
            <View style={[styles.number, { backgroundColor: theme.accent }]}>
              <Text style={[styles.numberText, { color: theme.onAccent }]}>{index + 1}</Text>
            </View>
            {index < steps.length - 1 && (
              <View style={[wide ? styles.trackWide : styles.track, { backgroundColor: theme.border }]} />
            )}
          </View>
          <View style={[styles.stepText, !wide && styles.stepTextNarrow]}>
            <ThemedText type="heading" accessibilityRole="header">
              {step.title}
            </ThemedText>
            <ThemedText themeColor="textSecondary">{step.body}</ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

function Outcomes() {
  const theme = useTheme();
  const { wide } = usePageLayout();
  return (
    <View style={[styles.outcomes, wide && styles.outcomesWide]}>
      {outcomes.map((outcome, index) => (
        <View
          key={outcome.title}
          style={[
            styles.outcome,
            wide && styles.outcomeWide,
            index > 0 && (wide ? styles.outcomeDividerWide : styles.outcomeDivider),
            index === 0 && wide && styles.outcomeFirstWide,
            { borderColor: theme.border },
          ]}>
          <View style={[styles.outcomeIcon, { backgroundColor: theme.accentSoft }]}>
            <SymbolView name={outcome.icon} size={22} tintColor={theme.accent} />
          </View>
          <View style={styles.outcomeText}>
            <ThemedText type="smallBold">{outcome.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {outcome.body}
            </ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

const numberSize = 40;

const styles = StyleSheet.create({
  steps: {
    gap: 0,
  },
  stepsWide: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  trackWide: {
    flex: 1,
    height: 2,
    marginLeft: Spacing.two,
    marginRight: Spacing.two - Spacing.five,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stepWide: {
    flex: 1,
    flexDirection: 'column',
    gap: Spacing.four,
  },
  marker: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  markerWide: {
    flexDirection: 'row',
  },
  number: {
    width: numberSize,
    height: numberSize,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
  },
  track: {
    flex: 1,
    width: 2,
    marginVertical: Spacing.two,
  },
  stepText: {
    flex: 1,
    gap: Spacing.two,
    maxWidth: 360,
  },
  stepTextNarrow: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  outcomes: {
    gap: 0,
  },
  outcomesWide: {
    flexDirection: 'row',
  },
  outcome: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  outcomeWide: {
    flex: 1,
    flexDirection: 'column',
    paddingVertical: 0,
    paddingHorizontal: Spacing.four,
  },
  outcomeFirstWide: {
    paddingLeft: 0,
  },
  outcomeDivider: {
    borderTopWidth: 1,
  },
  outcomeDividerWide: {
    borderLeftWidth: 1,
  },
  outcomeIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outcomeText: {
    flex: 1,
    gap: Spacing.one,
  },
});
