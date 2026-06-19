import { describe, it, expect, beforeEach } from 'vitest';
import { openDB } from 'idb';
import { FavoritesRepo } from '../../src/lib/storage/FavoritesRepo';
import { _resetForTests, getDB, DB_NAME } from '../../src/lib/storage/db';

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

  it('add() 並發同一 (type, refId) 只會留下一筆（交易序列化 + unique index 封掉競態）', async () => {
    const repo = new FavoritesRepo();
    const [r1, r2] = await Promise.all([
      repo.add({ type: 'sound', refId: 'rain' }),
      repo.add({ type: 'sound', refId: 'rain' })
    ]);
    expect(r1.id).toBe(r2.id);
    expect(await repo.listAll()).toHaveLength(1);
  });

  it('v1→v2 migration 去重既有資料並建立 unique index 從 DB 層強制唯一', async () => {
    // 模擬舊版 v1：favorites 無 by-type-ref，且塞入重複 (type, refId)
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        const s = db.createObjectStore('favorites', { keyPath: 'id' });
        s.createIndex('by-type', 'type');
        s.createIndex('by-added', 'addedAt');
      }
    });
    await v1.put('favorites', { id: 'a', type: 'sound', refId: 'ocean', addedAt: 1 });
    await v1.put('favorites', { id: 'b', type: 'sound', refId: 'ocean', addedAt: 2 });
    await v1.put('favorites', { id: 'c', type: 'story', refId: 'ocean', addedAt: 3 });
    v1.close();

    // getDB 固定開 v2 → 觸發 migration：去重 + 建 unique index
    const db = await getDB();
    const all = await db.getAll('favorites');
    expect(all.map((f) => `${f.type}:${f.refId}`).sort()).toEqual(['sound:ocean', 'story:ocean']);

    // DB 層強制唯一：直接插入重複 (type, refId) 會被 unique index 擋下
    await expect(
      db.add('favorites', { id: 'z', type: 'sound', refId: 'ocean', addedAt: 9 })
    ).rejects.toThrow();
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
