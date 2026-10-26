import { useCallback, useState } from 'react';

import { ctx } from '@/ctx/client';
import { type CountryChoice, Profile } from '@/ctx/profile';

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);

  const applyCountryChoice = useCallback(
    async (choice: CountryChoice) => {
      if (!profile) {
        return;
      }
      let current = profile;
      const sent = new Set<string>();
      let update = current.nextUpdate(choice);
      while (update && !sent.has(Object.keys(update)[0])) {
        sent.add(Object.keys(update)[0]);
        current = current.withUser(await ctx.updateUser(update));
        setProfile(current);
        update = current.nextUpdate(choice);
      }
    },
    [profile],
  );

  return { profile, setProfile, applyCountryChoice };
}
