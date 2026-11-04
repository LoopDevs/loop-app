import type { LinkEvent, LinkExit, LinkSuccess } from 'react-native-plaid-link-sdk';

export type BankInstitution = {
  id: string;
  name: string;
};

export type BankLinkOutcome =
  | { kind: 'approved'; institution: BankInstitution | null }
  | { kind: 'left'; errorCode: string | null; displayMessage: string | null };

export type BankLinkProgress = { step: 'atBank'; bankName: string | null } | { step: 'backFromBank' };

export class BankLink {
  static async present(
    token: string,
    onProgress: (progress: BankLinkProgress) => void = () => undefined,
  ): Promise<BankLinkOutcome> {
    const { createPlaidLinkSession } = await import('react-native-plaid-link-sdk');
    return new Promise<BankLinkOutcome>((resolve, reject) => {
      createPlaidLinkSession({
        token,
        onSuccess: (success) => resolve(BankLink.approved(success)),
        onExit: (exit) => resolve(BankLink.left(exit)),
        onEvent: (event) => {
          const progress = BankLink.progress(event);
          if (progress) {
            onProgress(progress);
          }
        },
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

  static progress(event: LinkEvent): BankLinkProgress | null {
    const name: string = event.eventName;
    const view: string = event.metadata.viewName;
    if (name === 'OPEN_OAUTH' || (name === 'TRANSITION_VIEW' && view === 'OAUTH')) {
      return { step: 'atBank', bankName: event.metadata.institutionName || null };
    }
    if (name === 'CLOSE_OAUTH' || (name === 'TRANSITION_VIEW' && (view === 'LOADING' || view === 'CONNECTED'))) {
      return { step: 'backFromBank' };
    }
    return null;
  }

  static left(exit: LinkExit): BankLinkOutcome {
    return {
      kind: 'left',
      errorCode: exit.error?.errorCode ?? null,
      displayMessage: exit.error?.displayMessage ?? null,
    };
  }
}
