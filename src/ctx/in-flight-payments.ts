export class InFlightPayments {
  private readonly running = new Map<string, Promise<unknown>>();

  has(paymentId: string): boolean {
    return this.running.has(paymentId);
  }

  start<T>(paymentId: string, task: () => Promise<T>): Promise<T> | null {
    if (this.running.has(paymentId)) {
      return null;
    }
    const started = Promise.resolve()
      .then(task)
      .finally(() => this.running.delete(paymentId));
    this.running.set(paymentId, started);
    return started;
  }

  async settled(paymentId: string): Promise<void> {
    await this.running.get(paymentId)?.catch(() => undefined);
  }
}
