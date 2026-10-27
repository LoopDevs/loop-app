type Pending<T> = {
  userId: string;
  result: Promise<T>;
};

export class WalletCreation<T> {
  private pending: Pending<T> | null = null;

  start(userId: string, result: Promise<T>): void {
    const pending = { userId, result };
    this.pending = pending;
    result
      .catch((error: unknown) => {
        console.warn('Wallet setup failed', error);
      })
      .finally(() => {
        if (this.pending === pending) {
          this.pending = null;
        }
      });
  }

  async settled(userId: string): Promise<void> {
    if (this.pending?.userId === userId) {
      await this.pending.result;
    }
  }
}
