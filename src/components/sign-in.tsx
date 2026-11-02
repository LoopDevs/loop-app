import { SymbolView } from 'expo-symbols';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddDevice } from '@/components/add-device';
import { CountryPicker } from '@/components/country-picker';
import { ExternalLink } from '@/components/external-link';
import { Button, Field } from '@/components/ui/form';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { PressScale } from '@/components/ui/press-scale';
import { SocialSignInButtons } from '@/components/social-sign-in-buttons';
import { ThemedText } from '@/components/ui/themed-text';
import { useToast } from '@/components/ui/toast';
import { Wordmark } from '@/components/wordmark';
import { loopLinks } from '@/constants/loop-links';
import { Elevation, FontFamily, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { useBusyAction } from '@/hooks/use-busy-action';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { strings } from '@/strings';
import { haptics } from '@/native/haptics';
import { socialSignIn } from '@/native/social-sign-in';
import type { CountryChoice } from '@/ctx/profile';
import type { SocialProvider } from '@/session/social-sign-in';
import { passkey } from '@/wallet/passkey';
import { SmartWallet, UnlinkedDevice, WalletBlocked } from '@/wallet/smart-wallet';

type SignInListener = () => void;

type SignInState = {
  signedIn: boolean | null;
  openSignIn: (reason?: string) => void;
  check: () => Promise<boolean>;
  onSignIn: (listener: SignInListener) => () => void;
  finishSignIn: () => Promise<void>;
};

const SignInContext = createContext<SignInState | null>(null);

export function SignInProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const listeners = useRef(new Set<SignInListener>());

  const check = useCallback(async () => {
    const current = await ctx.isSignedIn().catch(() => false);
    setSignedIn(current);
    return current;
  }, []);

  useEffect(() => {
    ctx
      .isSignedIn()
      .catch(() => false)
      .then(setSignedIn);
  }, []);

  const openSignIn = useCallback((why?: string) => setReason(why ?? ''), []);

  const onSignIn = useCallback((listener: SignInListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const finishSignIn = useCallback(async () => {
    setReason(null);
    await check();
    listeners.current.forEach((listener) => listener());
  }, [check]);

  const value = useMemo(
    () => ({ signedIn, openSignIn, check, onSignIn, finishSignIn }),
    [signedIn, openSignIn, check, onSignIn, finishSignIn],
  );

  return (
    <SignInContext.Provider value={value}>
      {children}
      {reason !== null && (
        <SignInSheet reason={reason} onClose={() => setReason(null)} onSignedIn={finishSignIn} />
      )}
    </SignInContext.Provider>
  );
}

export function useSignIn(): SignInState {
  const state = useContext(SignInContext);
  if (!state) {
    throw new Error('useSignIn needs a SignInProvider');
  }
  return state;
}

export function useOnSignIn(listener: SignInListener) {
  const { onSignIn } = useSignIn();
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => onSignIn(() => latest.current()), [onSignIn]);
}

type SheetProps = {
  reason: string;
  onClose: () => void;
  onSignedIn: () => void;
};

function SignInSheet({ reason, onClose, onSignedIn }: SheetProps) {
  const { wide } = usePageLayout();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [authenticated, setAuthenticated] = useState(false);
  const close = authenticated ? onSignedIn : onClose;
  const entering = reduceMotion
    ? undefined
    : (wide ? FadeInDown : SlideInDown).duration(Motion.transition).easing(Motion.easeOut);
  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoid style={[styles.layer, wide ? styles.layerWide : styles.layerNarrow]}>
        <Animated.View entering={FadeIn.duration(Motion.state)} style={StyleSheet.absoluteFill}>
          <Pressable
            style={[styles.backdrop, { backgroundColor: theme.scrim }]}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close sign in"
          />
        </Animated.View>
        <Animated.View
          entering={entering}
          accessibilityViewIsModal
          style={[
            wide ? styles.sheetWide : styles.sheetNarrow,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
              paddingBottom: wide ? 0 : insets.bottom,
            },
          ]}>
          <View style={styles.sheetHeader}>
            <Wordmark height={20} />
            <PressScale
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.close, { backgroundColor: theme.backgroundSubtle }]}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} tintColor={theme.text} />
            </PressScale>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <SignInForm reason={reason} onAuthenticated={() => setAuthenticated(true)} onSignedIn={onSignedIn} />
          </ScrollView>
        </Animated.View>
      </KeyboardAvoid>
    </Modal>
  );
}

export function SignInScreen() {
  const { finishSignIn } = useSignIn();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoid style={[styles.layer, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.screenBody,
          { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.four },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.screenContent}>
          <Wordmark height={24} />
          <SignInForm reason="" onAuthenticated={() => undefined} onSignedIn={finishSignIn} />
        </View>
      </ScrollView>
    </KeyboardAvoid>
  );
}

type SignInStep = 'email' | 'code' | 'country' | 'secure' | 'add-device';

const stepNumbers: Record<SignInStep, number> = {
  email: 1,
  code: 2,
  country: 3,
  secure: 4,
  'add-device': 4,
};

const stepCount = 4;
const resendCooldownMs = 30_000;

type SignInFormProps = {
  reason: string;
  onAuthenticated: () => void;
  onSignedIn: () => void;
};

function SignInForm({ reason, onAuthenticated, onSignedIn }: SignInFormProps) {
  const [step, setStep] = useState<SignInStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [unlinkedWallet, setUnlinkedWallet] = useState<SmartWallet | null>(null);
  const [codeSentAt, setCodeSentAt] = useState<number | null>(null);
  const resendBlocked = codeSentAt !== null;
  const { profile, setProfile, applyCountryChoice } = useProfile();
  const { busy, message, setMessage, run } = useBusyAction();
  const toast = useToast();

  useEffect(() => {
    if (codeSentAt === null) {
      return;
    }
    const timer = setTimeout(() => setCodeSentAt(null), resendCooldownMs);
    return () => clearTimeout(timer);
  }, [codeSentAt]);

  const finish = () => {
    haptics.success();
    onSignedIn();
  };

  const continueToWallet = async () => {
    onAuthenticated();
    const loaded = await ctx.me();
    if (loaded.needsSetup()) {
      setProfile(loaded);
      setStep('country');
      return;
    }
    await openWallet();
  };

  const openWallet = async () => {
    try {
      if (await SmartWallet.load()) {
        finish();
        return;
      }
    } catch (error) {
      if (error instanceof UnlinkedDevice) {
        setUnlinkedWallet(error.wallet);
        setStep('add-device');
        return;
      }
      if (error instanceof WalletBlocked) {
        finish();
        return;
      }
      throw error;
    }
    setStep('secure');
    if (Platform.OS !== 'web') {
      await createWallet().catch((error: unknown) => {
        if (!passkey.isUserCancel(error)) {
          throw error;
        }
      });
    }
  };

  const createWallet = async () => {
    const profile = await ctx.me();
    await SmartWallet.create(profile.passkeyLabel());
    finish();
  };

  const chooseCountry = (choice: CountryChoice) =>
    run(async () => {
      await applyCountryChoice(choice);
      await openWallet();
    });

  const secureAccount = () => run(createWallet);

  const requestCode = () =>
    run(async () => {
      await ctx.requestCode(email.trim());
      setCodeSentAt(Date.now());
      setStep('code');
    });

  const verifyCode = () =>
    run(async () => {
      if (!(await ctx.isSignedInAs(email))) {
        if (await ctx.isSignedIn()) {
          await ctx.signOut();
        }
        await ctx.verifyCode(email.trim(), code.trim());
      }
      await continueToWallet();
    });

  const resendCode = () =>
    run(async () => {
      await ctx.requestCode(email.trim());
      setCodeSentAt(Date.now());
      toast('Code sent');
    });

  const changeEmail = () => {
    setCode('');
    setMessage('');
    setStep('email');
  };

  const signInWith = (provider: SocialProvider) =>
    run(async () => {
      const credential = await socialSignIn.credential(provider);
      if (!credential) {
        return;
      }
      await ctx.signInWithOAuth(provider, credential);
      await continueToWallet();
    });

  return (
    <View style={styles.form}>
      <StepIndicator current={stepNumbers[step]} />
      {step === 'email' && (
        <Animated.View key="email" entering={FadeIn.duration(Motion.state)} style={styles.form}>
          <View style={styles.intro}>
            <ThemedText type="subtitle" accessibilityRole="header">
              Enter your email
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {reason || 'Buy gift cards and earn cashback on every one.'}
            </ThemedText>
          </View>
          <SocialSignInButtons
            providers={socialSignIn.providers()}
            appleAccountHint={socialSignIn.appleAccountHint()}
            disabled={busy}
            onPress={signInWith}
          />
          <Field
            value={email}
            onChangeText={setEmail}
            label={strings.field.email}
            disabled={busy}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoFocus={Platform.OS === 'web'}
            returnKeyType="send"
            onSubmitEditing={() => email.trim() && !busy && requestCode()}
          />
          <Button
            label={busy ? 'Sending code…' : 'Send code'}
            variant="primary"
            onPress={requestCode}
            disabled={busy || !email.trim()}
          />
        </Animated.View>
      )}
      {step === 'code' && (
        <Animated.View key="code" entering={FadeIn.duration(Motion.state)} style={styles.form}>
          <View style={styles.intro}>
            <ThemedText type="subtitle" accessibilityRole="header">
              Confirm code
            </ThemedText>
            <ThemedText themeColor="textSecondary">We sent a code to {email.trim()}. Enter it below.</ThemedText>
          </View>
          <Field
            value={code}
            onChangeText={setCode}
            label={strings.field.code}
            disabled={busy}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => code.trim() && !busy && verifyCode()}
          />
          <Button
            label={busy ? 'Signing in…' : 'Sign in'}
            variant="primary"
            onPress={verifyCode}
            disabled={busy || !code.trim()}
          />
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Button
                label="Resend code"
                variant="quiet"
                onPress={resendCode}
                disabled={busy || resendBlocked}
              />
            </View>
            <View style={styles.rowItem}>
              <Button label="Change email" variant="quiet" onPress={changeEmail} disabled={busy} />
            </View>
          </View>
        </Animated.View>
      )}
      {step === 'country' && profile && (
        <Animated.View key="country" entering={FadeIn.duration(Motion.state)} style={styles.form}>
          <View style={styles.intro}>
            <ThemedText type="subtitle" accessibilityRole="header">
              Where do you shop?
            </ThemedText>
          </View>
          <CountryPicker profile={profile} busy={busy} onChoose={chooseCountry} />
        </Animated.View>
      )}
      {step === 'secure' && (
        <Animated.View key="secure" entering={FadeIn.duration(Motion.state)} style={styles.form}>
          <View style={styles.intro}>
            <ThemedText type="subtitle" accessibilityRole="header">
              Secure your account
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Use Face ID, Touch ID or your device PIN so only you can spend your balance.
            </ThemedText>
          </View>
          <Button
            label={busy ? 'Setting up…' : 'Continue'}
            variant="primary"
            onPress={secureAccount}
            disabled={busy}
          />
        </Animated.View>
      )}
      {step === 'add-device' && unlinkedWallet && (
        <AddDevice wallet={unlinkedWallet} onAdded={async () => finish()} />
      )}
      {message !== '' && (
        <ThemedText type="small" themeColor="danger" selectable accessibilityLiveRegion="polite">
          {message}
        </ThemedText>
      )}
      {stepNumbers[step] < stepCount && (
        <ThemedText type="small" themeColor="textSecondary">
          By continuing you agree to Loop&apos;s{' '}
          <ExternalLink href={loopLinks.terms} style={styles.link}>
            Terms
          </ExternalLink>{' '}
          and{' '}
          <ExternalLink href={loopLinks.privacy} style={styles.link}>
            Privacy Policy
          </ExternalLink>
          .
        </ThemedText>
      )}
    </View>
  );
}

function StepIndicator({ current }: { current: number }) {
  const theme = useTheme();
  const steps = Array.from({ length: stepCount }, (_, index) => index + 1);
  return (
    <View style={styles.stepIndicator}>
      <View
        style={styles.stepBars}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {steps.map((number) => (
          <View
            key={number}
            style={[styles.stepBar, { backgroundColor: number === current ? theme.accent : theme.border }]}
          />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Step {current} of {stepCount}
      </ThemedText>
    </View>
  );
}

export function SignInButton({ label = 'Sign in', reason }: { label?: string; reason?: string }) {
  const { openSignIn } = useSignIn();
  const theme = useTheme();
  return (
    <PressScale
      onPress={() => {
        haptics.tap();
        openSignIn(reason);
      }}
      accessibilityRole="button"
      style={[styles.signInButton, { backgroundColor: theme.accent }]}>
      <Text style={[styles.signInLabel, { color: theme.onAccent }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
  },
  layerWide: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  layerNarrow: {
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheetWide: {
    width: '100%',
    maxWidth: Layout.sheetWidth,
    maxHeight: '90%',
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Elevation.raised,
  },
  sheetNarrow: {
    maxHeight: '92%',
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...Elevation.raised,
  },
  sheetHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: {
    padding: Spacing.four,
  },
  screenBody: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  screenContent: {
    width: '100%',
    maxWidth: Layout.formMaxWidth,
    alignSelf: 'center',
    gap: Spacing.five,
  },
  form: {
    gap: Spacing.three,
  },
  stepIndicator: {
    gap: Spacing.two,
  },
  stepBars: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  stepBar: {
    width: 24,
    height: 4,
    borderRadius: Radius.pill,
  },
  intro: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rowItem: {
    flex: 1,
  },
  link: {
    textDecorationLine: 'underline',
  },
  signInButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
  },
});
