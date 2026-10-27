export type TokenStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export class InstallScopedToken {
  static readonly installedKey = 'session.installed';

  private readonly secure: TokenStorage;
  private readonly appStorage: TokenStorage;
  private readonly key: string;

  constructor(secure: TokenStorage, appStorage: TokenStorage, key: string) {
    this.secure = secure;
    this.appStorage = appStorage;
    this.key = key;
  }

  async read(): Promise<string | null> {
    if ((await this.appStorage.getItem(InstallScopedToken.installedKey)) === null) {
      await this.secure.removeItem(this.key);
      return null;
    }
    return this.secure.getItem(this.key);
  }

  async write(token: string): Promise<void> {
    await this.appStorage.setItem(InstallScopedToken.installedKey, 'true');
    await this.secure.setItem(this.key, token);
  }

  clear(): Promise<void> {
    return this.secure.removeItem(this.key);
  }
}
