import { getDB, type CustomStoryRecord as RawRecord } from './db';
import type { StorySegment } from '../story/types';
import { validateSegments } from '../story/validate';
import { uuid } from '../util/uuid';

export interface CustomStoryRecord extends Omit<RawRecord, 'segments'> {
  segments: StorySegment[];
}

/** 從 IndexedDB 讀回的 record 做 runtime 驗證；無效則 throw（呼叫端決定 skip 或忽略） */
function validateRecord(row: unknown): CustomStoryRecord {
  if (!row || typeof row !== 'object') throw new Error('story record 不是物件');
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) throw new Error('story record: id 無效');
  const segments = validateSegments(r.segments);
  return {
    id: r.id,
    nameKey: typeof r.nameKey === 'string' ? r.nameKey : '',
    description: typeof r.description === 'string' ? r.description : '',
    builtin: false,
    segments,
    totalDurationSec: typeof r.totalDurationSec === 'number' && Number.isFinite(r.totalDurationSec)
      ? r.totalDurationSec
      : segments.reduce((sum, s) => sum + s.durationSec, 0),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0
  };
}

export interface SaveStoryInput {
  id?: string;
  name: string;
  segments: StorySegment[];
}

export class StoryRepo {
  async save(input: SaveStoryInput): Promise<CustomStoryRecord> {
    const db = await getDB();
    const id = input.id ?? uuid();
    const existing = (await db.get('customStories', id)) as CustomStoryRecord | undefined;
    const now = Date.now();
    const segments = structuredClone(input.segments);
    const totalDurationSec = segments.reduce((sum, s) => sum + s.durationSec, 0);
    const record: CustomStoryRecord = {
      id,
      nameKey: input.name,
      description: '',
      builtin: false,
      segments,
      totalDurationSec,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await db.put('customStories', record);
    return record;
  }

  async getById(id: string): Promise<CustomStoryRecord | undefined> {
    const db = await getDB();
    const row = await db.get('customStories', id);
    if (!row) return undefined;
    try {
      return validateRecord(row);
    } catch (e) {
      console.warn(`自訂夜讀 ${id} 格式無效，已略過`, e);
      return undefined;
    }
  }

  async listAll(): Promise<CustomStoryRecord[]> {
    const db = await getDB();
    const all = await db.getAll('customStories');
    const valid: CustomStoryRecord[] = [];
    for (const row of all) {
      try {
        valid.push(validateRecord(row));
      } catch (e) {
        console.warn('自訂夜讀記錄格式無效，已略過', e);
      }
    }
    return valid.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('customStories', id);
  }
}

export const storyRepo = new StoryRepo();
