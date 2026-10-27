import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { openBrowserAsync } from "expo-web-browser";
import { useCallback, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { AppLockToggle } from "@/components/app-lock";
import { CountryPicker } from "@/components/country-picker";
import { Button, Notice } from "@/components/form";
import { useScrimScroll } from "@/components/home-panel";
import { ListGroup, ListRow } from "@/components/list-row";
import { PageHeader } from "@/components/page-header";
import { useOnSignIn, useSignIn } from "@/components/sign-in";
import { SiteFooter } from "@/components/site-footer";
import { OrderRowsSkeleton } from "@/components/skeleton";
import { SplitLayout } from "@/components/split-layout";
import { PageWidth } from "@/components/storefront";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { loopLinks } from "@/constants/loop-links";
import {
  MaxContentWidth,
  Radius,
  ScrollEndInset,
  Spacing,
} from "@/constants/theme";
import { ctx } from "@/ctx/client";
import { type CountryChoice, Profile } from "@/ctx/profile";
import { useAppRefresh } from "@/hooks/use-app-refresh";
import { useBusyAction } from "@/hooks/use-busy-action";
import { usePageLayout } from "@/hooks/use-page-layout";
import { useProfile } from "@/hooks/use-profile";
import { useTheme } from "@/hooks/use-theme";
import { runningUpdateId } from "@/updates/update-checker";

type SettingsSection = "account" | "help" | "data";

const sectionTitles: Record<SettingsSection, string> = {
  account: "Account",
  help: "Help and legal",
  data: "Your data",
};

export default function SettingsScreen() {
  const router = useRouter();
  const { wide } = usePageLayout();
  const { busy, message, run } = useBusyAction();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { profile, setProfile, applyCountryChoice } = useProfile();
  const [changingCountry, setChangingCountry] = useState(false);
  const [chosenSection, setChosenSection] =
    useState<SettingsSection>("account");
  const [mailUnavailable, setMailUnavailable] = useState(false);
  const openMail = (url: string) => {
    Linking.openURL(url).catch(() => setMailUnavailable(true));
  };
  const mailFooter = mailUnavailable
    ? `Couldn't open your email app. Email ${loopLinks.supportEmail}.`
    : undefined;
  const profileUserId = useRef<string | null>(null);
  const { scrollRef, onScroll, scrim } = useScrimScroll();

  const loadAccount = useCallback(
    () =>
      run(async () => {
        const isSignedIn = await ctx.isSignedIn();
        setSignedIn(isSignedIn);
        const userId = isSignedIn ? await ctx.userId() : null;
        if (userId !== profileUserId.current) {
          profileUserId.current = userId;
          setProfile(null);
        }
        if (!userId) {
          return;
        }
        const loaded = await ctx.me();
        if (profileUserId.current === userId) {
          setProfile(loaded);
        }
      }),
    [run, setProfile],
  );

  useFocusEffect(
    useCallback(() => {
      loadAccount();
    }, [loadAccount]),
  );
  useAppRefresh(loadAccount);
  useOnSignIn(loadAccount);
  const { openSignIn, check } = useSignIn();

  const chooseCountry = (choice: CountryChoice) =>
    run(async () => {
      await applyCountryChoice(choice);
      setChangingCountry(false);
    });

  const signOut = () =>
    run(async () => {
      await ctx.signOut();
      profileUserId.current = null;
      setSignedIn(false);
      setProfile(null);
      router.navigate("/");
      await check();
    });

  const confirmSignOut = () => {
    const prompt = "You can sign back in any time with your email.";
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(`Sign out of Loop? ${prompt}`)) {
        signOut();
      }
      return;
    }
    Alert.alert("Sign out of Loop?", prompt, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: signOut },
    ]);
  };

  const errorText = message !== "" && <Notice message={message} />;

  const countryPicker = profile && (
    <>
      <CountryPicker
        profile={profile}
        busy={busy}
        onChoose={chooseCountry}
        onCancel={() => setChangingCountry(false)}
      />
      {errorText}
    </>
  );

  if (!wide && profile && changingCountry) {
    return (
      <ThemedView style={styles.container}>
        <StatusBar style="dark" />
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scroll}
        >
          <PageHeader title="Change country" belowNavigationHeader />
          <View style={styles.body}>{countryPicker}</View>
          <SiteFooter />
        </Animated.ScrollView>
        <Animated.View pointerEvents="none" style={scrim} />
      </ThemedView>
    );
  }

  const providerLabel = profile?.signInProviderLabel();

  const accountStatus = (
    <>
      {signedIn === null && <OrderRowsSkeleton />}

      {signedIn && !profile && busy && <OrderRowsSkeleton />}
      {signedIn && !profile && !busy && message === "" && (
        <Notice
          message="Your account details didn't load."
          actionLabel="Try again"
          onAction={loadAccount}
        />
      )}
      {signedIn && !profile && !busy && message !== "" && (
        <Notice
          message={message}
          actionLabel="Try again"
          onAction={loadAccount}
        />
      )}

      {signedIn === false && (
        <View style={styles.signedOut}>
          <ThemedText type="heading">You&apos;re signed out</ThemedText>
          {wide && (
            <ThemedText themeColor="textSecondary">
              Sign in to see your account, change your country and choose where
              cashback goes.
            </ThemedText>
          )}
          <View style={wide && styles.inlineAction}>
            <Button
              label="Sign in"
              variant="primary"
              onPress={() => openSignIn()}
            />
          </View>
        </View>
      )}
    </>
  );

  const accountGroups = profile && (
    <>
      <ListGroup title="Account">
        <ListRow label="Email" value={profile.email ?? "Not set"} />
        {providerLabel && <ListRow label={providerLabel} />}
      </ListGroup>

      <ListGroup
        title="Region"
        footer={
          profile.stableCurrency
            ? "Contact support to change your cashback currency."
            : undefined
        }
      >
        <ListRow
          label="Country"
          value={profile.country ?? "Choose"}
          onPress={() => setChangingCountry(true)}
          disabled={busy}
        />
        {profile.stableCurrency && (
          <ListRow
            label="Cashback currency"
            value={Profile.currencyLabel(profile.stableCurrency)}
          />
        )}
        <ListRow
          label="Cashback"
          detail="Where it goes and what's on the way"
          onPress={() => router.push("/wallet/cashback")}
        />
      </ListGroup>
    </>
  );

  const helpGroup = (
    <ListGroup title="Help and legal" footer={mailFooter}>
      <ListRow
        label="Contact support"
        trailing="external"
        accessibilityRole="link"
        onPress={() => openMail(loopLinks.supportMail())}
      />
      <ListRow
        label="Terms"
        trailing="external"
        accessibilityRole="link"
        onPress={() => openBrowserAsync(loopLinks.terms)}
      />
      <ListRow
        label="Privacy Policy"
        trailing="external"
        accessibilityRole="link"
        onPress={() => openBrowserAsync(loopLinks.privacy)}
      />
    </ListGroup>
  );

  const dataGroup = profile && (
    <ListGroup
      title="Your data"
      footer={`Both open an email to ${loopLinks.supportEmail}.`}
    >
      <ListRow
        label="Request my data"
        trailing="external"
        onPress={() => openMail(loopLinks.supportMail("Data request"))}
      />
      <ListRow
        label="Delete my account"
        tone="danger"
        trailing="external"
        onPress={() =>
          openMail(
            loopLinks.supportMail(
              "Delete my account",
              `Please delete my Loop account.\n\nAccount email: ${profile.email ?? ""}`,
            ),
          )
        }
      />
    </ListGroup>
  );

  const signOutGroup = profile && (
    <ListGroup>
      <ListRow
        label={busy ? "Signing out…" : "Sign out"}
        tone="danger"
        trailing="none"
        onPress={confirmSignOut}
        disabled={busy}
      />
    </ListGroup>
  );

  const updateId = runningUpdateId();
  const version = (
    <ThemedText
      type="small"
      themeColor="textSecondary"
      style={!wide && styles.version}
    >
      Version {Constants.expoConfig?.version}
      {updateId && ` (${updateId})`}
    </ThemedText>
  );

  if (wide) {
    const sections: SettingsSection[] = profile
      ? ["account", "help", "data"]
      : ["account", "help"];
    const section = sections.includes(chosenSection)
      ? chosenSection
      : "account";
    const sectionContent = {
      account:
        profile && changingCountry ? (
          countryPicker
        ) : (
          <>
            {accountStatus}
            {accountGroups}
            <AppLockToggle />
            {profile && errorText}
          </>
        ),
      help: helpGroup,
      data: (
        <>
          {dataGroup}
          {errorText}
        </>
      ),
    }[section];
    return (
      <ThemedView style={styles.container}>
        <StatusBar style="dark" />
        <Animated.ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.wideScroll}
        >
          <PageHeader
            title="Account settings"
            belowNavigationHeader
            detail={profile?.email ?? undefined}
            width="page"
          />
          <PageWidth style={styles.wideBody}>
            <SplitLayout
              asideSide="start"
              asideWidth={260}
              aside={
                <>
                  <View accessibilityRole="tablist" style={styles.nav}>
                    {sections.map((key) => (
                      <SectionLink
                        key={key}
                        label={sectionTitles[key]}
                        selected={key === section}
                        onPress={() => {
                          setChosenSection(key);
                          setChangingCountry(false);
                        }}
                      />
                    ))}
                  </View>
                  {signOutGroup}
                  <View style={styles.navFooter}>{version}</View>
                </>
              }
            >
              <View style={styles.wideSection}>{sectionContent}</View>
            </SplitLayout>
          </PageWidth>
          <SiteFooter />
        </Animated.ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="dark" />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scroll}
      >
        <PageHeader
          title="Account settings"
          detail={profile?.email ?? undefined}
          belowNavigationHeader
        />
        <View style={styles.body}>
          {accountStatus}
          {accountGroups}
          <AppLockToggle />
          {helpGroup}
          {dataGroup}
          {signOutGroup}
          {profile && errorText}
          {version}
        </View>
        <SiteFooter />
      </Animated.ScrollView>
      <Animated.View pointerEvents="none" style={scrim} />
    </ThemedView>
  );
}

function SectionLink({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.navItem,
        (hovered || pressed) && { backgroundColor: theme.backgroundElement },
        selected && {
          backgroundColor: theme.backgroundSelected,
          borderColor: theme.accent,
        },
      ]}
    >
      <ThemedText
        type={selected ? "smallBold" : "small"}
        themeColor={selected ? "accent" : "text"}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: ScrollEndInset,
  },
  body: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  signedOut: {
    gap: Spacing.three,
  },
  inlineAction: {
    alignSelf: "flex-start",
  },
  version: {
    textAlign: "center",
  },
  wideScroll: {
    flexGrow: 1,
  },
  wideBody: {
    paddingTop: Spacing.five,
  },
  wideSection: {
    maxWidth: 640,
    gap: Spacing.four,
  },
  nav: {
    gap: Spacing.half,
  },
  navItem: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    borderLeftWidth: 3,
    borderColor: "transparent",
  },
  navFooter: {
    paddingHorizontal: Spacing.three,
  },
});
