import { describe, it, expect, beforeEach } from 'vitest';
import { FavoritesRepo } from '../../src/lib/storage/FavoritesRepo';
import { _resetForTests } from '../../src/lib/storage/db';

describe('FavoritesRepo', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  it('add() and listAll() round-trip a favorite', async () => {
    const repo = new FavoritesRepo();
    await repo.add({ type: 'sound', refId: 'ocean' });
    const all = await repo.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ type: 'sound', refId: 'ocean' });
    expect(all[0]?.id).toBeDefined();
    expect(all[0]?.addedAt).toBeGreaterThan(0);
  });

  it('remove() deletes by id', async () => {
    const repo = new FavoritesRepo();
    const fav = await repo.add({ type: 'mix', refId: 'mix-1' });
    await repo.remove(fav.id);
    expect(await repo.listAll()).toHaveLength(0);
  });

  it('isFavorite() returns true for stored ref', async () => {
    const repo = new FavoritesRepo();
    await repo.add({ type: 'sound', refId: 'rain' });
    expect(await repo.isFavorite('sound', 'rain')).toBe(true);
    expect(await repo.isFavorite('sound', 'ocean')).toBe(false);
  });

  it('listByType filters', async () => {
    const repo = new FavoritesRepo();
    await repo.add({ type: 'sound', refId: 'ocean' });
    await repo.add({ type: 'story', refId: 'seaside-walk' });
    const sounds = await repo.listByType('sound');
    expect(sounds).toHaveLength(1);
    expect(sounds[0]?.refId).toBe('ocean');
  });

  it('listAll sorts newest first', async () => {
    const repo = new FavoritesRepo();
    await repo.add({ type: 'sound', refId: 'a' });
    await new Promise((r) => setTimeout(r, 5));
    await repo.add({ type: 'sound', refId: 'b' });
    const all = await repo.listAll();
    expect(all[0]?.refId).toBe('b');
    expect(all[1]?.refId).toBe('a');
  });

  it('add() 對同一 (type, refId) 去重，回傳既有記錄不新增', async () => {
    const repo = new FavoritesRepo();
    const first = await repo.add({ type: 'sound', refId: 'ocean' });
    const again = await repo.add({ type: 'sound', refId: 'ocean' });
    expect(again.id).toBe(first.id);
    expect(await repo.listAll()).toHaveLength(1);
    // 不同 type 但同 refId 視為不同收藏
    await repo.add({ type: 'story', refId: 'ocean' });
    expect(await repo.listAll()).toHaveLength(2);
  });

  it('removeByRef() removes only matching type+refId, preserves others', async () => {
    const repo = new FavoritesRepo();
    await repo.add({ type: 'story', refId: 'a' });
    await repo.add({ type: 'sound', refId: 'a' });
    await repo.add({ type: 'story', refId: 'b' });
    await repo.removeByRef('story', 'a');
    const list = await repo.listAll();
    expect(list.map((f) => `${f.type}:${f.refId}`).sort()).toEqual(['sound:a', 'story:b']);
  });
});
