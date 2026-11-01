type NavigatorState = { type?: string; index: number } | undefined;

export class ScrollMemory {
  private offset: number | null = null;

  static coveredBy(focused: NavigatorState, current: NavigatorState): boolean {
    return focused?.type === 'stack' && current?.type === 'stack' && current.index > focused.index;
  }

  leave(covered: boolean, offset: number | null): void {
    this.offset = covered ? offset : null;
  }

  arrive(): number | null {
    const offset = this.offset;
    this.offset = null;
    return offset;
  }
}
