import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Field } from "@/components/ui/form";
import { ThemedText } from "@/components/ui/themed-text";
import { Elevation, FontFamily, Radius, Spacing } from "@/constants/theme";
import { CountryOption } from "@/ctx/country-option";
import { type CountryChoice, Profile } from "@/ctx/profile";
import { useMarket } from "@/hooks/use-market";
import { usePageLayout } from "@/hooks/use-page-layout";
import { useTheme } from "@/hooks/use-theme";
import { strings } from "@/strings";

type Props = {
  profile: Profile;
  busy: boolean;
  onChoose: (choice: CountryChoice) => void;
  onCancel?: () => void;
};

export function CountryPicker({ profile, busy, onChoose, onCancel }: Props) {
  const { country: marketCountry } = useMarket();
  const options = useMemo(() => CountryOption.forProfile(profile), [profile]);
  const [picked, setPicked] = useState<CountryOption | null>(null);
  const selected =
    picked ??
    CountryOption.suggested(options, [profile.country, marketCountry]);
  const unchanged =
    !profile.needsSetup() && selected?.country === profile.country;

  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary">
        {profile.needsCurrencyChoice()
          ? currencyCopy()
          : "Gift cards and prices depend on your country."}
      </ThemedText>
      <CountrySelect
        options={options}
        selected={selected}
        onSelect={setPicked}
        disabled={busy}
      />
      <Button
        label={busy ? "Saving…" : profile.needsSetup() ? "Continue" : "Save"}
        variant="primary"
        onPress={() => selected && onChoose(selected.choice())}
        disabled={busy || !selected || unchanged}
      />
      {onCancel && (
        <Button
          label="Cancel"
          variant="quiet"
          onPress={onCancel}
          disabled={busy}
        />
      )}
    </View>
  );
}

type CountrySelectProps = {
  options: readonly CountryOption[];
  selected: CountryOption | undefined;
  onSelect: (option: CountryOption) => void;
  disabled: boolean;
};

function CountrySelect({
  options,
  selected,
  onSelect,
  disabled,
}: CountrySelectProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const pick = (option: CountryOption) => {
    onSelect(option);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          selected
            ? `${selected.label()}. Change country`
            : "Choose your country"
        }
        style={[
          styles.trigger,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.borderStrong,
          },
        ]}
      >
        {selected && <Text style={styles.flag}>{selected.flag()}</Text>}
        <ThemedText style={styles.triggerLabel} numberOfLines={1}>
          {selected ? selected.label() : "Choose your country"}
        </ThemedText>
        <SymbolView
          name={{
            ios: "chevron.right",
            android: "chevron_right",
            web: "chevron_right",
          }}
          size={20}
          tintColor={theme.textSecondary}
          style={styles.chevron}
        />
      </Pressable>
      {open && (
        <CountryList
          options={options}
          selected={selected}
          onPick={pick}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

type CountryListProps = {
  options: readonly CountryOption[];
  selected: CountryOption | undefined;
  onPick: (option: CountryOption) => void;
  onClose: () => void;
};

function CountryList({ options, selected, onPick, onClose }: CountryListProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { wide } = usePageLayout();
  const [query, setQuery] = useState("");
  const shown = options.filter((option) => option.matches(query));

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[
          styles.backdrop,
          { backgroundColor: theme.scrim },
          wide ? styles.backdropWide : styles.backdropNarrow,
        ]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close country list"
      >
        <Pressable
          accessible={false}
          style={[
            styles.sheet,
            wide
              ? styles.sheetWide
              : { paddingBottom: insets.bottom + Spacing.two },
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.search}>
            <Field
              value={query}
              onChangeText={setQuery}
              label={strings.field.searchCountries}
              autoFocus
              returnKeyType="search"
            />
          </View>
          <FlatList
            data={shown}
            keyExtractor={(option) => option.country}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => (
              <CountryRow
                option={item}
                selected={item.country === selected?.country}
                onPress={() => onPick(item)}
              />
            )}
            ListEmptyComponent={
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.empty}
              >
                No matching countries
              </ThemedText>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CountryRow({
  option,
  selected,
  onPress,
}: {
  option: CountryOption;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({
        pressed,
        hovered,
      }: {
        pressed: boolean;
        hovered?: boolean;
      }) => [
        styles.row,
        (pressed || hovered || selected) && {
          backgroundColor: theme.backgroundSelected,
        },
      ]}
    >
      <Text style={styles.flag}>{option.flag()}</Text>
      <ThemedText
        style={styles.rowLabel}
        type={selected ? "smallBold" : "small"}
      >
        {option.label()}
      </ThemedText>
      {selected && (
        <SymbolView
          name={{ ios: "checkmark", android: "check", web: "check" }}
          size={18}
          tintColor={theme.accent}
        />
      )}
    </Pressable>
  );
}

function currencyCopy(): string {
  return (
    "Cashback is paid in the currency shown unless you pay in another one, " +
    "in which case it stays in the currency you paid with. The currency can't be changed later."
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.medium,
  },
  triggerLabel: {
    flex: 1,
    fontFamily: FontFamily.semibold,
  },
  chevron: {
    transform: [{ rotate: "90deg" }],
  },
  flag: {
    fontSize: 22,
  },
  backdrop: {
    flex: 1,
  },
  backdropWide: {
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.four,
  },
  backdropNarrow: {
    justifyContent: "flex-end",
  },
  sheet: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingTop: Spacing.three,
    maxHeight: "80%",
    ...Elevation.sheet,
  },
  sheetWide: {
    width: "100%",
    maxWidth: 420,
    paddingBottom: Spacing.two,
  },
  search: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
  },
  rowLabel: {
    flex: 1,
  },
  empty: {
    padding: Spacing.three,
  },
});
