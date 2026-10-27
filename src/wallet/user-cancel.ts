export class UserCancelled extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserCancelled';
  }
}

export function isUserCancel(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = 'code' in error ? String(error.code) : '';
  return (
    error instanceof UserCancelled ||
    code === 'ERR_USER_CANCELLED' ||
    error.message === 'UserCancelled' ||
    error.name === 'NotAllowedError'
  );
}
