import { getDB, type FavoriteRecord } from './db';
import { uuid } from '../util/uuid';

export type FavoriteType = FavoriteRecord['type'];

export interface AddFavoriteInput {
  type: FavoriteType;
  refId: string;
}

export class FavoritesRepo {
  /**
   * (type, refId) 唯一：已存在就回傳既有記錄，不重複新增。
   * 「查既有→沒有才寫入」放在同一個 readwrite 交易內完成——IndexedDB 會把範圍重疊的
   * readwrite 交易序列化，並發 add 不會兩邊都查無而各插一筆。DB 的 by-type-ref unique
   * index 為最終防線：萬一仍有外部路徑搶插，會以 ConstraintError abort，這裡回退查既有記錄。
   */
  async add(input: AddFavoriteInput): Promise<FavoriteRecord> {
    const db = await getDB();
    const key: [FavoriteType, string] = [input.type, input.refId];
    const tx = db.transaction('favorites', 'readwrite');
    const existing = await tx.store.index('by-type-ref').get(key);
    if (existing) {
      await tx.done;
      return existing;
    }
    const record: FavoriteRecord = {
      id: uuid(),
      type: input.type,
      refId: input.refId,
      addedAt: Date.now()
    };
    try {
      await tx.store.add(record);
      await tx.done;
      return record;
    } catch (e) {
      void tx.done.catch(() => { /* add 失敗交易已 abort，吞掉連帶的 reject */ });
      const again = await db.transaction('favorites').store.index('by-type-ref').get(key);
      if (again) return again;
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('favorites', id);
  }

  async listAll(): Promise<FavoriteRecord[]> {
    const db = await getDB();
    const all = await db.getAll('favorites');
    return all.sort((a, b) => b.addedAt - a.addedAt);
  }

  async listByType(type: FavoriteType): Promise<FavoriteRecord[]> {
    const all = await this.listAll();
    return all.filter((f) => f.type === type);
  }

  async isFavorite(type: FavoriteType, refId: string): Promise<boolean> {
    const all = await this.listByType(type);
    return all.some((f) => f.refId === refId);
  }

  async removeByRef(type: FavoriteType, refId: string): Promise<void> {
    const db = await getDB();
    const all = await db.getAll('favorites');
    for (const f of all) {
      if (f.type === type && f.refId === refId) {
        await db.delete('favorites', f.id);
      }
    }
  }
}

export const favoritesRepo = new FavoritesRepo();
