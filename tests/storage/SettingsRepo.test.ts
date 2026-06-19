import { describe, it, expect, beforeEach } from 'vitest';
import { SettingsRepo, DEFAULT_SETTINGS } from '../../src/lib/storage/SettingsRepo';
import { _resetForTests } from '../../src/lib/storage/db';

describe('SettingsRepo', () => {
  beforeEach(async () => {
    await _resetForTests();
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
});
