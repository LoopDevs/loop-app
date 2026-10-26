import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useBusyAction } from '@/hooks/use-busy-action';
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
    <View style={styles.section}>
      <ThemedText type="smallBold">Security</ThemedText>
      <View style={styles.toggleRow}>
        <ThemedText style={styles.toggleLabel}>Lock Loop with Face ID / fingerprint</ThemedText>
        <Switch
          value={isOn}
          onValueChange={toggle}
          disabled={busy}
          accessibilityLabel="Lock Loop with Face ID / fingerprint"
        />
      </View>
      {message !== '' && <ThemedText type="small">{message}</ThemedText>}
    </View>
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
      WebBrowser.dismissBrowser().catch(() => undefined);
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
    <ThemedView style={[StyleSheet.absoluteFill, styles.lock]}>
      <SafeAreaView style={styles.safeArea}>
        {showUnlock && (
          <View style={styles.content} accessibilityLiveRegion="polite">
            <ThemedText type="subtitle">Loop is locked</ThemedText>
            <Button label="Unlock" onPress={onUnlock} />
            {message !== '' && <ThemedText type="small">{message}</ThemedText>}
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  section: {
    gap: Spacing.two,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  toggleLabel: {
    flex: 1,
  },
  lock: {
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
});
