import type { LinkExit, LinkSuccess } from 'react-native-plaid-link-sdk';

export type BankInstitution = {
  id: string;
  name: string;
};

export type BankLinkOutcome =
  | { kind: 'approved'; institution: BankInstitution | null }
  | { kind: 'left'; errorCode: string | null; displayMessage: string | null };

export class BankLink {
  static async present(token: string): Promise<BankLinkOutcome> {
    const { createPlaidLinkSession } = await import('react-native-plaid-link-sdk');
    return new Promise<BankLinkOutcome>((resolve, reject) => {
      createPlaidLinkSession({
        token,
        onSuccess: (success) => resolve(BankLink.approved(success)),
        onExit: (exit) => resolve(BankLink.left(exit)),
        onEvent: () => undefined,
      })
        .then((session) => session.open())
        .catch(reject);
    });
  }

  static approved(success: LinkSuccess): BankLinkOutcome {
    const institution = success.metadata.institution;
    return {
      kind: 'approved',
      institution: institution?.id && institution.name ? { id: institution.id, name: institution.name } : null,
    };
  }

  static left(exit: LinkExit): BankLinkOutcome {
    return {
      kind: 'left',
      errorCode: exit.error?.errorCode ?? null,
      displayMessage: exit.error?.displayMessage ?? null,
    };
  }
}
