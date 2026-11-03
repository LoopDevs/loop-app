import type { LinkExit } from 'react-native-plaid-link-sdk';

export type BankLinkOutcome =
  | { kind: 'approved' }
  | { kind: 'left'; errorCode: string | null; displayMessage: string | null };

export class BankLink {
  static async present(token: string): Promise<BankLinkOutcome> {
    const { createPlaidLinkSession } = await import('react-native-plaid-link-sdk');
    return new Promise<BankLinkOutcome>((resolve, reject) => {
      createPlaidLinkSession({
        token,
        onSuccess: () => resolve({ kind: 'approved' }),
        onExit: (exit) => resolve(BankLink.left(exit)),
        onEvent: () => undefined,
      })
        .then((session) => session.open())
        .catch(reject);
    });
  }

  static left(exit: LinkExit): BankLinkOutcome {
    return {
      kind: 'left',
      errorCode: exit.error?.errorCode ?? null,
      displayMessage: exit.error?.displayMessage ?? null,
    };
  }
}
