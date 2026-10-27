import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import type { SocialProvider } from '@/session/social-sign-in';

type SocialSignInButtonsProps = {
  providers: SocialProvider[];
  appleAccountHint: string | null;
  disabled: boolean;
  onPress: (provider: SocialProvider) => void;
};

export function SocialSignInButtons({ providers, appleAccountHint, disabled, onPress }: SocialSignInButtonsProps) {
  if (providers.length === 0) {
    return (
      appleAccountHint && (
        <ThemedText type="small" themeColor="textSecondary">
          {appleAccountHint}
        </ThemedText>
      )
    );
  }
  return (
    <>
      {providers.includes('apple') && (
        <View pointerEvents={disabled ? 'none' : 'auto'} style={{ opacity: disabled ? 0.4 : 1 }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={Radius.control}
            style={styles.appleButton}
            onPress={() => onPress('apple')}
          />
        </View>
      )}
      {providers.includes('google') && (
        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={() => onPress('google')}
          disabled={disabled}
        />
      )}
      <ThemedText type="small" themeColor="textSecondary">
        Signed up with email before? Use the same email.
        {appleAccountHint && ` ${appleAccountHint}`}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Or sign in with your email
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  appleButton: {
    height: 50,
  },
});
