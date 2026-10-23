import { describe, it, expect, beforeEach } from 'vitest';
import { getDB, DB_NAME, DB_VERSION, OBJECT_STORES, _resetForTests } from '../../src/lib/storage/db';

describe('db', () => {
  beforeEach(async () => {
    // 必須連同 getDB 快取的連線一起重置，upgrade 才會在每個測試裡重新執行
    await _resetForTests();
  });

  it('opens DB with the configured version and stores', async () => {
    const db = await getDB();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    for (const store of OBJECT_STORES) {
      expect(db.objectStoreNames.contains(store)).toBe(true);
    }
  });

  it('DB 名稱與版本固定（改名會讓既有使用者的資料全部消失）', () => {
    expect(DB_NAME).toBe('whitenoise-app');
    expect(DB_VERSION).toBe(2);
  });

  it('returns the same instance on subsequent calls', async () => {
    const db1 = await getDB();
    const db2 = await getDB();
    expect(db1).toBe(db2);
  });

  it('全新安裝直接建立 v2 schema：各 store 的 keyPath 與索引（schema 契約，改動必須寫 migration）', async () => {
    const db = await getDB();
    const tx = db.transaction([...OBJECT_STORES]);
    const shape = Object.fromEntries(OBJECT_STORES.map((name) => {
      const store = tx.objectStore(name);
      const indexes = Object.fromEntries([...store.indexNames].map((i) => {
        const idx = store.index(i);
        return [i, { keyPath: idx.keyPath, unique: idx.unique }];
      }));
      return [name, { keyPath: store.keyPath, indexes }];
    }));
    expect(shape).toEqual({
      customStories: { keyPath: 'id', indexes: { 'by-updated': { keyPath: 'updatedAt', unique: false } } },
      favorites: {
        keyPath: 'id',
        indexes: {
          'by-type': { keyPath: 'type', unique: false },
          'by-added': { keyPath: 'addedAt', unique: false },
          'by-type-ref': { keyPath: ['type', 'refId'], unique: true }
        }
      },
      mixes: { keyPath: 'id', indexes: { 'by-created': { keyPath: 'createdAt', unique: false } } },
      recents: { keyPath: 'id', indexes: { 'by-played': { keyPath: 'playedAt', unique: false } } },
      settings: { keyPath: 'key', indexes: {} }
    });
  });
});
