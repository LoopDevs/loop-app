import { Link, Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Notice } from '@/components/form';
import { PageHeader } from '@/components/page-header';
import { SiteFooter } from '@/components/site-footer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { MaxContentWidth, Spacing } from '@/constants/theme';
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

const draftMessage = "Draft. This page is placeholder text and hasn't been reviewed by a lawyer yet.";

export function ContentPage({ title, lead, updated, draft = false, sections }: ContentPageProps) {
  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <PageHeader title={title} detail={updated && `Last updated ${updated}`}>
          {draft && <Notice tone="neutral" message={draftMessage} />}
        </PageHeader>
        <View style={styles.body}>
          {lead && (
            <ThemedText themeColor="textSecondary" style={styles.lead}>
              {lead}
            </ThemedText>
          )}
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
        </View>
        <SiteFooter />
      </ScrollView>
    </ThemedView>
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
  return (
    <View style={styles.questions}>
      {block.questions.map((item) => (
        <Collapsible key={item.question} title={item.question}>
          <ThemedText type="small" themeColor="textSecondary">
            {item.answer}
          </ThemedText>
        </Collapsible>
      ))}
    </View>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  body: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.five,
  },
  lead: {
    fontSize: 18,
    lineHeight: 28,
    maxWidth: 680,
  },
  section: {
    gap: Spacing.three,
  },
  paragraph: {
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
