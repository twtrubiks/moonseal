export interface SleepTimerCallbacks {
  /** 在音訊時鐘上排定「淡出→靜音」：totalSec 秒後靜音，最後 fadeOutSec 秒淡出。背景也準時 */
  scheduleFade: (totalSec: number, fadeOutSec: number) => void;
  /** 取消已排定的淡出，音量還原（計時取消時用） */
  cancelFade: () => void;
  /** 計時結束：停止所有播放並重置狀態（背景節流時可能稍晚於 endAt 才呼叫，但音訊已先靜音） */
  stopAll: () => void;
}

export interface StartTimerInput {
  totalSec: number;
  fadeOutSec: number;
}

export class SleepTimer {
  private endAt: number | null = null;
  /** 結束時做 JS 端清理（停軌/重置狀態）的計時器；音訊淡出本身排在音訊時鐘上，不靠它 */
  private stopTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private cb: SleepTimerCallbacks) {}

  start(input: StartTimerInput): void {
    this.cancel();
    const now = Date.now();
    this.endAt = now + input.totalSec * 1000;
    // 淡出→靜音整段一次排上音訊時鐘，之後背景被節流也會準時靜音
    this.cb.scheduleFade(input.totalSec, input.fadeOutSec);
    this.armStop(now);
  }

  /**
   * 回前景對時。音訊淡出已排在音訊時鐘上自動執行、不受背景節流影響，
   * 這裡只需處理 JS 端的結束清理：若 setTimeout 被節流而已過 endAt，立即補做停止。
   */
  sync(): void {
    if (this.endAt === null) return;
    this.armStop(Date.now());
  }

  private armStop(now: number): void {
    this.clearStop();
    if (this.endAt === null) return;
    if (now >= this.endAt) {
      this.fireStop();
      return;
    }
    this.stopTimeout = setTimeout(() => this.fireStop(), this.endAt - now);
  }

  private fireStop(): void {
    this.clearStop();
    this.endAt = null;
    this.cb.stopAll();
  }

  private clearStop(): void {
    if (this.stopTimeout) { clearTimeout(this.stopTimeout); this.stopTimeout = null; }
  }

  cancel(): void {
    this.clearStop();
    if (this.endAt !== null) this.cb.cancelFade();
    this.endAt = null;
  }

  remaining(): number {
    if (this.endAt === null) return 0;
    return Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
  }

  isRunning(): boolean { return this.endAt !== null; }
}
