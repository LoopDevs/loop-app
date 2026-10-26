import { useRouter } from 'expo-router';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CountryMenu } from '@/components/country-menu';
import { SignInButton, useSignIn } from '@/components/sign-in';
import { SearchBar } from '@/components/storefront';
import { Wordmark } from '@/components/wordmark';
import { Brand, FontFamily, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { usePageLayout } from '@/hooks/use-page-layout';

export default function AppTabs() {
  const { wide } = usePageLayout();
  return (
    <Tabs style={styles.shell}>
      {wide ? null : <TabSlot style={styles.slot} />}
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" resetOnFocus asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="shop" href="/shop" resetOnFocus asChild>
            <TabButton>Shop</TabButton>
          </TabTrigger>
          <TabTrigger name="orders" href="/orders" resetOnFocus asChild>
            <TabButton>Orders</TabButton>
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" resetOnFocus asChild>
            <TabButton>Settings</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
      {wide ? <TabSlot style={styles.slot} /> : null}
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const { wide } = usePageLayout();
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.tabButton,
        !wide && styles.tabButtonNarrow,
        isFocused && styles.tabButtonFocused,
        !isFocused && pressed && styles.tabButtonPressed,
      ]}>
      <Text style={[styles.tabLabel, isFocused && styles.tabLabelFocused]}>{children}</Text>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const { wide, gutter } = usePageLayout();
  if (!wide) {
    return (
      <View {...props} style={styles.bottomBar}>
        {props.children}
      </View>
    );
  }
  return (
    <View {...props} style={styles.header}>
      <View style={[styles.headerInner, { paddingHorizontal: gutter }]}>
        <HomeLink />
        <View style={styles.nav}>{props.children}</View>
        <HeaderSearch />
        <AccountActions />
      </View>
    </View>
  );
}

function HomeLink() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.navigate('/')}
      accessibilityRole="link"
      accessibilityLabel="Loop home"
      style={styles.brand}>
      <Wordmark height={22} />
    </Pressable>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const submit = () => {
    const q = search.trim();
    router.navigate(q ? { pathname: '/shop', params: { q } } : '/shop');
  };
  return (
    <View style={styles.search}>
      <SearchBar value={search} onChangeText={setSearch} onSubmit={submit} />
    </View>
  );
}

function AccountActions() {
  const { signedIn } = useSignIn();
  if (signedIn !== false) {
    return null;
  }
  return (
    <View style={styles.actions}>
      <CountryMenu />
      <SignInButton />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  slot: {
    flex: 1,
  },
  header: {
    backgroundColor: Brand.navy,
    height: Layout.headerHeight,
    justifyContent: 'center',
    zIndex: 10,
  },
  headerInner: {
    width: '100%',
    maxWidth: Layout.pageMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  brand: {
    minHeight: 44,
    justifyContent: 'center',
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  search: {
    flex: 1,
    maxWidth: 420,
    marginLeft: 'auto',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: Brand.navy,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  tabButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    transitionProperty: 'background-color',
    transitionDuration: `${Motion.feedback}ms`,
  },
  tabButtonNarrow: {
    flex: 1,
    paddingHorizontal: Spacing.one,
  },
  tabButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabButtonFocused: {
    backgroundColor: Brand.royal,
  },
  tabLabel: {
    color: Brand.onRoyalMuted,
    fontFamily: FontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  tabLabelFocused: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.semibold,
  },
});
