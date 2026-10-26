type Refreshing = {
  generation: number;
  accessToken: Promise<string | null>;
};

export class SessionTokens {
  private generation = 0;
  private accessToken: string | null = null;
  private refreshing: Refreshing | null = null;

  refreshOnce(generation: number, rotate: () => Promise<string | null>): Promise<string | null> {
    if (this.refreshing?.generation === generation) {
      return this.refreshing.accessToken;
    }
    const accessToken: Promise<string | null> = rotate().finally(() => {
      if (this.refreshing?.accessToken === accessToken) {
        this.refreshing = null;
      }
    });
    this.refreshing = { generation, accessToken };
    return accessToken;
  }

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
