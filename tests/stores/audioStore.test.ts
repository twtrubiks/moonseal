import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    initialize: vi.fn(async () => {}),
    playTrack: vi.fn(async () => {}),
    crossfadeTo: vi.fn(async () => {}),
    setVolume: vi.fn(),
    setMasterVolume: vi.fn(),
    stopTrack: vi.fn(async () => {}),
    stopAll: vi.fn(async () => {}),
    previewOnce: vi.fn(async () => {}),
    activeTrackIds: vi.fn(() => [] as string[])
  };
});

vi.mock('../../src/lib/audio/AudioEngine', () => ({
  audioEngine: {
    initialize: mocks.initialize,
    playTrack: mocks.playTrack,
    crossfadeTo: mocks.crossfadeTo,
    setVolume: mocks.setVolume,
    setMasterVolume: mocks.setMasterVolume,
    stopTrack: mocks.stopTrack,
    stopAll: mocks.stopAll,
    previewOnce: mocks.previewOnce,
    activeTrackIds: mocks.activeTrackIds
  }
}));

vi.mock('../../src/lib/storage/RecentsRepo', () => ({
  recentsRepo: { push: vi.fn(async () => {}) }
}));

import { audioStore } from '../../src/lib/stores/audioStore.svelte';
import type { StoryDef } from '../../src/lib/story/types';

const story: StoryDef = {
  id: 'test-story',
  nameKey: '測試',
  description: '',
  builtin: false,
  totalDurationSec: 30,
  segments: [
    { soundId: 'ocean', durationSec: 0.05, crossfadeSec: 0, volume: 0.5, poeticText: 'a' },
    { soundId: 'rain', durationSec: 0.05, crossfadeSec: 0, volume: 0.5, poeticText: 'b' }
  ]
};

async function reset() {
  await audioStore.stopAll(0);
  vi.clearAllMocks();
}

describe('audioStore — mode lifecycle', () => {
  beforeEach(reset);

  it('starts in idle mode', () => {
    expect(audioStore.mode).toBe('idle');
    expect(audioStore.isPlaying).toBe(false);
  });

  it('toggleSound from idle enters mix mode', async () => {
    await audioStore.toggleSound('ocean', 0.7);
    expect(audioStore.mode).toBe('mix');
    expect(audioStore.tracks['ocean']).toBeDefined();
  });

  it('toggleSound removing last sound returns to idle', async () => {
    await audioStore.toggleSound('ocean', 0.7);
    await audioStore.toggleSound('ocean', 0.7);
    expect(audioStore.mode).toBe('idle');
    expect(Object.keys(audioStore.tracks)).toHaveLength(0);
  });

  it('startStory from mix mode stops mix and enters story mode', async () => {
    await audioStore.toggleSound('ocean', 0.7);
    await audioStore.toggleSound('rain', 0.7);
    expect(audioStore.mode).toBe('mix');

    const p = audioStore.startStory(story);
    await new Promise((r) => setTimeout(r, 10));

    expect(mocks.stopAll).toHaveBeenCalled();
    expect(audioStore.tracks).toEqual({});
    expect(audioStore.mode).toBe('story');
    expect(audioStore.currentStory?.id).toBe('test-story');
    expect(audioStore.currentIndex).toBe(0);

    await audioStore.stopStory();
    await p;
  });

  it('toggleSound during story stops story and enters mix mode', async () => {
    const p = audioStore.startStory(story);
    await new Promise((r) => setTimeout(r, 10));
    expect(audioStore.mode).toBe('story');

    await audioStore.toggleSound('ocean', 0.7);
    expect(audioStore.mode).toBe('mix');
    expect(audioStore.currentStory).toBeNull();
    expect(audioStore.currentSegment).toBeNull();
    expect(audioStore.tracks['ocean']).toBeDefined();
    await p;
  });

  it('stopStory cancels story and returns to idle', async () => {
    const p = audioStore.startStory(story);
    await new Promise((r) => setTimeout(r, 10));
    await audioStore.stopStory();
    await p;
    expect(audioStore.mode).toBe('idle');
    expect(audioStore.currentStory).toBeNull();
  });

  it('story completing all segments returns to idle', async () => {
    await audioStore.startStory(story);
    expect(audioStore.mode).toBe('idle');
    expect(audioStore.currentStory).toBeNull();
  });

  it('stopAll from any mode cleans up to idle', async () => {
    await audioStore.toggleSound('ocean', 0.7);
    await audioStore.stopAll(0);
    expect(audioStore.mode).toBe('idle');
    expect(audioStore.tracks).toEqual({});

    const p2 = audioStore.startStory(story);
    await new Promise((r) => setTimeout(r, 10));
    await audioStore.stopAll(0);
    expect(audioStore.mode).toBe('idle');
    expect(audioStore.currentStory).toBeNull();
    await p2;
  });
});

describe('audioStore — race: stopStory between startStory setup and run()', () => {
  beforeEach(reset);

  it('stopStory called after setup but before run() starts should prevent any segment from playing', async () => {
    // 把 startStory 的 promise 抓著但不 await，模擬 UI side cleanup 在 await r.run 之前搶先呼 stopStory
    const startP = audioStore.startStory(story);
    // 等 #serialize 完成 setup（mode 已是 story、runner 已建立）
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStore.mode).toBe('story');

    // 此時 startStory 的 await r.run 還沒實際開跑（同一個 microtask queue 還沒輪到）
    // 模擬 StoryPlayer 卸載觸發 stopStory
    const stopP = audioStore.stopStory();
    await stopP;
    await startP;

    // 不該有任何 segment 進到 engine
    expect(mocks.playTrack).not.toHaveBeenCalled();
    expect(mocks.crossfadeTo).not.toHaveBeenCalled();
    expect(audioStore.mode).toBe('idle');
    expect(audioStore.currentStory).toBeNull();
  });
});

describe('audioStore — race: stopStory before in-flight playTrack resolves', () => {
  beforeEach(reset);

  it('stopStory waits for pending segment audio before fading, no ghost track leaks', async () => {
    let resolvePlay: (() => void) | null = null;
    mocks.playTrack.mockImplementationOnce(
      () => new Promise<void>((r) => { resolvePlay = r; })
    );

    const startP = audioStore.startStory(story);
    await new Promise((r) => setTimeout(r, 5));
    expect(resolvePlay).not.toBeNull();
    expect(mocks.stopAll).not.toHaveBeenCalled();

    const stopP = audioStore.stopStory();
    await new Promise((r) => setTimeout(r, 5));
    // engine.stopAll 不該在 playTrack 還沒回來前被呼叫，否則 ghost track 會漏網
    expect(mocks.stopAll).not.toHaveBeenCalled();

    resolvePlay!();
    await stopP;
    await startP;

    expect(mocks.stopAll).toHaveBeenCalled();
    expect(audioStore.mode).toBe('idle');
  });
});

describe('audioStore — master volume', () => {
  beforeEach(reset);

  it('setMasterVolume delegates to engine (ramp) and clamps to [0,1]', async () => {
    await audioStore.toggleSound('ocean', 0.7); // 觸發 ensureInitialized
    mocks.setMasterVolume.mockClear();

    audioStore.setMasterVolume(0.4);
    expect(audioStore.masterVolume).toBe(0.4);
    expect(mocks.setMasterVolume).toHaveBeenCalledWith(0.4, 0.05);

    audioStore.setMasterVolume(2);
    expect(audioStore.masterVolume).toBe(1);

    audioStore.setMasterVolume(-1);
    expect(audioStore.masterVolume).toBe(0);
  });
});

describe('audioStore — preview channel', () => {
  beforeEach(reset);

  it('preview does not change mode or tracks', async () => {
    await audioStore.preview('ocean', 5, 0.7);
    expect(audioStore.mode).toBe('idle');
    expect(audioStore.tracks).toEqual({});
    expect(mocks.previewOnce).toHaveBeenCalledWith('ocean', 5, 0.7);
  });

  it('preview during story does not stop story', async () => {
    const p = audioStore.startStory(story);
    await new Promise((r) => setTimeout(r, 10));
    await audioStore.preview('rain', 5, 0.7);
    expect(audioStore.mode).toBe('story');
    expect(audioStore.currentStory?.id).toBe('test-story');
    await audioStore.stopStory();
    await p;
  });
});
