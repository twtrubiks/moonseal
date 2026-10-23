import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StoryRunner } from '../../src/lib/story/StoryRunner';
import type { StorySegment, StoryEvent } from '../../src/lib/story/types';

describe('StoryRunner', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const segments: StorySegment[] = [
    { soundId: 'ocean',  durationSec: 5,  crossfadeSec: 2, volume: 0.7, poeticText: '海邊' },
    { soundId: 'birds',  durationSec: 5,  crossfadeSec: 2, volume: 0.7, poeticText: '鳥鳴' },
    { soundId: 'rain',   durationSec: 5,  crossfadeSec: 0, volume: 0.6, poeticText: '雨聲' }
  ];

  it('emits segment-start for each segment in order', async () => {
    const events: StoryEvent[] = [];
    const runner = new StoryRunner();
    runner.on((e) => events.push(e));

    const promise = runner.run(segments);

    expect(events.filter((e) => e.type === 'segment-start')).toHaveLength(1);
    expect((events[0] as { index: number }).index).toBe(0);

    await vi.advanceTimersByTimeAsync(5000);
    expect(events.filter((e) => e.type === 'segment-start')).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(5000);
    expect(events.filter((e) => e.type === 'segment-start')).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(5000);
    await promise;
    expect(events.at(-1)?.type).toBe('story-end');
  });

  it('cancel() halts execution and emits cancelled', async () => {
    const events: StoryEvent[] = [];
    const runner = new StoryRunner();
    runner.on((e) => events.push(e));

    const promise = runner.run(segments);
    await vi.advanceTimersByTimeAsync(2000);
    runner.cancel();
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(events.find((e) => e.type === 'cancelled')).toBeDefined();
    expect(events.find((e) => e.type === 'story-end')).toBeUndefined();
  });

  it('does not start a second run while one is active', async () => {
    const runner = new StoryRunner();
    const p1 = runner.run(segments);
    await expect(runner.run(segments)).rejects.toThrow(/already running/i);
    runner.cancel();
    await vi.advanceTimersByTimeAsync(0);
    await p1;
  });

  it('cancel() before run() prevents any segment-start, emits cancelled', async () => {
    const events: StoryEvent[] = [];
    const runner = new StoryRunner();
    runner.on((e) => events.push(e));

    runner.cancel();
    await runner.run(segments);

    expect(events.filter((e) => e.type === 'segment-start')).toHaveLength(0);
    expect(events.find((e) => e.type === 'cancelled')).toBeDefined();
    expect(events.find((e) => e.type === 'story-end')).toBeUndefined();
  });

  it('isActive() 只在 run 期間為 true；跑完可以再 run 一次', async () => {
    const runner = new StoryRunner();
    expect(runner.isActive()).toBe(false);
    const p = runner.run(segments.slice(0, 1));
    expect(runner.isActive()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(runner.isActive()).toBe(false);

    const events: StoryEvent[] = [];
    runner.on((e) => events.push(e));
    const p2 = runner.run(segments.slice(0, 1));
    await vi.advanceTimersByTimeAsync(5000);
    await p2;
    expect(events.map((e) => e.type)).toEqual(['segment-start', 'story-end']);
  });

  it('在最後一段播放中 cancel：發 cancelled 而不是 story-end', async () => {
    const events: StoryEvent[] = [];
    const runner = new StoryRunner();
    runner.on((e) => events.push(e));
    const p = runner.run(segments);
    await vi.advanceTimersByTimeAsync(12_000); // 在第三段（最後一段）中途
    runner.cancel();
    await p;
    expect(events.map((e) => e.type)).toEqual(['segment-start', 'segment-start', 'segment-start', 'cancelled']);
  });

  it('cancel 會立即喚醒等待中的段落並清掉計時器，不用等段落時間跑完', async () => {
    const runner = new StoryRunner();
    const p = runner.run(segments);
    await vi.advanceTimersByTimeAsync(1000);
    runner.cancel();
    expect(vi.getTimerCount()).toBe(0);
    await p; // 不推進時間也能結束
    expect(runner.isActive()).toBe(false);
  });

  it('已取消的 runner 跑空段落仍回報 cancelled', async () => {
    const events: StoryEvent[] = [];
    const runner = new StoryRunner();
    runner.on((e) => events.push(e));
    runner.cancel();
    await runner.run([]);
    expect(events.map((e) => e.type)).toEqual(['cancelled']);
  });

  it('空段落直接 story-end', async () => {
    const events: StoryEvent[] = [];
    const runner = new StoryRunner();
    runner.on((e) => events.push(e));
    await runner.run([]);
    expect(events.map((e) => e.type)).toEqual(['story-end']);
  });

  it('on() 回傳的函式可取消訂閱；多個 listener 都會收到事件', async () => {
    const a: string[] = [];
    const b: string[] = [];
    const runner = new StoryRunner();
    const offA = runner.on((e) => a.push(e.type));
    runner.on((e) => b.push(e.type));
    const p = runner.run(segments.slice(0, 2));
    offA();
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(a).toEqual(['segment-start']);
    expect(b).toEqual(['segment-start', 'segment-start', 'story-end']);
  });

  it('segment-start 帶上段落索引與內容', async () => {
    const events: StoryEvent[] = [];
    const runner = new StoryRunner();
    runner.on((e) => events.push(e));
    const p = runner.run(segments);
    await vi.advanceTimersByTimeAsync(15_000);
    await p;
    expect(events.slice(0, 3)).toEqual(segments.map((segment, index) => ({ type: 'segment-start', index, segment })));
  });

  it('依各段 durationSec 決定切換時間', async () => {
    const events: StoryEvent[] = [];
    const runner = new StoryRunner();
    runner.on((e) => events.push(e));
    const p = runner.run([
      { soundId: 'ocean', durationSec: 2, crossfadeSec: 0, volume: 0.5 },
      { soundId: 'rain', durationSec: 7, crossfadeSec: 0, volume: 0.5 }
    ]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(events).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(6999);
    expect(events).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(events.at(-1)?.type).toBe('story-end');
  });
});

