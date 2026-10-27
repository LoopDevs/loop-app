import { Link, Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Notice } from '@/components/form';
import { SiteFooter } from '@/components/site-footer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { FontFamily, Layout, MaxContentWidth, Radius, ScrollEndInset, Spacing } from '@/constants/theme';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';

export type ContentQuestion = {
  question: string;
  answer: string;
};

export type ContentBlock =
  | string
  | { list: readonly string[] }
  | { email: string }
  | { questions: readonly ContentQuestion[] };

export type ContentSection = {
  heading: string;
  blocks: readonly ContentBlock[];
};

type ContentPageProps = {
  title: string;
  lead?: string;
  updated?: string;
  draft?: boolean;
  sections: readonly ContentSection[];
};

type SitePageProps = {
  title: string;
  lead?: string;
  detail?: string;
  width?: 'content' | 'page';
  intro?: ReactNode;
  children: ReactNode;
};

const draftMessage = "Draft. This page is placeholder text and hasn't been reviewed by a lawyer yet.";

export function ContentPage({ title, lead, updated, draft = false, sections }: ContentPageProps) {
  return (
    <SitePage
      title={title}
      lead={lead}
      detail={updated && `Last updated ${updated}`}
      intro={draft && <Notice tone="neutral" message={draftMessage} />}>
      {sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <ThemedText type="heading" accessibilityRole="header">
            {section.heading}
          </ThemedText>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </View>
      ))}
    </SitePage>
  );
}

export function SitePage({ title, lead, detail, width = 'content', intro, children }: SitePageProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { wide, gutter } = usePageLayout();
  const frame = [
    styles.frame,
    { maxWidth: width === 'page' ? Layout.pageMaxWidth : MaxContentWidth, paddingHorizontal: gutter },
  ];
  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View
          style={[
            styles.hero,
            wide && styles.heroWide,
            { paddingTop: insets.top + (wide ? Spacing.six : Spacing.four), borderBottomColor: theme.border },
          ]}>
          <View style={[frame, styles.heroInner]}>
            <Text
              style={[styles.title, wide && styles.titleWide, { color: theme.text }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.4}>
              {title}
            </Text>
            {lead ? (
              <Text style={[styles.lead, wide && styles.leadWide, { color: theme.textSecondary }]}>{lead}</Text>
            ) : null}
            {detail ? (
              <ThemedText type="small" themeColor="textSecondary">
                {detail}
              </ThemedText>
            ) : null}
            {intro}
          </View>
        </View>
        <View style={[frame, styles.body, wide && styles.bodyWide]}>{children}</View>
        <SiteFooter />
      </ScrollView>
    </ThemedView>
  );
}

export function SiteSection({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const { wide } = usePageLayout();
  return (
    <View style={[styles.siteSection, wide && styles.siteSectionWide]}>
      <View style={[styles.siteSectionHeading, wide && styles.siteSectionHeadingWide]}>
        <ThemedText type="heading" accessibilityRole="header">
          {title}
        </ThemedText>
        {intro ? (
          <ThemedText type="small" themeColor="textSecondary">
            {intro}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.siteSectionBody}>{children}</View>
    </View>
  );
}

type SupportPanelProps = {
  title: string;
  line: string;
  actionLabel: string;
  onAction: () => void;
};

export function SupportPanel({ title, line, actionLabel, onAction }: SupportPanelProps) {
  const theme = useTheme();
  const { wide } = usePageLayout();
  return (
    <View style={[styles.panel, wide && styles.panelWide, { backgroundColor: theme.inverse }]}>
      <View style={styles.panelText}>
        <Text style={[styles.panelTitle, { color: theme.onInverse }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[styles.panelLine, { color: theme.onInverseMuted }]}>{line}</Text>
      </View>
      <View style={wide ? styles.panelActionWide : null}>
        <Button label={actionLabel} variant="primary" onPress={onAction} />
      </View>
    </View>
  );
}

export function QuestionList({ questions }: { questions: readonly ContentQuestion[] }) {
  return (
    <View style={styles.questions}>
      {questions.map((item) => (
        <Collapsible key={item.question} title={item.question}>
          <ThemedText themeColor="textSecondary" style={styles.answer}>
            {item.answer}
          </ThemedText>
        </Collapsible>
      ))}
    </View>
  );
}

export function BulletList({ items }: { items: readonly string[] }) {
  const theme = useTheme();
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item} style={styles.listItem}>
          <View style={[styles.bullet, { backgroundColor: theme.textSecondary }]} />
          <ThemedText style={styles.listText}>{item}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function Block({ block }: { block: ContentBlock }) {
  if (typeof block === 'string') {
    return <ThemedText style={styles.paragraph}>{block}</ThemedText>;
  }
  if ('list' in block) {
    return <BulletList items={block.list} />;
  }
  if ('email' in block) {
    return (
      <Link href={`mailto:${block.email}`}>
        <ThemedText type="linkPrimary">{block.email}</ThemedText>
      </Link>
    );
  }
  return <QuestionList questions={block.questions} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: ScrollEndInset,
  },
  frame: {
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    paddingBottom: Spacing.four,
  },
  heroWide: {
    paddingBottom: Spacing.five,
    borderBottomWidth: 1,
  },
  heroInner: {
    gap: Spacing.three,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  titleWide: {
    fontSize: 48,
    lineHeight: 54,
    letterSpacing: -1.4,
    maxWidth: 820,
  },
  lead: {
    fontFamily: FontFamily.regular,
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 640,
  },
  leadWide: {
    fontSize: 20,
    lineHeight: 30,
  },
  body: {
    paddingTop: Spacing.two,
    gap: Spacing.five,
  },
  bodyWide: {
    paddingTop: Spacing.five,
    paddingBottom: Spacing.five,
    gap: Spacing.six,
  },
  section: {
    gap: Spacing.three,
  },
  siteSection: {
    gap: Spacing.three,
  },
  siteSectionWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.six,
  },
  siteSectionHeading: {
    gap: Spacing.two,
  },
  siteSectionHeadingWide: {
    width: 300,
    flexShrink: 0,
  },
  siteSectionBody: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.three,
  },
  panel: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  panelWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.five,
  },
  panelText: {
    flexShrink: 1,
    gap: Spacing.two,
  },
  panelTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  panelLine: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 520,
  },
  panelActionWide: {
    minWidth: 220,
  },
  paragraph: {
    maxWidth: 680,
  },
  answer: {
    maxWidth: 680,
  },
  list: {
    gap: Spacing.two,
    maxWidth: 680,
  },
  listItem: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingLeft: Spacing.one,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 10,
  },
  listText: {
    flex: 1,
  },
  questions: {
    gap: Spacing.two,
  },
});
