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
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown, SlideInRight, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { Button, Field } from '@/components/form';
import { PressScale } from '@/components/press-scale';
import { SocialSignInButtons } from '@/components/social-sign-in-buttons';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Wordmark } from '@/components/wordmark';
import { loopLinks } from '@/constants/loop-links';
import { Brand, FontFamily, Layout, Motion, Radius, Spacing } from '@/constants/theme';
import { ctx } from '@/ctx/client';
import { useBusyAction } from '@/hooks/use-busy-action';
import { usePageLayout } from '@/hooks/use-page-layout';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/native/haptics';
import { socialSignIn } from '@/native/social-sign-in';
import type { SocialProvider } from '@/session/social-sign-in';

type SignInListener = () => void;

type SignInState = {
  signedIn: boolean | null;
  openSignIn: (reason?: string) => void;
  check: () => Promise<boolean>;
  onSignIn: (listener: SignInListener) => () => void;
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

  const finish = useCallback(async () => {
    setReason(null);
    await check();
    listeners.current.forEach((listener) => listener());
  }, [check]);

  const value = useMemo(
    () => ({ signedIn, openSignIn, check, onSignIn }),
    [signedIn, openSignIn, check, onSignIn],
  );

  return (
    <SignInContext.Provider value={value}>
      {children}
      {reason !== null && <SignInSheet reason={reason} onClose={() => setReason(null)} onSignedIn={finish} />}
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
  const entering = reduceMotion
    ? undefined
    : (wide ? SlideInRight : SlideInDown).duration(Motion.transition).easing(Motion.easeOut);
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.layer, wide ? styles.layerWide : styles.layerNarrow]}>
        <Animated.View entering={FadeIn.duration(Motion.state)} style={StyleSheet.absoluteFill}>
          <Pressable
            style={styles.backdrop}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close sign in"
          />
        </Animated.View>
        <Animated.View
          entering={entering}
          accessibilityViewIsModal
          style={[
            wide ? styles.sheetWide : styles.sheetNarrow,
            { backgroundColor: theme.background, paddingBottom: wide ? 0 : insets.bottom },
          ]}>
          <View style={[styles.sheetHeader, { paddingTop: wide ? Spacing.four : Spacing.three }]}>
            <Wordmark height={20} />
            <PressScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}>
              <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} tintColor={Brand.onRoyal} />
            </PressScale>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <SignInForm reason={reason} onSignedIn={onSignedIn} />
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SignInForm({ reason, onSignedIn }: { reason: string; onSignedIn: () => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const { busy, message, setMessage, run } = useBusyAction();
  const toast = useToast();

  const requestCode = () =>
    run(async () => {
      await ctx.requestCode(email.trim());
      setStep('code');
    });

  const verifyCode = () =>
    run(async () => {
      if (!(await ctx.isSignedIn())) {
        await ctx.verifyCode(email.trim(), code.trim());
      }
      haptics.success();
      onSignedIn();
    });

  const resendCode = () =>
    run(async () => {
      await ctx.requestCode(email.trim());
      toast('Code sent');
    });

  const changeEmail = () => {
    setCode('');
    setMessage('');
    setStep('email');
  };

  const signInWith = (provider: SocialProvider) =>
    run(async () => {
      const idToken = await socialSignIn.idToken(provider);
      if (!idToken) {
        return;
      }
      await ctx.signInWithOAuth(provider, idToken);
      haptics.success();
      onSignedIn();
    });

  return (
    <View style={styles.form}>
      {step === 'email' ? (
        <Animated.View key="email" entering={FadeIn.duration(Motion.state)} style={styles.form}>
          <View style={styles.intro}>
            <ThemedText type="subtitle" accessibilityRole="header">
              Sign in to Loop
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {reason || 'Buy gift cards and earn cashback on every one.'}
            </ThemedText>
          </View>
          <SocialSignInButtons providers={socialSignIn.providers()} disabled={busy} onPress={signInWith} />
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
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
      ) : (
        <Animated.View key="code" entering={FadeIn.duration(Motion.state)} style={styles.form}>
          <View style={styles.intro}>
            <ThemedText type="subtitle" accessibilityRole="header">
              Check your email
            </ThemedText>
            <ThemedText themeColor="textSecondary">We sent a code to {email.trim()}. Enter it below.</ThemedText>
          </View>
          <Field
            value={code}
            onChangeText={setCode}
            placeholder="Code"
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
              <Button label="Resend code" variant="quiet" onPress={resendCode} disabled={busy} />
            </View>
            <View style={styles.rowItem}>
              <Button label="Change email" variant="quiet" onPress={changeEmail} disabled={busy} />
            </View>
          </View>
        </Animated.View>
      )}
      {message !== '' && (
        <ThemedText type="small" themeColor="danger" selectable accessibilityLiveRegion="polite">
          {message}
        </ThemedText>
      )}
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
    </View>
  );
}

export function SignInButton({ label = 'Sign in', reason }: { label?: string; reason?: string }) {
  const { openSignIn } = useSignIn();
  return (
    <PressScale
      onPress={() => {
        haptics.tap();
        openSignIn(reason);
      }}
      accessibilityRole="button"
      style={styles.signInButton}>
      <Text style={styles.signInLabel} maxFontSizeMultiplier={1.3}>
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
    alignItems: 'flex-end',
  },
  layerNarrow: {
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: Brand.scrim,
  },
  sheetWide: {
    width: Layout.sheetWidth,
    maxWidth: '100%',
    height: '100%',
    boxShadow: '-12px 0 40px rgba(10, 22, 64, 0.28)',
  },
  sheetNarrow: {
    maxHeight: '92%',
    borderTopLeftRadius: Radius.control,
    borderTopRightRadius: Radius.control,
    overflow: 'hidden',
  },
  sheetHeader: {
    backgroundColor: Brand.royal,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: Radius.control,
    backgroundColor: Brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: {
    padding: Spacing.four,
  },
  form: {
    gap: Spacing.three,
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
    borderRadius: Radius.control,
    backgroundColor: Brand.onRoyal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInLabel: {
    color: Brand.navy,
    fontFamily: FontFamily.semibold,
    fontSize: 15,
  },
});
