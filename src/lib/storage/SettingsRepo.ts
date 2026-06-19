import { getDB } from './db';

export interface AppSettings {
  defaultTimerMin?: number;
  fadeOutOnTimerSec: number;
  masterVolume: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  fadeOutOnTimerSec: 30,
  masterVolume: 0.7
};

const SETTINGS_KEY = 'app';

export class SettingsRepo {
  /** 串行化寫入：避免並發 save 各自 load 後互相覆蓋造成 lost update */
  private writeChain: Promise<void> = Promise.resolve();

  async load(): Promise<AppSettings> {
    const db = await getDB();
    const row = await db.get('settings', SETTINGS_KEY);
    if (!row) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(row.value as Partial<AppSettings>) };
  }

  save(patch: Partial<AppSettings>): Promise<void> {
    const next = this.writeChain.then(async () => {
      const db = await getDB();
      const current = await this.load();
      const merged = { ...current, ...patch };
      await db.put('settings', { key: SETTINGS_KEY, value: merged });
    });
    // 鏈不因單次失敗而中斷後續寫入
    this.writeChain = next.catch(() => {});
    return next;
  }
}

export const settingsRepo = new SettingsRepo();
