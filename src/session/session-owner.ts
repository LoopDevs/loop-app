export class SessionOwner {
  private seen = false;
  private userId: string | null = null;

  changed(next: string | null): boolean {
    const differs = this.seen && this.userId !== next;
    this.seen = true;
    this.userId = next;
    return differs;
  }
}
