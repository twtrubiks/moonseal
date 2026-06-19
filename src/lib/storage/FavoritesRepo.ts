import { getDB, type FavoriteRecord } from './db';
import { uuid } from '../util/uuid';

export type FavoriteType = FavoriteRecord['type'];

export interface AddFavoriteInput {
  type: FavoriteType;
  refId: string;
}

export class FavoritesRepo {
  /** (type, refId) 視為唯一：已存在就回傳既有記錄，不重複新增 */
  async add(input: AddFavoriteInput): Promise<FavoriteRecord> {
    const db = await getDB();
    const all = await db.getAll('favorites');
    const existing = all.find((f) => f.type === input.type && f.refId === input.refId);
    if (existing) return existing;
    const record: FavoriteRecord = {
      id: uuid(),
      type: input.type,
      refId: input.refId,
      addedAt: Date.now()
    };
    await db.put('favorites', record);
    return record;
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
