import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 模擬「交易內查詢看不到別的路徑剛插入的記錄」：讓 readwrite 交易裡的 by-type-ref 查詢回 undefined，
 * 迫使 add() 走到 unique index 擋下 → ConstraintError → 回退查既有記錄的防線。
 */
const hooks = vi.hoisted(() => ({
  blindReadwriteLookup: false,
  failAdd: null as Error | null
}));

vi.mock('../../src/lib/storage/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/lib/storage/db')>();
  const wrapIndex = (index: object) => new Proxy(index, {
    get(t, k, r) {
      if (k === 'get' && hooks.blindReadwriteLookup) return async () => undefined;
      const v = Reflect.get(t, k, r);
      return typeof v === 'function' ? v.bind(t) : v;
    }
  });
  const wrapStore = (store: object) => new Proxy(store, {
    get(t, k, r) {
      if (k === 'index') return (name: string) => wrapIndex((t as { index(n: string): object }).index(name));
      if (k === 'add' && hooks.failAdd) {
        const err = hooks.failAdd;
        return async () => { throw err; };
      }
      const v = Reflect.get(t, k, r);
      return typeof v === 'function' ? v.bind(t) : v;
    }
  });
  const wrapTx = (tx: object) => new Proxy(tx, {
    get(t, k, r) {
      if (k === 'store') return wrapStore(Reflect.get(t, k, r) as object);
      const v = Reflect.get(t, k, r);
      return typeof v === 'function' ? v.bind(t) : v;
    }
  });
  return {
    ...real,
    getDB: async () => {
      const db = await real.getDB();
      return new Proxy(db, {
        get(t, k, r) {
          if (k === 'transaction') {
            return (store: never, mode?: IDBTransactionMode) => {
              const tx = t.transaction(store, mode);
              return mode === 'readwrite' ? wrapTx(tx) : tx;
            };
          }
          const v = Reflect.get(t, k, r);
          return typeof v === 'function' ? v.bind(t) : v;
        }
      });
    }
  };
});

import { FavoritesRepo } from '../../src/lib/storage/FavoritesRepo';
import { _resetForTests, getDB } from '../../src/lib/storage/db';

describe('FavoritesRepo.add — unique index 防線', () => {
  beforeEach(async () => {
    hooks.blindReadwriteLookup = false;
    hooks.failAdd = null;
    await _resetForTests();
  });

  it('交易內沒查到但 DB 已有同 (type, refId)：被 unique index 擋下後回傳既有記錄', async () => {
    const repo = new FavoritesRepo();
    const first = await repo.add({ type: 'sound', refId: 'rain' });
    hooks.blindReadwriteLookup = true;
    const again = await repo.add({ type: 'sound', refId: 'rain' });
    expect(again).toEqual(first);
    const db = await getDB();
    expect(await db.getAll('favorites')).toHaveLength(1);
  });

  it('寫入失敗且查無既有記錄時，把原始錯誤往外丟', async () => {
    hooks.failAdd = new Error('disk full');
    await expect(new FavoritesRepo().add({ type: 'sound', refId: 'rain' })).rejects.toThrow('disk full');
  });
});
