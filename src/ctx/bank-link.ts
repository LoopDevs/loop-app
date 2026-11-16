import type { LinkEvent, LinkExit, LinkSuccess } from 'react-native-plaid-link-sdk';

export type BankInstitution = {
  id: string;
  name: string;
};

export type BankLinkOutcome =
  | { kind: 'approved'; institution: BankInstitution | null }
  | { kind: 'left'; errorCode: string | null; displayMessage: string | null };

export type BankLinkProgress =
  | { step: 'choosingBank' }
  | { step: 'bankChosen'; bankName: string }
  | { step: 'atBank'; bankName: string | null }
  | { step: 'backFromBank' }
  | { step: 'confirming' }
  | { step: 'problem'; code: string };

export type BankLinkStep = 'opening' | 'choosing' | 'atBank' | 'confirming';

export class BankLink {
  static readonly returnPath = '/plaid/oauth';
  private static readonly returnPattern = /^(?:https:\/\/loopfinance\.io)?\/plaid\/oauth(?:[/?#]|$)/;

  static isReturn(path: string): boolean {
    return BankLink.returnPattern.test(path);
  }

  static async present(
    token: string,
    onProgress: (progress: BankLinkProgress) => void = () => undefined,
  ): Promise<BankLinkOutcome> {
    const { createPlaidLinkSession } = await import('react-native-plaid-link-sdk');
    const { holdCriticalReload } = await import('@/updates/update-checker');
    return holdCriticalReload(
      () =>
        new Promise<BankLinkOutcome>((resolve, reject) => {
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
        }),
    );
  }

  static approved(success: LinkSuccess): BankLinkOutcome {
    const institution = success.metadata.institution;
    return {
      kind: 'approved',
      institution: institution?.id && institution.name ? { id: institution.id, name: institution.name } : null,
    };
  }

  private static readonly bankListViews: readonly string[] = ['SELECT_INSTITUTION', 'SELECT_BRAND'];
  private static readonly resumedViews: readonly string[] = ['LOADING', 'CONNECTED'];
  private static readonly problemEvents: readonly string[] = [
    'ERROR',
    'FAIL_OAUTH',
    'SELECT_DOWN_INSTITUTION',
    'SELECT_DEGRADED_INSTITUTION',
    'SELECT_DENYLISTED_INSTITUTION',
  ];

  static progress(event: LinkEvent): BankLinkProgress | null {
    const name: string = event.eventName;
    const view: string = event.metadata.viewName;
    const bankName = event.metadata.institutionName || null;
    if (BankLink.problemEvents.includes(name) || (name === 'TRANSITION_VIEW' && view === 'ERROR')) {
      return { step: 'problem', code: event.metadata.errorCode || name };
    }
    if (name === 'OPEN_OAUTH' || (name === 'TRANSITION_VIEW' && view === 'OAUTH')) {
      return { step: 'atBank', bankName };
    }
    if (name === 'CLOSE_OAUTH' || name === 'HANDOFF') {
      return { step: 'confirming' };
    }
    if (name === 'TRANSITION_VIEW' && BankLink.resumedViews.includes(view)) {
      return { step: 'backFromBank' };
    }
    if (name === 'SELECT_INSTITUTION' && bankName) {
      return { step: 'bankChosen', bankName };
    }
    if (name === 'SEARCH_INSTITUTION' || (name === 'TRANSITION_VIEW' && BankLink.bankListViews.includes(view))) {
      return { step: 'choosingBank' };
    }
    return null;
  }

  static next(current: BankLinkStep, progress: BankLinkProgress): BankLinkStep {
    switch (progress.step) {
      case 'choosingBank':
        return current === 'opening' ? 'choosing' : current;
      case 'bankChosen':
        return current === 'choosing' ? 'opening' : current;
      case 'atBank':
        return 'atBank';
      case 'backFromBank':
        return current === 'atBank' ? 'confirming' : current;
      case 'confirming':
        return 'confirming';
      case 'problem':
        return current;
    }
  }

  static left(exit: LinkExit): BankLinkOutcome {
    return {
      kind: 'left',
      errorCode: exit.error?.errorCode ?? null,
      displayMessage: exit.error?.displayMessage ?? null,
    };
  }
}
