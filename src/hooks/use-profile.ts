import { useCallback, useRef, useState } from 'react';

import { ctx } from '@/ctx/client';
import { type CountryChoice, Profile } from '@/ctx/profile';

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const writes = useRef(0);

  const startProfileRead = useCallback(() => {
    const writesAtStart = writes.current;
    return (loaded: Profile) => {
      if (writes.current === writesAtStart) {
        setProfile(loaded);
      }
    };
  }, []);

  const applyCountryChoice = useCallback(
    async (choice: CountryChoice) => {
      if (!profile) {
        return;
      }
      writes.current += 1;
      try {
        let current = profile;
        const sent = new Set<string>();
        let update = current.nextUpdate(choice);
        while (update && !sent.has(Object.keys(update)[0])) {
          sent.add(Object.keys(update)[0]);
          current = current.withUser(await ctx.updateUser(update));
          setProfile(current);
          update = current.nextUpdate(choice);
        }
        if (update) {
          throw new Error('Your choice did not save. Try again.');
        }
      } finally {
        writes.current += 1;
      }
    },
    [profile],
  );

  return { profile, setProfile, startProfileRead, applyCountryChoice };
}
