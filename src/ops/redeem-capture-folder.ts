import type { Directory } from 'expo-file-system';

import { RedeemCapture } from './redeem-capture.ts';

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

  static async save(name: string, content: string, mimeType = 'text/html'): Promise<void> {
    const folder = await RedeemCaptureFolder.choose();
    folder.createFile(name, mimeType).write(content);
  }

  static async saveTiming(name: string, timings: Record<string, string>, now = Date.now()): Promise<void> {
    if (!RedeemCapture.enabled) {
      return;
    }
    await RedeemCaptureFolder.save(
      RedeemCapture.timingFileName(name, now),
      JSON.stringify(timings, null, 2),
      'application/json',
    ).catch(() => undefined);
  }
}
