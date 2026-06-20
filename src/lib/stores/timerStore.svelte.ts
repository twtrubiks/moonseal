import { audioEngine } from '../audio/AudioEngine';
import { audioStore } from './audioStore.svelte';
import { SleepTimer } from '../timer/SleepTimer';
import { settingsRepo, DEFAULT_SETTINGS } from '../storage/SettingsRepo';

const DEFAULT_TIMER_MIN = 30;

class TimerStore {
  remainingSec = $state(0);
  totalSec = $state(0);
  running = $state(false);
  fadeOutSec = $state(DEFAULT_SETTINGS.fadeOutOnTimerSec);
  defaultTimerMin = $state(DEFAULT_TIMER_MIN);
  private timer: SleepTimer;
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timer = new SleepTimer({
      scheduleFade: (totalSec, fadeOutSec) => audioEngine.scheduleTimerFade(totalSec, fadeOutSec),
      cancelFade: () => audioEngine.cancelTimerFade(),
      stopAll: () => {
        void audioStore.stopAll(0);
      }
    });
    void this.loadSettings();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.resync();
      });
    }
  }

  /**
   * 回到前景時對時。音訊淡出已排在音訊時鐘上、背景也會準時靜音；這裡用 wall-clock
   * 校正顯示秒數，並在 setTimeout 被節流而已過 endAt 時補做 JS 端的停止清理。
   */
  private resync() {
    if (!this.running) return;
    this.timer.sync();
    this.remainingSec = this.timer.remaining();
    if (this.remainingSec === 0) {
      this.running = false;
      this.stopTick();
    } else {
      this.startTick();
    }
  }

  private async loadSettings() {
    const s = await settingsRepo.load();
    this.fadeOutSec = s.fadeOutOnTimerSec;
    this.defaultTimerMin = s.defaultTimerMin ?? DEFAULT_TIMER_MIN;
  }

  setFadeOutSec(sec: number) {
    const v = Math.max(0, Math.round(sec));
    this.fadeOutSec = v;
    void settingsRepo.save({ fadeOutOnTimerSec: v }).catch(() => { /* 持久化失敗忽略 */ });
  }

  setDefaultTimerMin(min: number) {
    const v = Math.max(1, Math.round(min));
    this.defaultTimerMin = v;
    void settingsRepo.save({ defaultTimerMin: v }).catch(() => { /* 持久化失敗忽略 */ });
  }

  start(totalMin: number) {
    const total = totalMin * 60;
    this.timer.start({ totalSec: total, fadeOutSec: this.fadeOutSec });
    this.totalSec = total;
    this.remainingSec = total;
    this.running = true;
    this.startTick();
  }

  cancel() {
    this.timer.cancel();
    this.running = false;
    this.stopTick();
    this.remainingSec = 0;
    this.totalSec = 0;
  }

  private startTick() {
    this.stopTick();
    this.tickHandle = setInterval(() => {
      this.remainingSec = this.timer.remaining();
      if (this.remainingSec === 0) {
        this.running = false;
        this.stopTick();
      }
    }, 250);
  }

  private stopTick() {
    if (this.tickHandle) { clearInterval(this.tickHandle); this.tickHandle = null; }
  }
}

export const timerStore = new TimerStore();
