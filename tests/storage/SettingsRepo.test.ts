import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsRepo, DEFAULT_SETTINGS } from '../../src/lib/storage/SettingsRepo';
import { _resetForTests, getDB } from '../../src/lib/storage/db';

describe('SettingsRepo', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  it('預設值：計時淡出 30 秒、主音量 0.7、不預設計時時長', () => {
    expect(DEFAULT_SETTINGS).toEqual({ fadeOutOnTimerSec: 30, masterVolume: 0.7 });
  });

  it('load() returns defaults when nothing stored', async () => {
    const repo = new SettingsRepo();
    const s = await repo.load();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('save() and load() round-trip', async () => {
    const repo = new SettingsRepo();
    await repo.save({ masterVolume: 0.5, fadeOutOnTimerSec: 15 });
    const s = await repo.load();
    expect(s.masterVolume).toBe(0.5);
    expect(s.fadeOutOnTimerSec).toBe(15);
  });

  it('partial save merges with existing', async () => {
    const repo = new SettingsRepo();
    await repo.save({ masterVolume: 0.5 });
    await repo.save({ defaultTimerMin: 30 });
    const s = await repo.load();
    expect(s.masterVolume).toBe(0.5);
    expect(s.defaultTimerMin).toBe(30);
  });

  it('並發 save 不會互相覆蓋（串行化避免 lost update）', async () => {
    const repo = new SettingsRepo();
    // 不 await，讓三個寫入同時飛出去：若各自 load→merge→put 會互相蓋掉
    await Promise.all([
      repo.save({ masterVolume: 0.3 }),
      repo.save({ fadeOutOnTimerSec: 15 }),
      repo.save({ defaultTimerMin: 45 })
    ]);
    const s = await repo.load();
    expect(s.masterVolume).toBe(0.3);
    expect(s.fadeOutOnTimerSec).toBe(15);
    expect(s.defaultTimerMin).toBe(45);
  });

  it('load() 回傳的預設值是複本，修改不會污染 DEFAULT_SETTINGS', async () => {
    const repo = new SettingsRepo();
    const s = await repo.load();
    s.masterVolume = 0.01;
    expect(DEFAULT_SETTINGS.masterVolume).toBe(0.7);
    expect((await repo.load()).masterVolume).toBe(0.7);
  });

  it('load() 對舊版只存了部分欄位的記錄補上預設值', async () => {
    const db = await getDB();
    await db.put('settings', { key: 'app', value: { masterVolume: 0.2 } });
    const s = await new SettingsRepo().load();
    expect(s).toEqual({ ...DEFAULT_SETTINGS, masterVolume: 0.2 });
  });

  it('以固定 key "app" 存成單筆記錄', async () => {
    await new SettingsRepo().save({ masterVolume: 0.4 });
    const db = await getDB();
    const rows = await db.getAll('settings');
    expect(rows).toEqual([{ key: 'app', value: { ...DEFAULT_SETTINGS, masterVolume: 0.4 } }]);
  });

  it('單次寫入失敗會回報給呼叫端，但不中斷之後排隊的寫入', async () => {
    const repo = new SettingsRepo();
    const load = vi.spyOn(repo, 'load').mockRejectedValueOnce(new Error('quota'));
    const failed = repo.save({ masterVolume: 0.1 });
    const next = repo.save({ fadeOutOnTimerSec: 5 });
    await expect(failed).rejects.toThrow('quota');
    await expect(next).resolves.toBeUndefined();
    load.mockRestore();
    const s = await repo.load();
    expect(s.fadeOutOnTimerSec).toBe(5);
    expect(s.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
  });
});
