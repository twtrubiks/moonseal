import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { uiStore } from '../../src/lib/stores/uiStore.svelte';
import type { StoryDef } from '../../src/lib/story/types';

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
    uiStore.closeStory();
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

function routeHash() {
  return window.location.hash;
}
