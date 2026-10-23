import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toastStore } from '../../src/lib/stores/toastStore.svelte';

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const t of toastStore.toasts) toastStore.dismiss(t.id);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('show() 預設為 info，依序累加且 id 遞增不重複', () => {
    toastStore.show('a');
    toastStore.show('b', 'error');
    const [a, b] = toastStore.toasts;
    expect(a).toMatchObject({ text: 'a', kind: 'info' });
    expect(b).toMatchObject({ text: 'b', kind: 'error' });
    expect(b!.id).toBeGreaterThan(a!.id);
  });

  it('3.5 秒後自動消失，且只移除自己那則', () => {
    toastStore.show('first');
    vi.advanceTimersByTime(1000);
    toastStore.show('second');

    vi.advanceTimersByTime(2499);
    expect(toastStore.toasts.map((t) => t.text)).toEqual(['first', 'second']);
    vi.advanceTimersByTime(1);
    expect(toastStore.toasts.map((t) => t.text)).toEqual(['second']);
    vi.advanceTimersByTime(1000);
    expect(toastStore.toasts).toEqual([]);
  });

  it('dismiss() 只移除指定 id', () => {
    toastStore.show('keep');
    toastStore.show('drop');
    const drop = toastStore.toasts.find((t) => t.text === 'drop')!;
    toastStore.dismiss(drop.id);
    expect(toastStore.toasts.map((t) => t.text)).toEqual(['keep']);
  });

  it('全新的 store 沒有任何 toast', async () => {
    vi.resetModules();
    const fresh = (await import('../../src/lib/stores/toastStore.svelte')).toastStore;
    expect(fresh.toasts).toEqual([]);
  });
});
