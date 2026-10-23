import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    initialize: vi.fn(async () => {}),
    playTrack: vi.fn(async (_soundId: string, _volume: number, _fadeInSec?: number) => {}),
    crossfadeTo: vi.fn(async (_soundId: string, _volume: number, _crossfadeSec: number) => {}),
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
import { toastStore } from '../../src/lib/stores/toastStore.svelte';
import { recentsRepo } from '../../src/lib/storage/RecentsRepo';
import { settingsRepo } from '../../src/lib/storage/SettingsRepo';
import type { StoryDef } from '../../src/lib/story/types';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

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

describe('audioStore — mix 細節', () => {
  beforeEach(reset);

  it('toggleSound 記錄 { soundId, volume }、寫入最近播放，isPlaying 為 true', async () => {
    await audioStore.toggleSound('ocean', 0.4);
    expect(audioStore.tracks['ocean']).toEqual({ soundId: 'ocean', volume: 0.4 });
    expect(mocks.playTrack).toHaveBeenCalledWith('ocean', 0.4);
    expect(recentsRepo.push).toHaveBeenCalledWith('sound', 'ocean');
    expect(audioStore.isPlaying).toBe(true);
  });

  it('toggleSound 預設音量 0.7；關掉時呼叫 engine.stopTrack', async () => {
    await audioStore.toggleSound('rain');
    expect(audioStore.tracks['rain']?.volume).toBe(0.7);
    await audioStore.toggleSound('rain');
    expect(mocks.stopTrack).toHaveBeenCalledWith('rain');
  });

  it('mix 中加第二軌不會停掉既有的軌', async () => {
    await audioStore.toggleSound('ocean', 0.7);
    await audioStore.toggleSound('rain', 0.7);
    expect(mocks.stopAll).not.toHaveBeenCalled();
    expect(Object.keys(audioStore.tracks)).toEqual(['ocean', 'rain']);
  });

  it('播放失敗：toast 錯誤訊息，狀態維持原樣', async () => {
    const show = vi.spyOn(toastStore, 'show');
    mocks.playTrack.mockRejectedValueOnce(new Error('404'));
    await audioStore.toggleSound('ocean', 0.7);
    expect(show).toHaveBeenCalledWith('音效載入失敗：404', 'error');
    expect(audioStore.tracks).toEqual({});
    expect(audioStore.mode).toBe('idle');
    show.mockRestore();
  });

  it('非 Error 例外使用預設訊息', async () => {
    const show = vi.spyOn(toastStore, 'show');
    mocks.playTrack.mockRejectedValueOnce('weird');
    await audioStore.toggleSound('ocean', 0.7);
    expect(show).toHaveBeenCalledWith('音效載入失敗：播放失敗', 'error');
    show.mockRestore();
  });

  it('setVolume 以 0.1s ramp 轉給 engine 並同步 tracks 狀態', async () => {
    await audioStore.toggleSound('ocean', 0.7);
    audioStore.setVolume('ocean', 0.2);
    expect(mocks.setVolume).toHaveBeenCalledWith('ocean', 0.2, 0.1);
    expect(audioStore.tracks['ocean']?.volume).toBe(0.2);
  });

  it('setVolume 對沒在播的聲音不會憑空建立 track', () => {
    audioStore.setVolume('wind', 0.5);
    expect(audioStore.tracks).toEqual({});
    expect(audioStore.mode).toBe('idle');
  });

  it('stopAll 把 fadeOutSec 傳給 engine', async () => {
    await audioStore.toggleSound('ocean', 0.7);
    await audioStore.stopAll(1.5);
    expect(mocks.stopAll).toHaveBeenCalledWith(1.5);
  });

  it('stopAll 預設 0.5s 淡出', async () => {
    await audioStore.stopAll();
    expect(mocks.stopAll).toHaveBeenCalledWith(0.5);
  });

  it('engine.stopAll 失敗時 stopAll 仍把狀態清乾淨', async () => {
    await audioStore.toggleSound('ocean', 0.7);
    mocks.stopAll.mockRejectedValueOnce(new Error('ctx closed'));
    await expect(audioStore.stopAll(0)).rejects.toThrow('ctx closed');
    expect(audioStore.mode).toBe('idle');
    expect(audioStore.tracks).toEqual({});
  });
});

describe('audioStore — 序列鎖（#serialize）', () => {
  beforeEach(reset);

  it('連點同一張卡兩次：依序 play → stop，最後是關的', async () => {
    await Promise.all([
      audioStore.toggleSound('ocean', 0.7),
      audioStore.toggleSound('ocean', 0.7)
    ]);
    expect(mocks.playTrack).toHaveBeenCalledOnce();
    expect(mocks.stopTrack).toHaveBeenCalledOnce();
    expect(audioStore.tracks).toEqual({});
    expect(audioStore.mode).toBe('idle');
  });

  it('前一個操作還在跑時，後到的操作要排隊等它（含中途才加入的）', async () => {
    const a = deferred();
    const b = deferred();
    mocks.playTrack
      .mockImplementationOnce(() => a.promise)
      .mockImplementationOnce(() => b.promise);

    const pA = audioStore.toggleSound('ocean', 0.7);
    const pB = audioStore.toggleSound('rain', 0.7);
    await tick();
    expect(mocks.playTrack.mock.calls.map((c) => c[0])).toEqual(['ocean']);

    a.resolve();
    await pA;
    await tick();
    expect(mocks.playTrack.mock.calls.map((c) => c[0])).toEqual(['ocean', 'rain']);

    // B 還在跑時才加入的 C 也必須等 B
    const pC = audioStore.toggleSound('wind', 0.7);
    await tick();
    expect(mocks.playTrack.mock.calls.map((c) => c[0])).toEqual(['ocean', 'rain']);

    b.resolve();
    await Promise.all([pB, pC]);
    expect(mocks.playTrack.mock.calls.map((c) => c[0])).toEqual(['ocean', 'rain', 'wind']);
    expect(Object.keys(audioStore.tracks)).toEqual(['ocean', 'rain', 'wind']);
  });

  it('排隊中的操作失敗不會卡住後面的操作', async () => {
    await audioStore.toggleSound('ocean', 0.7);
    mocks.stopAll.mockRejectedValueOnce(new Error('boom'));
    const pStory = audioStore.startStory(story);
    const pToggle = audioStore.toggleSound('rain', 0.7);
    await expect(pStory).rejects.toThrow('boom');
    await pToggle;
    expect(audioStore.mode).toBe('mix');
    expect(audioStore.tracks['rain']).toBeDefined();
  });
});

describe('audioStore — story 細節', () => {
  beforeEach(reset);

  const story3: StoryDef = {
    ...story,
    id: 'story-3',
    segments: [
      { soundId: 'ocean', durationSec: 0.03, crossfadeSec: 0, volume: 0.5 },
      { soundId: 'rain', durationSec: 0.03, crossfadeSec: 4, volume: 0.6 },
      { soundId: 'birds', durationSec: 0.03, crossfadeSec: 2, volume: 0.4 }
    ]
  };

  it('第一段以 playTrack 2s 淡入，之後各段以該段 crossfadeSec 交叉淡入', async () => {
    await audioStore.startStory(story3);
    expect(mocks.playTrack.mock.calls).toEqual([['ocean', 0.5, 2]]);
    expect(mocks.crossfadeTo.mock.calls).toEqual([['rain', 0.6, 4], ['birds', 0.4, 2]]);
    // 跑完後以 2s 淡出收尾
    expect(mocks.stopAll).toHaveBeenCalledWith(2);
  });

  it('startStory 寫入最近播放，且 setup 完成當下就有第一段可顯示', async () => {
    const p = audioStore.startStory(story3);
    await Promise.resolve();
    await Promise.resolve();
    expect(audioStore.currentSegment).toEqual(story3.segments[0]);
    expect(recentsRepo.push).toHaveBeenCalledWith('story', 'story-3');
    await audioStore.stopStory();
    await p;
  });

  it('segment-start 依序更新 currentIndex / currentSegment', async () => {
    const seen: Array<[number, string | undefined]> = [];
    mocks.crossfadeTo.mockImplementation(async () => {
      seen.push([audioStore.currentIndex, audioStore.currentSegment?.soundId]);
    });
    await audioStore.startStory(story3);
    expect(seen).toEqual([[1, 'rain'], [2, 'birds']]);
    mocks.crossfadeTo.mockImplementation(async () => {});
  });

  it('夜讀中再開另一則夜讀：先收掉舊的（0.6s 淡出），只播新的', async () => {
    const pA = audioStore.startStory(story3);
    await tick(5);
    const pB = audioStore.startStory({ ...story, id: 'story-b' });
    await tick(5);
    expect(mocks.stopAll).toHaveBeenCalledWith(0.6);
    expect(audioStore.currentStory?.id).toBe('story-b');
    await pA;
    await audioStore.stopStory();
    await pB;
    // 舊夜讀被取消後不會再推進到第二段以後
    expect(mocks.crossfadeTo.mock.calls.some((c) => c[0] === 'birds')).toBe(false);
  });

  it('mix 模式下呼叫 stopStory 是 no-op（StoryPlayer 卸載時不能把混音停掉）', async () => {
    await audioStore.toggleSound('ocean', 0.7);
    await audioStore.stopStory();
    expect(mocks.stopAll).not.toHaveBeenCalled();
    expect(audioStore.mode).toBe('mix');
    expect(audioStore.tracks['ocean']).toBeDefined();
  });

  it('stopStory 會等「目前」這段的音訊操作完成才淡出，即使前一段的還沒回來', async () => {
    const seg0 = deferred();
    const seg1 = deferred();
    mocks.playTrack.mockImplementationOnce(() => seg0.promise);
    mocks.crossfadeTo.mockImplementationOnce(() => seg1.promise);

    const p = audioStore.startStory(story3);
    await tick(40);                      // 進到第二段，seg0 / seg1 都還沒回來
    expect(mocks.crossfadeTo).toHaveBeenCalledOnce();
    seg0.resolve();                      // 前一段先回來
    await tick();

    const stopP = audioStore.stopStory();
    await tick();
    expect(mocks.stopAll).not.toHaveBeenCalled();   // 仍在等 seg1
    seg1.resolve();
    await stopP;
    await p;
    expect(mocks.stopAll).toHaveBeenCalledWith(2);
    expect(audioStore.mode).toBe('idle');
  });
});

describe('audioStore — preview 錯誤', () => {
  beforeEach(reset);

  it('試聽失敗只 toast，不影響播放狀態', async () => {
    const show = vi.spyOn(toastStore, 'show');
    mocks.previewOnce.mockRejectedValueOnce(new Error('decode'));
    await audioStore.toggleSound('ocean', 0.7);
    await audioStore.preview('rain', 5);
    expect(show).toHaveBeenCalledWith('試聽失敗：decode', 'error');
    expect(audioStore.mode).toBe('mix');
    show.mockRestore();
  });

  it('非 Error 例外使用預設訊息；預設音量 0.7', async () => {
    const show = vi.spyOn(toastStore, 'show');
    mocks.previewOnce.mockRejectedValueOnce(42);
    await audioStore.preview('rain', 5);
    expect(mocks.previewOnce).toHaveBeenCalledWith('rain', 5, 0.7);
    expect(show).toHaveBeenCalledWith('試聽失敗：試聽失敗', 'error');
    show.mockRestore();
  });
});

describe('audioStore — master volume 持久化', () => {
  beforeEach(reset);

  it('連續調整只在停手 300ms 後存一次最後的值', async () => {
    vi.useFakeTimers();
    const save = vi.spyOn(settingsRepo, 'save').mockResolvedValue();
    audioStore.setMasterVolume(0.1);
    vi.advanceTimersByTime(200);
    audioStore.setMasterVolume(0.2);
    vi.advanceTimersByTime(200);
    audioStore.setMasterVolume(0.3);
    vi.advanceTimersByTime(299);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({ masterVolume: 0.3 });
    save.mockRestore();
    vi.useRealTimers();
  });

  it('存的是夾過範圍的值，存檔失敗不會變成 unhandled rejection', async () => {
    vi.useFakeTimers();
    const save = vi.spyOn(settingsRepo, 'save').mockRejectedValue(new Error('quota'));
    audioStore.setMasterVolume(5);
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledWith({ masterVolume: 1 });
    save.mockRestore();
    vi.useRealTimers();
  });
});

describe('audioStore — 夜讀段落載入失敗', () => {
  beforeEach(reset);

  it('第一段載入失敗：toast 並收掉整則夜讀回到 idle', async () => {
    const show = vi.spyOn(toastStore, 'show');
    mocks.playTrack.mockRejectedValueOnce(new Error('404'));
    await audioStore.startStory(story);
    await vi.waitFor(() => expect(audioStore.mode).toBe('idle'));
    expect(show).toHaveBeenCalledWith('夜讀載入失敗：404', 'error');
    expect(audioStore.currentStory).toBeNull();
    expect(audioStore.currentSegment).toBeNull();
    expect(mocks.stopAll).toHaveBeenCalledWith(0.5);
    expect(mocks.crossfadeTo).not.toHaveBeenCalled(); // 不會再推進到下一段
    show.mockRestore();
  });

  it('中途某段 crossfade 失敗：同樣收掉（前一段的聲音不會被留著一直播）', async () => {
    const show = vi.spyOn(toastStore, 'show');
    mocks.crossfadeTo.mockRejectedValueOnce('decode error');
    await audioStore.startStory(story);
    await vi.waitFor(() => expect(audioStore.mode).toBe('idle'));
    expect(show).toHaveBeenCalledWith('夜讀載入失敗：夜讀載入失敗', 'error');
    expect(mocks.stopAll).toHaveBeenCalledWith(0.5);
    show.mockRestore();
  });

  it('失敗收尾前已切到 mix：收尾不能把新的混音停掉', async () => {
    const fail = deferred();
    mocks.playTrack.mockImplementationOnce(() => fail.promise);
    const p = audioStore.startStory(story);
    await tick(5);
    const toggle = audioStore.toggleSound('rain', 0.7); // 等 pending segment 時排在前面
    fail.reject(new Error('404'));
    await toggle;
    await p;
    await tick(5);
    expect(audioStore.mode).toBe('mix');
    expect(audioStore.tracks['rain']).toBeDefined();
  });
});

