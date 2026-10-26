import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListGroup, ListRow } from '@/components/list-row';
import { Wordmark } from '@/components/wordmark';
import { Brand, FontFamily, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useBusyAction } from '@/hooks/use-busy-action';
import { useTheme } from '@/hooks/use-theme';
import { biometrics } from '@/native/biometrics';
import { haptics } from '@/native/haptics';
import { useRecentsProtection } from '@/native/screen-privacy';
import { AppLock, type AuthenticationResult } from '@/session/app-lock';
import { appLockStore } from '@/session/app-lock-store';

const notConfirmedMessage = "Couldn't confirm it's you. Try again.";

type AppLockControls = {
  isOn: boolean;
  turnOn: () => Promise<void>;
  turnOff: () => Promise<void>;
};

const AppLockContext = createContext<AppLockControls>({
  isOn: false,
  turnOn: async () => {},
  turnOff: async () => {},
});

export function AppLockToggle() {
  const { isOn, turnOn, turnOff } = useContext(AppLockContext);
  const { busy, message, run } = useBusyAction();
  const [enrolled, setEnrolled] = useState(false);
  const theme = useTheme();

  useFocusEffect(
    useCallback(() => {
      let current = true;
      biometrics
        .isEnrolled()
        .catch(() => false)
        .then((result) => {
          if (current) {
            setEnrolled(result);
          }
        });
      return () => {
        current = false;
      };
    }, []),
  );

  if (!enrolled && !isOn) {
    return null;
  }

  const toggle = (next: boolean) => run(next ? turnOn : turnOff);

  return (
    <ListGroup title="Security" footer={message}>
      <ListRow label="Lock Loop with Face ID / fingerprint">
        <Switch
          value={isOn}
          onValueChange={toggle}
          disabled={busy}
          trackColor={{ true: theme.accent }}
          accessibilityLabel="Lock Loop with Face ID / fingerprint"
        />
      </ListRow>
    </ListGroup>
  );
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [lock, setLock] = useState(AppLock.loading);
  const [inForeground, setInForeground] = useState(AppState.currentState !== 'background');
  const [message, setMessage] = useState('');
  const authenticating = useRef(false);

  useEffect(() => {
    let current = true;
    appLockStore.readEnabled().then(
      (enabled) => {
        if (current) {
          setLock((previous) => previous.loaded(enabled));
        }
      },
      () => {
        if (current) {
          setLock((previous) => previous.loadFailed());
        }
      },
    );
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const now = Date.now();
      setInForeground(next !== 'background');
      if (next === 'background') {
        setLock((previous) => previous.backgrounded(now));
      } else if (next === 'active') {
        setLock((previous) => previous.foregrounded(now));
      }
    });
    return () => subscription.remove();
  }, []);

  const authenticate = useCallback(async (prompt: string): Promise<AuthenticationResult | null> => {
    if (authenticating.current) {
      return null;
    }
    authenticating.current = true;
    try {
      return await biometrics.authenticate(prompt);
    } finally {
      authenticating.current = false;
    }
  }, []);

  const applyUnlockResult = useCallback((result: AuthenticationResult | null) => {
    if (!result) {
      return;
    }
    if (AppLock.unlocksWith(result)) {
      setMessage('');
      setLock((previous) => previous.unlocked());
      return;
    }
    if (!AppLock.isCancel(result)) {
      haptics.error();
      setMessage(notConfirmedMessage);
    }
  }, []);

  const unlock = useCallback(
    () => authenticate('Unlock Loop').then(applyUnlockResult),
    [authenticate, applyUnlockResult],
  );

  useRecentsProtection(lock.isOn());

  const covered = lock.covers();
  useEffect(() => {
    if (covered) {
      Promise.resolve(WebBrowser.dismissBrowser()).catch(() => undefined);
    }
  }, [covered]);

  useEffect(() => {
    if (lock.status === 'locked' && inForeground) {
      void unlock();
    }
  }, [lock.status, inForeground, unlock]);

  const turnOn = useCallback(async () => {
    const result = await authenticate('Turn on app lock');
    if (!result || AppLock.isCancel(result)) {
      return;
    }
    if (!result.success) {
      throw new Error(notConfirmedMessage);
    }
    await appLockStore.writeEnabled();
    setLock((previous) => previous.turnedOn());
  }, [authenticate]);

  const turnOff = useCallback(async () => {
    const result = await authenticate('Turn off app lock');
    if (!result || AppLock.isCancel(result)) {
      return;
    }
    if (!AppLock.unlocksWith(result)) {
      throw new Error(notConfirmedMessage);
    }
    await appLockStore.clear();
    setLock((previous) => previous.turnedOff());
  }, [authenticate]);

  return (
    <AppLockContext.Provider value={{ isOn: lock.isOn(), turnOn, turnOff }}>
      <View
        style={styles.fill}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {covered && (
        <LockView showUnlock={lock.status === 'locked'} message={message} onUnlock={unlock} />
      )}
    </AppLockContext.Provider>
  );
}

type LockViewProps = {
  showUnlock: boolean;
  message: string;
  onUnlock: () => void;
};

function LockView({ showUnlock, message, onUnlock }: LockViewProps) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.lock]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} accessibilityLiveRegion="polite">
          <Wordmark height={32} />
          {showUnlock && (
            <>
              <Text style={styles.lockTitle} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
                Loop is locked
              </Text>
              <Pressable
                onPress={onUnlock}
                accessibilityRole="button"
                style={({ pressed }) => [styles.unlock, pressed && styles.unlockPressed]}>
                <Text style={styles.unlockLabel} maxFontSizeMultiplier={1.6}>
                  Unlock
                </Text>
              </Pressable>
              {message !== '' && (
                <Text style={styles.lockMessage} maxFontSizeMultiplier={1.6}>
                  {message}
                </Text>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  lock: {
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: Brand.royal,
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  lockTitle: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.bold,
    fontSize: 30,
    lineHeight: 36,
  },
  unlock: {
    minHeight: 50,
    borderRadius: Radius.control,
    backgroundColor: Brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  unlockPressed: {
    opacity: 0.85,
  },
  unlockLabel: {
    color: Brand.onRoyal,
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    lineHeight: 22,
  },
  lockMessage: {
    color: Brand.onRoyalMuted,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    lineHeight: 20,
  },
});
