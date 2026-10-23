import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  scheduleTimerFade: vi.fn(),
  cancelTimerFade: vi.fn(),
  stopAll: vi.fn(async () => {}),
  load: vi.fn(async () => ({ fadeOutOnTimerSec: 30, masterVolume: 0.7 }) as Record<string, number>),
  save: vi.fn(async () => {})
}));

vi.mock('../../src/lib/audio/AudioEngine', () => ({
  audioEngine: { scheduleTimerFade: mocks.scheduleTimerFade, cancelTimerFade: mocks.cancelTimerFade }
}));
vi.mock('../../src/lib/stores/audioStore.svelte', () => ({
  audioStore: { stopAll: mocks.stopAll }
}));
vi.mock('../../src/lib/storage/SettingsRepo', () => ({
  DEFAULT_SETTINGS: { fadeOutOnTimerSec: 30, masterVolume: 0.7 },
  settingsRepo: { load: mocks.load, save: mocks.save }
}));

const T0 = new Date('2026-01-01T00:00:00Z');

/** 模擬分頁切到背景再回前景 */
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

type TimerStore = typeof import('../../src/lib/stores/timerStore.svelte')['timerStore'];
let current: TimerStore | null = null;

/** 每個測試拿一個全新的 store；舊 store 的 visibilitychange listener 還掛在 document 上，所以要先停掉 */
async function freshStore(settings?: Record<string, number>) {
  if (settings) mocks.load.mockResolvedValueOnce(settings);
  vi.resetModules();
  const { timerStore } = await import('../../src/lib/stores/timerStore.svelte');
  current = timerStore;
  await vi.advanceTimersByTimeAsync(0); // 讓 constructor 的 loadSettings 完成
  return timerStore;
}

describe('timerStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.clearAllMocks();
  });
  afterEach(() => {
    current?.cancel();
    current = null;
    setVisibility('visible');
    vi.useRealTimers();
  });

  it('全新的 store：沒在計時、秒數為 0', async () => {
    const store = await freshStore();
    expect(store.running).toBe(false);
    expect(store.remainingSec).toBe(0);
    expect(store.totalSec).toBe(0);
  });

  describe('設定載入', () => {
    it('沒存過 defaultTimerMin 時用預設 30 分鐘，fadeOut 吃設定值', async () => {
      const store = await freshStore({ fadeOutOnTimerSec: 12, masterVolume: 0.7 });
      expect(store.fadeOutSec).toBe(12);
      expect(store.defaultTimerMin).toBe(30);
    });

    it('有存 defaultTimerMin 時採用之', async () => {
      const store = await freshStore({ fadeOutOnTimerSec: 30, masterVolume: 0.7, defaultTimerMin: 45 });
      expect(store.defaultTimerMin).toBe(45);
    });
  });

  describe('setFadeOutSec / setDefaultTimerMin', () => {
    it('fadeOut 四捨五入、夾到 >= 0 並持久化', async () => {
      const store = await freshStore();
      store.setFadeOutSec(12.6);
      expect(store.fadeOutSec).toBe(13);
      expect(mocks.save).toHaveBeenLastCalledWith({ fadeOutOnTimerSec: 13 });
      store.setFadeOutSec(-5);
      expect(store.fadeOutSec).toBe(0);
      expect(mocks.save).toHaveBeenLastCalledWith({ fadeOutOnTimerSec: 0 });
    });

    it('預設時長四捨五入、至少 1 分鐘並持久化', async () => {
      const store = await freshStore();
      store.setDefaultTimerMin(44.5);
      expect(store.defaultTimerMin).toBe(45);
      expect(mocks.save).toHaveBeenLastCalledWith({ defaultTimerMin: 45 });
      store.setDefaultTimerMin(0);
      expect(store.defaultTimerMin).toBe(1);
      expect(mocks.save).toHaveBeenLastCalledWith({ defaultTimerMin: 1 });
    });

    it('持久化失敗不會變成 unhandled rejection', async () => {
      const store = await freshStore();
      mocks.save.mockRejectedValueOnce(new Error('quota'));
      mocks.save.mockRejectedValueOnce(new Error('quota'));
      store.setFadeOutSec(10);
      store.setDefaultTimerMin(10);
      await vi.advanceTimersByTimeAsync(0);
      expect(store.fadeOutSec).toBe(10);
      expect(store.defaultTimerMin).toBe(10);
    });
  });

  describe('start / tick / cancel', () => {
    it('start 以分鐘換算秒數，並把目前的 fadeOutSec 排上音訊時鐘', async () => {
      const store = await freshStore();
      store.setFadeOutSec(20);
      store.start(15);
      expect(mocks.scheduleTimerFade).toHaveBeenCalledWith(900, 20);
      expect(store.totalSec).toBe(900);
      expect(store.remainingSec).toBe(900);
      expect(store.running).toBe(true);
    });

    it('每 250ms 更新剩餘秒數', async () => {
      const store = await freshStore();
      store.start(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(store.remainingSec).toBe(50);
      await vi.advanceTimersByTimeAsync(250);
      expect(store.remainingSec).toBe(50);
      await vi.advanceTimersByTimeAsync(750);
      expect(store.remainingSec).toBe(49);
    });

    it('時間到：停止所有播放、running 歸 false、tick 停止', async () => {
      const store = await freshStore();
      store.start(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mocks.stopAll).toHaveBeenCalledWith(0);
      expect(store.remainingSec).toBe(0);
      expect(store.running).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('cancel 取消淡出並清空狀態，之後不會觸發 stopAll', async () => {
      const store = await freshStore();
      store.start(1);
      await vi.advanceTimersByTimeAsync(5000);
      store.cancel();
      expect(mocks.cancelTimerFade).toHaveBeenCalledOnce();
      expect(store.running).toBe(false);
      expect(store.remainingSec).toBe(0);
      expect(store.totalSec).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(mocks.stopAll).not.toHaveBeenCalled();
    });

    it('重複 start 只保留一組 tick（不會疊出多個 interval）', async () => {
      const store = await freshStore();
      store.start(1);
      store.start(2);
      // 1 個 tick interval + 1 個 SleepTimer 的結束 timeout
      expect(vi.getTimerCount()).toBe(2);
      expect(store.totalSec).toBe(120);
    });
  });

  describe('回前景對時（visibilitychange）', () => {
    it('背景期間 JS 計時器被節流而錯過結束：回前景立即停止並收掉狀態', async () => {
      const store = await freshStore();
      store.start(1);
      setVisibility('hidden');
      vi.setSystemTime(new Date(T0.getTime() + 70_000)); // 牆鐘 +70s，但計時器沒跑
      setVisibility('visible');
      expect(mocks.stopAll).toHaveBeenCalledWith(0);
      expect(store.running).toBe(false);
      expect(store.remainingSec).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('尚未到時：以牆鐘校正剩餘秒數並繼續 tick', async () => {
      const store = await freshStore();
      store.start(1);
      setVisibility('hidden');
      vi.setSystemTime(new Date(T0.getTime() + 40_000));
      setVisibility('visible');
      expect(store.remainingSec).toBe(20);
      expect(store.running).toBe(true);
      expect(mocks.stopAll).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(mocks.stopAll).toHaveBeenCalledOnce();
      expect(store.running).toBe(false);
    });

    it('切到背景（hidden）不做任何事', async () => {
      const store = await freshStore();
      store.start(1);
      vi.setSystemTime(new Date(T0.getTime() + 70_000));
      setVisibility('hidden');
      expect(mocks.stopAll).not.toHaveBeenCalled();
      expect(store.running).toBe(true);
    });

    it('沒在計時時回前景為 no-op', async () => {
      const store = await freshStore();
      setVisibility('visible');
      expect(store.running).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
