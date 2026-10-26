import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SocialProvider } from '@/session/social-sign-in';

type SocialSignInButtonsProps = {
  providers: SocialProvider[];
  disabled: boolean;
  onPress: (provider: SocialProvider) => void;
};

export function SocialSignInButtons({ providers, disabled, onPress }: SocialSignInButtonsProps) {
  const scheme = useColorScheme();
  if (providers.length === 0) {
    return null;
  }
  return (
    <>
      {providers.includes('apple') && (
        <View pointerEvents={disabled ? 'none' : 'auto'} style={{ opacity: disabled ? 0.4 : 1 }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              scheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
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
        {providers.includes('apple') &&
          ' Signed up with Apple and hid your email? Use the relay address shown in Settings on your iPhone.'}
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
