<script lang="ts">
  import { uiStore } from '../lib/stores/uiStore.svelte';
  import { timerStore } from '../lib/stores/timerStore.svelte';
  import { fmtMMSS } from '../lib/util/format';

  const PRESETS = [15, 30, 45, 60, 90] as const;
  const DASH = 289; // 2πr (r=46)

  let selectedMin = $state<number | null>(null);
  // 未手動選擇時，回退到設定的預設時長（會隨設定變更而反應）
  let effectiveMin = $derived(selectedMin ?? timerStore.defaultTimerMin);

  let displayLeft = $derived(timerStore.running ? timerStore.remainingSec : effectiveMin * 60);
  let displayTotal = $derived(timerStore.running
    ? Math.max(timerStore.remainingSec, effectiveMin * 60)
    : effectiveMin * 60);
  let ratio = $derived(displayTotal > 0 ? displayLeft / displayTotal : 0);

  function start(min: number) {
    selectedMin = min;
    timerStore.start(min);
  }

  function cancel() {
    timerStore.cancel();
  }

  let dimScreen = $state(false);
  let close = () => uiStore.closeTimer();
</script>

{#if uiStore.timerSheetOpen}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="睡眠計時">
    <div class="sheet paper-grain">
      <button class="close" onclick={close} aria-label="關閉">×</button>
      <span class="stamp top-stamp">晚安</span>
      <div class="content">
        <div class="kicker">睡 眠 計 時</div>

        <div class="dial">
          <svg viewBox="0 0 100 100" class="ring">
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--line)" stroke-width="0.4"/>
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--ink)" stroke-width="0.6"
              stroke-dasharray={DASH} stroke-dashoffset={DASH * (1 - ratio)} stroke-linecap="round"/>
          </svg>
          <div class="numbers">
            <div class="time en">{fmtMMSS(displayLeft)}</div>
            <div class="hint">
              {#if timerStore.running}
                剩餘 · 共 {Math.round(displayTotal / 60)} 分鐘
              {:else}
                預備 · {effectiveMin} 分鐘
              {/if}
            </div>
          </div>
        </div>

        <div class="presets">
          {#each PRESETS as m (m)}
            <button class:active={(timerStore.running && Math.round(displayTotal / 60) === m) || (!timerStore.running && effectiveMin === m)}
                    onclick={() => start(m)}>
              <span class="en">{m}</span><span class="unit">分</span>
            </button>
          {/each}
        </div>

        <div class="options">
          <button type="button" class="opt" disabled aria-pressed="true">
            <span class="check on" aria-hidden="true"></span>
            結束時淡出音量（{timerStore.fadeOutSec}s）
          </button>
          <button type="button" class="opt" onclick={() => dimScreen = !dimScreen} aria-pressed={dimScreen}>
            <span class="check" class:on={dimScreen} aria-hidden="true"></span>
            結束時逐漸暗下螢幕
          </button>
        </div>

        {#if timerStore.running}
          <button class="cancel" onclick={cancel}>取消計時</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(20, 14, 8, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }
  .sheet {
    width: 100%;
    max-width: 720px;
    background: var(--bg);
    border: 1px solid var(--ink);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
    padding: 48px 40px 36px;
    position: relative;
  }
  .close {
    position: absolute;
    top: 12px;
    right: 18px;
    color: var(--ink-soft);
    font-size: 22px;
    padding: 8px 12px;
    line-height: 1;
    z-index: 3;
  }
  .top-stamp {
    position: absolute;
    right: 28px;
    top: -18px;
    background: var(--bg);
    z-index: 3;
  }
  .content {
    position: relative;
    z-index: 2;
    text-align: center;
  }
  .kicker {
    font-size: 13px;
    color: var(--mute);
    letter-spacing: 0.5em;
    margin-bottom: 24px;
  }
  .dial {
    position: relative;
    width: 220px;
    height: 220px;
    margin: 0 auto;
  }
  .ring {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }
  .numbers {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .time {
    font-size: 56px;
    font-weight: 400;
    line-height: 1;
    letter-spacing: -0.02em;
  }
  .hint {
    font-size: 11px;
    color: var(--mute);
    letter-spacing: 0.3em;
    margin-top: 8px;
  }

  .presets {
    display: flex;
    gap: 1px;
    margin: 32px auto 0;
    background: var(--line);
    border: 1px solid var(--line);
    width: fit-content;
  }
  .presets button {
    padding: 10px 18px;
    min-width: 56px;
    background: var(--bg);
    color: var(--ink);
    font-size: 13px;
    line-height: 1.2;
  }
  .presets button.active {
    background: var(--ink);
    color: var(--bg);
  }
  .presets .unit {
    font-size: 10px;
    margin-left: 3px;
    opacity: 0.6;
  }

  .options {
    display: flex;
    gap: 28px;
    justify-content: center;
    margin-top: 28px;
    font-size: 12px;
    color: var(--ink-soft);
    flex-wrap: wrap;
  }
  .opt {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: inherit;
    background: transparent;
    border: 0;
    font: inherit;
    padding: 4px 0;
  }
  .opt:disabled { cursor: default; }
  .check {
    width: 13px;
    height: 13px;
    border: 1px solid var(--line);
    background: transparent;
    position: relative;
    display: inline-block;
  }
  .check.on {
    border-color: var(--ink);
    background: var(--ink);
  }
  .check.on::after {
    content: '';
    position: absolute;
    inset: 3px;
    background: var(--bg);
  }

  .cancel {
    margin-top: 28px;
    padding: 9px 22px;
    border: 1px solid var(--seal);
    color: var(--seal);
    font-size: 13px;
  }
</style>
