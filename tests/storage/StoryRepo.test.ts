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
});
