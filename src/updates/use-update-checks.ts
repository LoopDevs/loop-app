import { useEffect } from 'react';

import { useAppRefresh } from '@/hooks/use-app-refresh';

import { checkForUpdate } from './update-checker';

export function useUpdateChecks(): void {
  useEffect(() => {
    void checkForUpdate();
  }, []);
  useAppRefresh(checkForUpdate);
}
