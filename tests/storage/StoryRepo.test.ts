import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoryRepo } from '../../src/lib/storage/StoryRepo';
import { _resetForTests, getDB } from '../../src/lib/storage/db';

describe('StoryRepo', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  it('save() creates a new story when no id provided', async () => {
    const repo = new StoryRepo();
    const story = await repo.save({
      name: 'My Story',
      segments: [{ soundId: 'rain', durationSec: 60, crossfadeSec: 5, volume: 0.7 }]
    });
    expect(story.id).toBeDefined();
    expect(story.nameKey).toBe('My Story');
    expect(story.builtin).toBe(false);
    expect(story.totalDurationSec).toBe(60);
    expect(story.createdAt).toBeGreaterThan(0);
    expect(story.updatedAt).toBe(story.createdAt);
  });

  it('save() updates existing when id matches', async () => {
    const repo = new StoryRepo();
    const created = await repo.save({ name: 'A', segments: [] });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.save({ id: created.id, name: 'B', segments: [] });
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBeGreaterThan(created.createdAt);
    expect(updated.nameKey).toBe('B');
  });

  it('listAll() sorts by updatedAt desc', async () => {
    const repo = new StoryRepo();
    const a = await repo.save({ name: 'A', segments: [] });
    await new Promise((r) => setTimeout(r, 5));
    await repo.save({ name: 'B', segments: [] });
    await new Promise((r) => setTimeout(r, 5));
    await repo.save({ id: a.id, name: 'A-updated', segments: [] });
    const all = await repo.listAll();
    expect(all[0]?.nameKey).toBe('A-updated');
  });

  it('delete() removes by id', async () => {
    const repo = new StoryRepo();
    const s = await repo.save({ name: 'X', segments: [] });
    await repo.delete(s.id);
    expect(await repo.getById(s.id)).toBeUndefined();
  });

  it('save() deep-clones segments so reactive proxies survive IDB structured clone', async () => {
    const repo = new StoryRepo();
    const input = [{ soundId: 'rain', durationSec: 60, crossfadeSec: 5, volume: 0.7 }];
    const story = await repo.save({ name: 'X', segments: input });
    expect(story.segments).not.toBe(input);
    expect(story.segments).toEqual(input);
  });

  it('listAll() 略過格式無效的記錄，保留合法記錄', async () => {
    const repo = new StoryRepo();
    const good = await repo.save({
      name: 'Good',
      segments: [{ soundId: 'rain', durationSec: 60, crossfadeSec: 5, volume: 0.7 }]
    });
    // 直接塞一筆毀損記錄（segment.volume 非法），繞過 save()
    const db = await getDB();
    await db.put('customStories', {
      id: 'corrupt',
      nameKey: 'Bad',
      description: '',
      builtin: false,
      segments: [{ soundId: 'rain', durationSec: 60, crossfadeSec: 5, volume: 99 }],
      totalDurationSec: 60,
      createdAt: 1,
      updatedAt: 1
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const all = await repo.listAll();
    expect(all.map((s) => s.id)).toEqual([good.id]);
    expect(await repo.getById('corrupt')).toBeUndefined();
    warn.mockRestore();
  });

  describe('讀回時的 runtime 驗證與正規化（validateRecord）', () => {
    const seg = { soundId: 'rain', durationSec: 60, crossfadeSec: 5, volume: 0.7 };

    async function putRaw(row: Record<string, unknown>) {
      const db = await getDB();
      // 刻意繞過型別，模擬舊版本或手動改壞的資料
      await db.put('customStories', row as never);
    }

    it('缺欄位時補預設：nameKey/description 為空字串、時間戳為 0、總長由段落推算、builtin 強制 false', async () => {
      await putRaw({ id: 'legacy', builtin: true, segments: [seg, { ...seg, durationSec: 30 }], extra: 'x' });
      const r = await new StoryRepo().getById('legacy');
      expect(r).toEqual({
        id: 'legacy',
        nameKey: '',
        description: '',
        builtin: false,
        segments: [seg, { ...seg, durationSec: 30 }],
        totalDurationSec: 90,
        createdAt: 0,
        updatedAt: 0
      });
    });

    it('欄位型別錯誤時同樣退回預設值', async () => {
      await putRaw({
        id: 'typo', nameKey: 42, description: ['x'], segments: [seg],
        totalDurationSec: 'long', createdAt: '2026', updatedAt: null
      });
      const r = await new StoryRepo().getById('typo');
      expect(r).toMatchObject({ nameKey: '', description: '', totalDurationSec: 60, createdAt: 0, updatedAt: 0 });
    });

    it('totalDurationSec 非有限數（NaN/Infinity 經 structured clone 保留）時由段落推算', async () => {
      await putRaw({ id: 'nan', segments: [seg], totalDurationSec: NaN });
      await putRaw({ id: 'inf', segments: [seg], totalDurationSec: Infinity });
      const repo = new StoryRepo();
      expect((await repo.getById('nan'))?.totalDurationSec).toBe(60);
      expect((await repo.getById('inf'))?.totalDurationSec).toBe(60);
    });

    it('合法欄位原樣保留', async () => {
      await putRaw({
        id: 'ok', nameKey: '名', description: '述', builtin: false, segments: [seg],
        totalDurationSec: 999, createdAt: 10, updatedAt: 20
      });
      expect(await new StoryRepo().getById('ok')).toEqual({
        id: 'ok', nameKey: '名', description: '述', builtin: false, segments: [seg],
        totalDurationSec: 999, createdAt: 10, updatedAt: 20
      });
    });

    it('getById 遇到無效記錄時回 undefined 並 warn，不丟例外', async () => {
      await putRaw({ id: 'bad', segments: 'nope' });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(new StoryRepo().getById('bad')).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith('自訂夜讀 bad 格式無效，已略過', expect.objectContaining({ message: 'segments 必須是陣列' }));
      warn.mockRestore();
    });

    it('id 為空字串或非字串（IDB 允許數字 key）的記錄視為無效', async () => {
      await putRaw({ id: '', segments: [seg] });
      await putRaw({ id: 42, segments: [seg] });
      await putRaw({ id: 'ok', segments: [seg] });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const all = await new StoryRepo().listAll();
      expect(all.map((s) => s.id)).toEqual(['ok']);
      expect(warn).toHaveBeenCalledTimes(2);
      for (const call of warn.mock.calls) {
        expect(call).toEqual(['自訂夜讀記錄格式無效，已略過', expect.objectContaining({ message: 'story record: id 無效' })]);
      }
      warn.mockRestore();
    });

    it('listAll 對每筆無效記錄各 warn 一次，並依 updatedAt 新到舊排序合法記錄', async () => {
      await putRaw({ id: 'a', segments: [seg], updatedAt: 1 });
      await putRaw({ id: 'b', segments: [seg], updatedAt: 3 });
      await putRaw({ id: 'c', segments: [seg], updatedAt: 2 });
      await putRaw({ id: 'x1', segments: [{ ...seg, durationSec: 0 }] });
      await putRaw({ id: 'x2' });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const all = await new StoryRepo().listAll();
      expect(all.map((s) => s.id)).toEqual(['b', 'c', 'a']);
      expect(warn).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });

    it('getById 對不存在的 id 回 undefined 且不 warn', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(await new StoryRepo().getById('nope')).toBeUndefined();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  it('save() 新記錄 description 為空、builtin 為 false，總長為所有段落加總', async () => {
    const repo = new StoryRepo();
    const s = await repo.save({
      name: 'Multi',
      segments: [
        { soundId: 'rain', durationSec: 60, crossfadeSec: 5, volume: 0.7 },
        { soundId: 'ocean', durationSec: 45, crossfadeSec: 5, volume: 0.7 }
      ]
    });
    expect(s.description).toBe('');
    expect(s.totalDurationSec).toBe(105);
    expect(await repo.getById(s.id)).toEqual(s);
  });
});
