import { useEffect } from "react";

import { AccountChanges } from "@/ctx/account-changes";
import { ctx } from "@/ctx/client";

const accountChanges = new AccountChanges(ctx);

export function useAccountChanges(listener: () => void, active: boolean): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    return accountChanges.subscribe(listener);
  }, [listener, active]);
}
