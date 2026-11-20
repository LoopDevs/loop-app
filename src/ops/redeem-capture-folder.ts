import type { Directory } from 'expo-file-system';

export class RedeemCaptureFolder {
  private static picked: Promise<Directory> | null = null;

  static choose(): Promise<Directory> {
    RedeemCaptureFolder.picked ??= import('expo-file-system')
      .then(({ Directory }) => Directory.pickDirectoryAsync())
      .catch((error: unknown) => {
        RedeemCaptureFolder.picked = null;
        throw error;
      });
    return RedeemCaptureFolder.picked;
  }

  static async save(name: string, content: string): Promise<void> {
    const folder = await RedeemCaptureFolder.choose();
    folder.createFile(name, 'text/html').write(content);
  }
}
