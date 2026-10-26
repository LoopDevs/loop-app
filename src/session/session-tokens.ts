export class SessionTokens {
  private generation = 0;
  private accessToken: string | null = null;

  current(): number {
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  token(): string | null {
    return this.accessToken;
  }

  begin(): number {
    this.generation += 1;
    this.accessToken = null;
    return this.generation;
  }

  adopt(generation: number, accessToken: string): boolean {
    if (!this.isCurrent(generation)) {
      return false;
    }
    this.accessToken = accessToken;
    return true;
  }

  reject(generation: number, accessToken: string): boolean {
    if (!this.isCurrent(generation)) {
      return false;
    }
    if (this.accessToken === accessToken) {
      this.accessToken = null;
    }
    return true;
  }
}
