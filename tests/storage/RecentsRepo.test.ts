import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecentsRepo, MAX_RECENTS } from '../../src/lib/storage/RecentsRepo';
import { _resetForTests } from '../../src/lib/storage/db';

describe('RecentsRepo', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  it('push() records a play and listRecent() returns it newest-first', async () => {
    const repo = new RecentsRepo();
    await repo.push('sound', 'ocean');
    await new Promise((r) => setTimeout(r, 5));
    await repo.push('story', 'seaside-walk');
    const list = await repo.listRecent();
    expect(list).toHaveLength(2);
    expect(list[0]?.refId).toBe('seaside-walk');
    expect(list[1]?.refId).toBe('ocean');
  });

  it('truncates beyond MAX_RECENTS', async () => {
    const repo = new RecentsRepo();
    for (let i = 0; i < MAX_RECENTS + 5; i++) {
      await repo.push('sound', `s-${i}`);
      await new Promise((r) => setTimeout(r, 1));
    }
    const list = await repo.listRecent();
    expect(list.length).toBe(MAX_RECENTS);
    expect(list[0]?.refId).toBe(`s-${MAX_RECENTS + 4}`);
    // 被截掉的必須是最舊的 5 筆
    expect(list.map((r) => r.refId)).toEqual(
      Array.from({ length: MAX_RECENTS }, (_, i) => `s-${MAX_RECENTS + 4 - i}`)
    );
  });

  it('MAX_RECENTS 為 20', () => {
    expect(MAX_RECENTS).toBe(20);
  });

  it('同一毫秒內連續播放仍嚴格依播放順序排列（playedAt 單調遞增）', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(4_000_000_000_000);
    const repo = new RecentsRepo();
    await repo.push('sound', 'a');
    await repo.push('sound', 'b');
    await repo.push('sound', 'c');
    const list = await repo.listRecent();
    expect(list.map((r) => r.refId)).toEqual(['c', 'b', 'a']);
    expect(list.map((r) => r.playedAt)).toEqual([4_000_000_000_002, 4_000_000_000_001, 4_000_000_000_000]);
    now.mockRestore();
  });

  it('系統時間倒退時 playedAt 仍持續遞增', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(5_000_000_000_000);
    const repo = new RecentsRepo();
    await repo.push('sound', 'a');
    now.mockReturnValue(4_999_999_999_000);
    await repo.push('sound', 'b');
    const [b, a] = await repo.listRecent();
    expect(b!.refId).toBe('b');
    expect(b!.playedAt).toBe(a!.playedAt + 1);
    now.mockRestore();
  });

  it('時間正常前進時直接採用當下時間', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(6_000_000_000_000);
    const repo = new RecentsRepo();
    await repo.push('sound', 'a');
    now.mockReturnValue(6_000_000_005_000);
    await repo.push('sound', 'b');
    expect((await repo.listRecent()).map((r) => r.playedAt)).toEqual([6_000_000_005_000, 6_000_000_000_000]);
    now.mockRestore();
  });

  it('同 refId 不同 type 不視為重複', async () => {
    const repo = new RecentsRepo();
    await repo.push('story', 'a');
    await repo.push('sound', 'a');
    const list = await repo.listRecent();
    expect(list.map((r) => `${r.type}:${r.refId}`)).toEqual(['sound:a', 'story:a']);
  });

  it('clear() 清空所有最近播放', async () => {
    const repo = new RecentsRepo();
    await repo.push('sound', 'a');
    await repo.push('story', 'b');
    await repo.clear();
    expect(await repo.listRecent()).toEqual([]);
  });

  it('pushing same refId again moves it to top (no duplicates)', async () => {
    const repo = new RecentsRepo();
    await repo.push('sound', 'ocean');
    await repo.push('sound', 'rain');
    await repo.push('sound', 'ocean');
    const list = await repo.listRecent();
    expect(list).toHaveLength(2);
    expect(list[0]?.refId).toBe('ocean');
  });

  it('removeByRef() removes only matching type+refId, preserves others', async () => {
    const repo = new RecentsRepo();
    await repo.push('story', 'a');
    await repo.push('sound', 'a');
    await repo.push('story', 'b');
    await repo.removeByRef('story', 'a');
    const list = await repo.listRecent();
    expect(list.map((r) => `${r.type}:${r.refId}`).sort()).toEqual(['sound:a', 'story:b']);
  });
});
