export function isUserCancel(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = 'code' in error ? String(error.code) : '';
  return code === 'ERR_USER_CANCELLED' || error.message === 'UserCancelled';
}
