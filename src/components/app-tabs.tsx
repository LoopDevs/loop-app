import { NativeTabs } from 'expo-router/native-tabs';
import { StyleSheet } from 'react-native';

import { SignInScreen, useSignIn } from '@/components/sign-in';
import { ThemedView } from '@/components/themed-view';
import { Colors, FontFamily } from '@/constants/theme';

export default function AppTabs() {
  const { signedIn } = useSignIn();
  if (signedIn === null) {
    return <ThemedView style={styles.loading} />;
  }
  if (!signedIn) {
    return <SignInScreen />;
  }
  return <SignedInTabs />;
}

function SignedInTabs() {
  const colors = Colors.light;

  return (
    <NativeTabs
      backgroundColor={colors.backgroundElement}
      indicatorColor={colors.backgroundSelected}
      rippleColor={colors.backgroundSelected}
      tintColor={colors.accent}
      iconColor={{ default: colors.textSecondary, selected: colors.accent }}
      labelStyle={{
        default: {
          color: colors.textSecondary,
          fontFamily: FontFamily.medium,
          fontSize: 11,
        },
        selected: {
          color: colors.accent,
          fontFamily: FontFamily.semibold,
          fontSize: 11,
        },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="shop">
        <NativeTabs.Trigger.Label>Shop</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/shop.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="savings">
        <NativeTabs.Trigger.Label>Savings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="leaf" md="savings" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="wallet">
        <NativeTabs.Trigger.Label>Wallet</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="wallet.pass" md="account_balance_wallet" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="account_circle" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(site)" hidden />
    </NativeTabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
  },
});
