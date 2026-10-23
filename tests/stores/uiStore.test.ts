import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { uiStore } from '../../src/lib/stores/uiStore.svelte';
import type { StoryDef } from '../../src/lib/story/types';
import type { CustomStoryRecord } from '../../src/lib/storage/StoryRepo';

const story: StoryDef = {
  id: 'test-story',
  nameKey: '測試',
  description: '',
  builtin: false,
  totalDurationSec: 30,
  segments: []
};

/** 等待 jsdom 的非同步 history traversal（back/go）觸發 popstate */
async function flushHistory() {
  await new Promise((r) => setTimeout(r, 20));
}

beforeAll(() => {
  window.location.hash = '#/mix';
  uiStore.initRouter();
});

beforeEach(async () => {
  // setRoute 會關掉所有 overlay 並收掉它們的 history entries
  uiStore.setRoute('home');
  await flushHistory();
});

describe('uiStore — hash 路由', () => {
  it('initRouter 從 hash 還原分頁（重新整理不再回首頁）', () => {
    // beforeAll 在 hash=#/mix 時 init，之後 beforeEach 已切回 home
    // 這裡驗證的是 init 當下確實吃到 #/mix：route 曾被還原才會有後續 hash 變化
    expect(routeHash()).toBe('#/home');
  });

  it('setRoute 以 replaceState 同步 hash，不增加 history entry', () => {
    const len = history.length;
    uiStore.setRoute('story');
    expect(routeHash()).toBe('#/story');
    expect(history.length).toBe(len);
  });

  it('popstate 時從 hash 同步分頁（瀏覽器前進/後退、手動改 hash）', () => {
    window.location.hash = '#/mine';
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(uiStore.route).toBe('mine');
  });

  it('popstate 回到 #/home 也會切回首頁', () => {
    uiStore.setRoute('mine');
    window.location.hash = '#/home';
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(uiStore.route).toBe('home');
  });

  it('hash 省略斜線（#story）也能解析', () => {
    window.location.hash = '#story';
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(uiStore.route).toBe('story');
  });

  it.each(['#/unknown', '#/', '', '#/mix/extra', '#//mix'])('未知或格式不符的 hash %j 不改變分頁', (hash) => {
    uiStore.setRoute('mine');
    window.location.hash = hash;
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(uiStore.route).toBe('mine');
  });
});

describe('uiStore — 返回鍵關閉 overlay', () => {
  it('openStory 推入 history entry，返回鍵關閉 player 而非離開', async () => {
    const len = history.length;
    uiStore.openStory(story);
    expect(history.length).toBe(len + 1);

    history.back();
    await flushHistory();
    expect(uiStore.currentStory).toBeNull();
  });

  it('timer sheet 也一樣：返回鍵先關 sheet', async () => {
    uiStore.openTimer();
    history.back();
    await flushHistory();
    expect(uiStore.timerSheetOpen).toBe(false);
  });

  it('overlay 疊層時返回鍵由上往下關：先 timer sheet 再 story player', async () => {
    uiStore.openStory(story);
    uiStore.openTimer();

    history.back();
    await flushHistory();
    expect(uiStore.timerSheetOpen).toBe(false);
    expect(uiStore.currentStory).not.toBeNull();

    history.back();
    await flushHistory();
    expect(uiStore.currentStory).toBeNull();
  });

  it('UI 主動關閉會收掉 entry：closeStory 後返回鍵不會再多關一層', async () => {
    uiStore.openStory(story);
    const back = vi.spyOn(history, 'back');
    uiStore.closeStory();
    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
    await flushHistory();
    expect(uiStore.currentStory).toBeNull();

    // entry 已被收掉，再開 timer 後返回鍵應該關的是 timer
    uiStore.openTimer();
    history.back();
    await flushHistory();
    expect(uiStore.timerSheetOpen).toBe(false);
  });

  it('story player 開著時點桌面 nav：關 player、收 entry、hash 跟著新分頁', async () => {
    uiStore.openStory(story);
    uiStore.setRoute('mine');
    expect(uiStore.currentStory).toBeNull();
    expect(uiStore.route).toBe('mine');

    await flushHistory();
    expect(routeHash()).toBe('#/mine');
  });
});

const draft: CustomStoryRecord = {
  id: 'draft-1',
  nameKey: '草稿',
  description: '',
  builtin: false,
  segments: [],
  totalDurationSec: 0,
  createdAt: 1,
  updatedAt: 1
};

describe('uiStore — editor overlay', () => {
  it('openEditor 推入 entry，返回鍵關閉 editor 並清掉 initial', async () => {
    const push = vi.spyOn(history, 'pushState');
    uiStore.openEditor(draft);
    expect(uiStore.editor).toEqual({ open: true, initial: draft });
    expect(push).toHaveBeenCalledOnce();
    push.mockRestore();

    history.back();
    await flushHistory();
    expect(uiStore.editor).toEqual({ open: false, initial: null });
  });

  it('openEditor 不帶參數時 initial 為 null（新建）', () => {
    uiStore.openEditor();
    expect(uiStore.editor).toEqual({ open: true, initial: null });
  });

  it('editor 已開時再 openEditor 只換內容、不再推 entry', () => {
    uiStore.openEditor(null);
    const push = vi.spyOn(history, 'pushState');
    uiStore.openEditor(draft);
    expect(uiStore.editor).toEqual({ open: true, initial: draft });
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it('closeEditor 收掉 entry；之後的返回鍵關的是下一層 overlay', async () => {
    uiStore.openStory(story);
    uiStore.openEditor(draft);
    const back = vi.spyOn(history, 'back');
    uiStore.closeEditor();
    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
    await flushHistory();
    expect(uiStore.editor.open).toBe(false);
    expect(uiStore.currentStory).not.toBeNull();

    history.back();
    await flushHistory();
    expect(uiStore.currentStory).toBeNull();
  });

  it('closeTimer 收掉 entry；之後的返回鍵關的是下一層 overlay', async () => {
    uiStore.openStory(story);
    uiStore.openTimer();
    const back = vi.spyOn(history, 'back');
    uiStore.closeTimer();
    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
    expect(uiStore.timerSheetOpen).toBe(false);
    await flushHistory();
    expect(uiStore.currentStory).not.toBeNull();

    history.back();
    await flushHistory();
    expect(uiStore.currentStory).toBeNull();
  });

  it('關一個沒開的 overlay 時，不能收掉其他 overlay 的 entry', async () => {
    uiStore.openStory(story);
    const back = vi.spyOn(history, 'back');
    uiStore.closeTimer();
    uiStore.closeEditor();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();

    uiStore.closeStory();
    await flushHistory();
    uiStore.openTimer();
    const back2 = vi.spyOn(history, 'back');
    uiStore.closeStory();
    expect(back2).not.toHaveBeenCalled();
    back2.mockRestore();
    expect(uiStore.timerSheetOpen).toBe(true);
  });

  it('close* 在對應 overlay 沒開時是 no-op，不會呼叫 history.back()', () => {
    const back = vi.spyOn(history, 'back');
    uiStore.closeEditor();
    uiStore.closeTimer();
    uiStore.closeStory();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('openTimer / openStory 重複呼叫不重複推 entry', () => {
    const push = vi.spyOn(history, 'pushState');
    uiStore.openTimer();
    uiStore.openTimer();
    expect(push).toHaveBeenCalledTimes(1);
    const other: StoryDef = { ...story, id: 'other' };
    uiStore.openStory(story);
    uiStore.openStory(other);
    expect(push).toHaveBeenCalledTimes(2);
    expect(uiStore.currentStory?.id).toBe('other');
    // 每個 entry 帶上自己的疊層深度
    expect(push.mock.calls.map((c) => c[0])).toEqual([{ overlay: 1 }, { overlay: 2 }]);
    push.mockRestore();
  });

  it('疊三層時返回鍵依序關 timer → editor → story', async () => {
    uiStore.openStory(story);
    uiStore.openEditor(draft);
    uiStore.openTimer();

    history.back();
    await flushHistory();
    expect(uiStore.timerSheetOpen).toBe(false);
    expect(uiStore.editor.open).toBe(true);

    history.back();
    await flushHistory();
    expect(uiStore.editor.open).toBe(false);
    expect(uiStore.currentStory).not.toBeNull();

    history.back();
    await flushHistory();
    expect(uiStore.currentStory).toBeNull();
  });

  it('setRoute 一次收掉所有 overlay entries：history.go(-層數)', () => {
    const go = vi.spyOn(history, 'go');
    uiStore.openStory(story);
    uiStore.openEditor(draft);
    uiStore.openTimer();
    uiStore.setRoute('mix');
    expect(go).toHaveBeenCalledWith(-3);
    expect(uiStore.timerSheetOpen).toBe(false);
    expect(uiStore.editor).toEqual({ open: false, initial: null });
    expect(uiStore.currentStory).toBeNull();
    go.mockRestore();
  });

  it('沒有 overlay 時 setRoute 不動 history.go', () => {
    const go = vi.spyOn(history, 'go');
    uiStore.setRoute('mix');
    expect(go).not.toHaveBeenCalled();
    go.mockRestore();
  });

  it('setRoute 收 entry 引發的 popstate 被略過，不會誤關之後新開的 overlay', async () => {
    uiStore.openTimer();
    uiStore.setRoute('story');
    uiStore.openStory(story); // 在 go(-1) 的 popstate 抵達前就開新 overlay
    await flushHistory();
    expect(uiStore.currentStory).not.toBeNull();
    expect(uiStore.route).toBe('story');
    expect(routeHash()).toBe('#/story');
  });
});

describe('uiStore — breakpoint', () => {
  it('依 (min-width: 880px) 判斷 mobile，並跟著 change 事件更新', () => {
    let listener: ((e: { matches: boolean }) => void) | null = null;
    const mql = {
      matches: false,
      addEventListener: (type: string, l: (e: { matches: boolean }) => void) => {
        if (type === 'change') listener = l;
      }
    };
    const matchMedia = vi.fn(() => mql);
    vi.stubGlobal('matchMedia', matchMedia);
    uiStore.initBreakpoint();
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 880px)');
    expect(uiStore.mobile).toBe(true);
    listener!({ matches: true });
    expect(uiStore.mobile).toBe(false);
    listener!({ matches: false });
    expect(uiStore.mobile).toBe(true);
    vi.unstubAllGlobals();
  });
});

function routeHash() {
  return window.location.hash;
}
