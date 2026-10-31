import { usePathname, useRouter } from 'expo-router';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CountryMenu } from '@/components/country-menu';
import { SignInButton, useSignIn } from '@/components/sign-in';
import { MerchantSearch } from '@/components/storefront';
import { Wordmark } from '@/components/wordmark';
import { FontFamily, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';
import { PageLayout } from '@/hooks/page-layout';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useMarket } from '@/hooks/use-market';
import { useTheme } from '@/hooks/use-theme';

type TabIcon = Exclude<SymbolViewProps['name'], string>;

const tabIcons = {
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  shop: { ios: 'bag.fill', android: 'shopping_bag', web: 'shopping_bag' },
  savings: { ios: 'leaf', android: 'savings', web: 'savings' },
  wallet: { ios: 'wallet.pass', android: 'account_balance_wallet', web: 'account_balance_wallet' },
  profile: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
} satisfies Record<string, TabIcon>;

export default function AppTabs() {
  const { wide } = usePageLayout();
  const hydrated = useHydrated();
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => {
    if (hydrated) {
      PageLayout.reveal();
    }
  }, [hydrated]);
  return (
    <Tabs style={styles.shell} options={{ backBehavior: 'fullHistory' }}>
      {wide ? null : <TabSlot style={styles.slot} />}
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" resetOnFocus asChild>
            <TabButton icon={tabIcons.home}>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="shop" href="/shop" resetOnFocus asChild>
            <TabButton icon={tabIcons.shop}>Shop</TabButton>
          </TabTrigger>
          <TabTrigger name="savings" href="/savings" resetOnFocus asChild>
            <TabButton icon={tabIcons.savings}>Savings</TabButton>
          </TabTrigger>
          <TabTrigger name="wallet" href="/wallet" resetOnFocus asChild>
            <TabButton icon={tabIcons.wallet}>Wallet</TabButton>
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" resetOnFocus asChild>
            <TabButton icon={tabIcons.profile}>Profile</TabButton>
          </TabTrigger>
          <TabTrigger name="site" href="/about" style={styles.hiddenTab} />
        </CustomTabList>
      </TabList>
      {wide ? <TabSlot style={styles.slot} /> : null}
    </Tabs>
  );
}

type TabButtonProps = Omit<TabTriggerSlotProps, 'ref'> & { icon: TabIcon };

export function TabButton({ children, icon, isFocused, ...props }: TabButtonProps) {
  const { wide } = usePageLayout();
  const theme = useTheme();
  const currentPage = isFocused ? ({ 'aria-current': 'page' } as object) : {};
  const color = isFocused ? (wide ? theme.text : theme.accent) : theme.textSecondary;
  return (
    <Pressable
      {...props}
      {...currentPage}
      style={({ pressed }) => [
        styles.tabButton,
        wide ? styles.tabButtonWide : styles.tabButtonNarrow,
        wide && isFocused && { backgroundColor: theme.backgroundSelected },
        !isFocused && pressed && { backgroundColor: theme.backgroundSubtle },
      ]}>
      {wide ? null : <SymbolView name={icon} size={24} tintColor={color} />}
      <Text
        style={[
          wide ? styles.tabLabel : styles.tabLabelNarrow,
          { color },
          isFocused && styles.tabLabelFocused,
        ]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const { wide, gutter } = usePageLayout();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  if (!wide) {
    return (
      <View
        {...props}
        style={[
          styles.bottomBar,
          {
            backgroundColor: theme.chrome,
            borderTopColor: theme.border,
            paddingBottom: insets.bottom + Spacing.one,
          },
        ]}>
        {props.children}
      </View>
    );
  }
  return (
    <View {...props} style={[styles.header, { backgroundColor: theme.chrome, borderBottomColor: theme.border }]}>
      <View style={[styles.headerInner, { paddingHorizontal: gutter }]}>
        <HomeLink />
        <HeaderSearch />
        <View style={styles.nav}>{props.children}</View>
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
  const { country } = useMarket();
  const [search, setSearch] = useState('');
  const submit = () => {
    const q = search.trim();
    router.navigate(q ? { pathname: '/shop', params: { q } } : '/shop');
  };
  return (
    <View style={styles.search}>
      <MerchantSearch
        country={country}
        value={search}
        onChangeText={setSearch}
        onSubmit={submit}
        onOpen={(merchant) => router.push(`/shop/${merchant.slug}`)}
      />
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
    borderBottomWidth: 1,
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
    marginLeft: 'auto',
  },
  search: {
    flex: 1,
    maxWidth: 420,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  bottomBar: {
    position: 'sticky',
    bottom: 0,
    zIndex: 10,
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.one,
    gap: Spacing.one,
  },
  tabButton: {
    justifyContent: 'center',
    alignItems: 'center',
    transitionProperty: 'background-color',
    transitionDuration: `${Motion.feedback}ms`,
  },
  tabButtonWide: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  tabButtonNarrow: {
    flex: 1,
    minHeight: 52,
    gap: Spacing.half,
    paddingVertical: Spacing.one,
    borderRadius: Radius.medium,
  },
  tabLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  tabLabelNarrow: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
  },
  tabLabelFocused: {
    fontFamily: FontFamily.semibold,
  },
  hiddenTab: {
    display: 'none',
  },
});
