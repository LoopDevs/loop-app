export type TokenStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export class InstallScopedToken {
  private readonly secure: TokenStorage;
  private readonly appStorage: TokenStorage;
  private readonly key: string;
  private readonly installedKey: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(secure: TokenStorage, appStorage: TokenStorage, key: string) {
    this.secure = secure;
    this.appStorage = appStorage;
    this.key = key;
    this.installedKey = `${key}.installed`;
  }

  read(): Promise<string | null> {
    return this.inTurn(async () => {
      if ((await this.appStorage.getItem(this.installedKey)) === null) {
        await this.secure.removeItem(this.key);
        return null;
      }
      return this.secure.getItem(this.key);
    });
  }

  write(token: string): Promise<void> {
    return this.inTurn(async () => {
      await this.appStorage.setItem(this.installedKey, 'true');
      await this.secure.setItem(this.key, token);
    });
  }

  clear(): Promise<void> {
    return this.inTurn(() => this.secure.removeItem(this.key));
  }

  private inTurn<T>(task: () => Promise<T>): Promise<T> {
    const turn = this.queue.then(task, task);
    this.queue = turn.catch(() => undefined);
    return turn;
  }
}
