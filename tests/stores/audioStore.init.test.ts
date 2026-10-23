import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(async () => {}),
  playTrack: vi.fn(async () => {}),
  setMasterVolume: vi.fn(),
  load: vi.fn<() => Promise<{ fadeOutOnTimerSec: number; masterVolume: number }>>()
}));

vi.mock('../../src/lib/audio/AudioEngine', () => ({
  audioEngine: {
    initialize: mocks.initialize,
    playTrack: mocks.playTrack,
    setMasterVolume: mocks.setMasterVolume
  }
}));
vi.mock('../../src/lib/storage/RecentsRepo', () => ({
  recentsRepo: { push: vi.fn(async () => {}) }
}));
vi.mock('../../src/lib/storage/SettingsRepo', () => ({
  DEFAULT_SETTINGS: { fadeOutOnTimerSec: 30, masterVolume: 0.7 },
  settingsRepo: { load: mocks.load, save: vi.fn(async () => {}) }
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function freshStore() {
  vi.resetModules();
  return (await import('../../src/lib/stores/audioStore.svelte')).audioStore;
}

describe('audioStore — 初始狀態與初始化', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('全新的 store 為 idle、未初始化、主音量為預設值', async () => {
    mocks.load.mockReturnValue(new Promise(() => {}));
    const store = await freshStore();
    expect(store.mode).toBe('idle');
    expect(store.isPlaying).toBe(false);
    expect(store.initialized).toBe(false);
    expect(store.masterVolume).toBe(0.7);
    expect(store.tracks).toEqual({});
    expect(store.currentStory).toBeNull();
  });

  it('載入設定後套用主音量；尚未初始化時不碰 engine', async () => {
    mocks.load.mockResolvedValue({ fadeOutOnTimerSec: 30, masterVolume: 0.3 });
    const store = await freshStore();
    await vi.waitFor(() => expect(store.masterVolume).toBe(0.3));
    expect(mocks.setMasterVolume).not.toHaveBeenCalled();
  });

  it('第一次播放才初始化 engine，並把目前主音量立即（0s）套上；之後不再重複初始化', async () => {
    mocks.load.mockResolvedValue({ fadeOutOnTimerSec: 30, masterVolume: 0.3 });
    const store = await freshStore();
    await vi.waitFor(() => expect(store.masterVolume).toBe(0.3));
    await store.toggleSound('ocean', 0.5);
    expect(mocks.initialize).toHaveBeenCalledOnce();
    expect(mocks.setMasterVolume).toHaveBeenCalledWith(0.3, 0);
    expect(store.initialized).toBe(true);
    await store.toggleSound('rain', 0.5);
    expect(mocks.initialize).toHaveBeenCalledOnce();
  });

  it('設定比初始化晚回來：直接把載入的主音量套到 engine', async () => {
    const d = deferred<{ fadeOutOnTimerSec: number; masterVolume: number }>();
    mocks.load.mockReturnValue(d.promise);
    const store = await freshStore();
    await store.ensureInitialized();
    mocks.setMasterVolume.mockClear();
    d.resolve({ fadeOutOnTimerSec: 30, masterVolume: 0.25 });
    await vi.waitFor(() => expect(store.masterVolume).toBe(0.25));
    expect(mocks.setMasterVolume).toHaveBeenCalledWith(0.25, 0);
  });

  it('設定載入失敗時沿用預設值，不會 unhandled rejection', async () => {
    mocks.load.mockRejectedValue(new Error('idb blocked'));
    const store = await freshStore();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.masterVolume).toBe(0.7);
  });

  it('初始化前調主音量不碰 engine（等初始化時再套用）', async () => {
    mocks.load.mockReturnValue(new Promise(() => {}));
    const store = await freshStore();
    store.setMasterVolume(0.4);
    expect(mocks.setMasterVolume).not.toHaveBeenCalled();
    await store.ensureInitialized();
    expect(mocks.setMasterVolume).toHaveBeenCalledWith(0.4, 0);
  });
});
