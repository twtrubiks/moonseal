import { describe, it, expect, beforeEach } from 'vitest';
import { MixRepo } from '../../src/lib/storage/MixRepo';
import { _resetForTests, getDB } from '../../src/lib/storage/db';

describe('MixRepo', () => {
  beforeEach(async () => {
    await _resetForTests();
  });

  it('save() and getById() round-trip a mix', async () => {
    const repo = new MixRepo();
    const created = await repo.save({
      name: 'Cozy night',
      tracks: [{ soundId: 'rain', volume: 0.6 }, { soundId: 'fireplace', volume: 0.4 }]
    });
    const found = await repo.getById(created.id);
    expect(found?.name).toBe('Cozy night');
    expect(found?.tracks).toHaveLength(2);
  });

  it('listAll() sorts newest first', async () => {
    const repo = new MixRepo();
    await repo.save({ name: 'A', tracks: [] });
    await new Promise((r) => setTimeout(r, 5));
    await repo.save({ name: 'B', tracks: [] });
    const all = await repo.listAll();
    expect(all[0]?.name).toBe('B');
  });

  it('save() 帶既有 id 時覆寫內容但保留 createdAt', async () => {
    const repo = new MixRepo();
    const created = await repo.save({ name: 'A', tracks: [{ soundId: 'rain', volume: 0.5 }] });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.save({ id: created.id, name: 'A2', tracks: [] });
    expect(updated).toEqual({ id: created.id, name: 'A2', tracks: [], createdAt: created.createdAt });
    expect(await repo.getById(created.id)).toEqual(updated);
    expect(await repo.listAll()).toHaveLength(1);
  });

  it('save() 帶新 id 時以該 id 建立並記錄目前時間', async () => {
    const repo = new MixRepo();
    const before = Date.now();
    const m = await repo.save({ id: 'fixed-id', name: 'X', tracks: [] });
    expect(m.id).toBe('fixed-id');
    expect(m.createdAt).toBeGreaterThanOrEqual(before);
    expect(m.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it('listAll 依 createdAt 新到舊排序（與 key 順序無關）', async () => {
    const db = await getDB();
    await db.put('mixes', { id: 'a', name: 'A', tracks: [], createdAt: 1 });
    await db.put('mixes', { id: 'b', name: 'B', tracks: [], createdAt: 3 });
    await db.put('mixes', { id: 'c', name: 'C', tracks: [], createdAt: 2 });
    expect((await new MixRepo().listAll()).map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('delete() removes a mix', async () => {
    const repo = new MixRepo();
    const m = await repo.save({ name: 'Test', tracks: [] });
    await repo.delete(m.id);
    expect(await repo.getById(m.id)).toBeUndefined();
  });
});
