import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SleepTimer } from '../../src/lib/timer/SleepTimer';

function makeCb() {
  return { scheduleFade: vi.fn(), cancelFade: vi.fn(), stopAll: vi.fn() };
}

describe('SleepTimer', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('start() 把淡出排上音訊時鐘，並在 endAt 觸發 stopAll', async () => {
    const cb = makeCb();
    const timer = new SleepTimer(cb);

    timer.start({ totalSec: 60, fadeOutSec: 10 });
    // 淡出整段（含最後 10s 淡出）一次排上音訊時鐘
    expect(cb.scheduleFade).toHaveBeenCalledWith(60, 10);

    await vi.advanceTimersByTimeAsync(50_000);
    expect(cb.stopAll).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(cb.stopAll).toHaveBeenCalledOnce();
  });

  it('淡出只在 start 排程一次，不靠 JS 計時器逐步觸發', async () => {
    const cb = makeCb();
    const timer = new SleepTimer(cb);
    timer.start({ totalSec: 60, fadeOutSec: 10 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cb.scheduleFade).toHaveBeenCalledTimes(1);
  });

  it('remaining() reports remaining seconds', () => {
    const timer = new SleepTimer(makeCb());
    timer.start({ totalSec: 30, fadeOutSec: 5 });
    expect(timer.remaining()).toBe(30);
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));
    expect(timer.remaining()).toBe(20);
  });

  it('cancel() 取消淡出排程並阻止 stopAll', async () => {
    const cb = makeCb();
    const timer = new SleepTimer(cb);

    timer.start({ totalSec: 60, fadeOutSec: 10 });
    expect(cb.cancelFade).not.toHaveBeenCalled(); // 首次 start 沒有可取消的淡出
    timer.cancel();
    expect(cb.cancelFade).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(70_000);
    expect(cb.stopAll).not.toHaveBeenCalled();
  });

  it('isRunning() reflects state', () => {
    const timer = new SleepTimer(makeCb());
    expect(timer.isRunning()).toBe(false);
    timer.start({ totalSec: 60, fadeOutSec: 10 });
    expect(timer.isRunning()).toBe(true);
    timer.cancel();
    expect(timer.isRunning()).toBe(false);
  });

  describe('sync() — 背景節流後對時', () => {
    // 用 setSystemTime 跳動時鐘但不觸發 setTimeout，模擬背景分頁被節流的情形。
    // 音訊淡出已排在音訊時鐘上自動執行，sync 只負責 JS 端的結束清理。

    it('錯過 endAt：回前景時立即停止', () => {
      const cb = makeCb();
      const timer = new SleepTimer(cb);
      timer.start({ totalSec: 60, fadeOutSec: 10 });

      vi.setSystemTime(new Date('2026-01-01T00:01:10Z')); // +70s，setTimeout 未被觸發
      expect(cb.stopAll).not.toHaveBeenCalled();

      timer.sync();
      expect(cb.stopAll).toHaveBeenCalledOnce();
      expect(timer.isRunning()).toBe(false);
    });

    it('未到 endAt：sync 不停止，仍在 endAt 觸發 stopAll', async () => {
      const cb = makeCb();
      const timer = new SleepTimer(cb);
      timer.start({ totalSec: 60, fadeOutSec: 10 });

      vi.setSystemTime(new Date('2026-01-01T00:00:55Z')); // +55s，尚未到 endAt
      timer.sync();
      expect(cb.stopAll).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000);
      expect(cb.stopAll).toHaveBeenCalledOnce();
    });

    it('sync 不會重排淡出（音訊淡出由音訊時鐘負責，不需補觸發）', () => {
      const cb = makeCb();
      const timer = new SleepTimer(cb);
      timer.start({ totalSec: 60, fadeOutSec: 10 });

      vi.setSystemTime(new Date('2026-01-01T00:00:55Z'));
      timer.sync();
      expect(cb.scheduleFade).toHaveBeenCalledTimes(1); // 仍只有 start 那一次
    });

    it('未在計時時 sync 為 no-op', () => {
      const cb = makeCb();
      const timer = new SleepTimer(cb);
      timer.sync();
      expect(cb.scheduleFade).not.toHaveBeenCalled();
      expect(cb.cancelFade).not.toHaveBeenCalled();
      expect(cb.stopAll).not.toHaveBeenCalled();
    });
  });

  it('沒在計時時 cancel 不會呼叫 cancelFade', () => {
    const cb = makeCb();
    new SleepTimer(cb).cancel();
    expect(cb.cancelFade).not.toHaveBeenCalled();
  });

  it('remaining() 無條件進位到整秒，結束後為 0', async () => {
    const timer = new SleepTimer(makeCb());
    expect(timer.remaining()).toBe(0);
    timer.start({ totalSec: 30, fadeOutSec: 5 });
    vi.setSystemTime(new Date('2026-01-01T00:00:00.001Z'));
    expect(timer.remaining()).toBe(30);
    vi.setSystemTime(new Date('2026-01-01T00:00:29.999Z'));
    expect(timer.remaining()).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(timer.remaining()).toBe(0);
    expect(timer.isRunning()).toBe(false);
  });

  it('計時中重新 start：以新的時長為準，舊的結束點不會觸發', async () => {
    const cb = makeCb();
    const timer = new SleepTimer(cb);
    timer.start({ totalSec: 60, fadeOutSec: 10 });
    await vi.advanceTimersByTimeAsync(30_000);
    timer.start({ totalSec: 60, fadeOutSec: 5 });
    expect(cb.scheduleFade).toHaveBeenLastCalledWith(60, 5);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cb.stopAll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(cb.stopAll).toHaveBeenCalledOnce();
  });

  it('結束後不會留下任何計時器', async () => {
    const timer = new SleepTimer(makeCb());
    timer.start({ totalSec: 1, fadeOutSec: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('sync() 邊界', () => {
    it('多次 sync 不會疊出多個結束計時器（只 stopAll 一次）', async () => {
      const cb = makeCb();
      const timer = new SleepTimer(cb);
      timer.start({ totalSec: 60, fadeOutSec: 10 });
      vi.setSystemTime(new Date('2026-01-01T00:00:20Z'));
      timer.sync();
      vi.setSystemTime(new Date('2026-01-01T00:00:40Z'));
      timer.sync();
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(cb.stopAll).toHaveBeenCalledOnce();
    });

    it('剛好在 endAt 對時：當下就停止，不再多等一個 tick', () => {
      const cb = makeCb();
      const timer = new SleepTimer(cb);
      timer.start({ totalSec: 60, fadeOutSec: 10 });
      vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
      timer.sync();
      expect(cb.stopAll).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('結束後再 sync 是 no-op', async () => {
      const cb = makeCb();
      const timer = new SleepTimer(cb);
      timer.start({ totalSec: 1, fadeOutSec: 0 });
      await vi.advanceTimersByTimeAsync(1000);
      vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
      timer.sync();
      expect(cb.stopAll).toHaveBeenCalledOnce();
    });
  });
});

