import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { type CountryChoice, Profile } from '@/ctx/profile';
import { network } from '@/stellar/network';

type Props = {
  profile: Profile;
  busy: boolean;
  onChoose: (choice: CountryChoice) => void;
  onCancel?: () => void;
};

export function CountryPicker({ profile, busy, onChoose, onCancel }: Props) {
  const [country, setCountry] = useState<string | null>(null);
  const [stableCurrency, setStableCurrency] = useState<string | null>(null);

  const pickCountry = (picked: string) => {
    if (profile.needsCurrencyChoice()) {
      setCountry(picked);
      return;
    }
    onChoose({ country: picked });
  };

  const backToCountries = () => {
    setCountry(null);
    setStableCurrency(null);
  };

  if (country && profile.needsCurrencyChoice()) {
    return (
      <View style={styles.section}>
        <View style={styles.intro}>
          <ThemedText type="heading" accessibilityRole="header">
            Choose your cashback currency
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {currencyStepCopy()}
          </ThemedText>
        </View>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {profile.stableCurrencies.map((currency) => (
            <View key={currency} style={styles.gridItem}>
              <Button
                label={Profile.currencyLabel(currency)}
                onPress={() => setStableCurrency(currency)}
                selected={stableCurrency === currency}
                disabled={busy}
              />
            </View>
          ))}
        </View>
        <Button
          label={busy ? 'Saving…' : `Shop in ${country}`}
          variant="primary"
          onPress={() => stableCurrency && onChoose({ country, stableCurrency })}
          disabled={busy || !stableCurrency}
        />
        <Button label="Back" variant="quiet" onPress={backToCountries} disabled={busy} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary">
        Gift cards and prices depend on your country.
      </ThemedText>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {profile.countries.map((code) => (
          <View key={code} style={styles.gridItem}>
            <Button
              label={code}
              accessibilityLabel={`Shop in ${code}`}
              onPress={() => pickCountry(code)}
              selected={profile.country === code}
              disabled={busy}
            />
          </View>
        ))}
      </View>
      {onCancel && <Button label="Cancel" variant="quiet" onPress={onCancel} disabled={busy} />}
    </View>
  );
}

function currencyStepCopy(): string {
  const stableSymbols = network.tokens
    .filter((token) => token.currency !== 'XLM')
    .map((token) => token.symbol)
    .join(', ');
  return (
    'Cashback from payments in XLM is converted to this currency. ' +
    `Cashback from ${stableSymbols} payments stays in that currency. ` +
    "This can't be changed later."
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
  intro: {
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  gridItem: {
    flexBasis: '30%',
    flexGrow: 1,
  },
});
