import { describe, it, expect, vi, beforeEach } from 'vitest';

async function freshStore() {
  vi.resetModules();
  return (await import('../../src/lib/stores/uiStore.svelte')).uiStore;
}

describe('uiStore — 初始狀態與 initRouter', () => {
  beforeEach(() => {
    history.replaceState(null, '', '#');
  });

  it('全新的 store：首頁、非 mobile、沒有任何 overlay', async () => {
    const ui = await freshStore();
    expect(ui.route).toBe('home');
    expect(ui.mobile).toBe(false);
    expect(ui.timerSheetOpen).toBe(false);
    expect(ui.editor).toEqual({ open: false, initial: null });
    expect(ui.currentStory).toBeNull();
  });

  it.each(['home', 'mix', 'story', 'mine'] as const)('initRouter 從 #/%s 還原分頁並正規化 hash', async (route) => {
    history.replaceState(null, '', `#/${route}`);
    const ui = await freshStore();
    ui.initRouter();
    expect(ui.route).toBe(route);
    expect(window.location.hash).toBe(`#/${route}`);
  });

  it('initRouter 遇到無效 hash 留在首頁，並把 hash 改寫成 #/home', async () => {
    history.replaceState(null, '', '#/settings');
    const ui = await freshStore();
    const replace = vi.spyOn(history, 'replaceState');
    ui.initRouter();
    expect(ui.route).toBe('home');
    expect(replace).toHaveBeenCalledWith(null, '', '#/home');
    replace.mockRestore();
  });

  it('initRouter 接上 popstate 監聽', async () => {
    const ui = await freshStore();
    const add = vi.spyOn(window, 'addEventListener');
    ui.initRouter();
    expect(add).toHaveBeenCalledWith('popstate', expect.any(Function));
    add.mockRestore();
  });

  it('啟動後的第一個返回鍵就能關 overlay（不會被當成要略過的 popstate）', async () => {
    const ui = await freshStore();
    ui.initRouter();
    ui.openStory({ id: 's', nameKey: '', description: '', builtin: true, segments: [], totalDurationSec: 0 });
    history.back();
    await new Promise((r) => setTimeout(r, 20));
    expect(ui.currentStory).toBeNull();
  });

  it('啟動後的第一個 root 層 popstate 就會同步分頁', async () => {
    const ui = await freshStore();
    ui.initRouter();
    history.replaceState(null, '', '#/mine');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(ui.route).toBe('mine');
  });
});
