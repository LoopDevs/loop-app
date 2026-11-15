export class SignInGate {
  static next(previous: boolean | null, current: boolean): boolean {
    if (previous === null) {
      return current;
    }
    return previous && current;
  }
}
