import type { StoryDef } from '../story/types';
import type { CustomStoryRecord } from '../storage/StoryRepo';

export type Route = 'home' | 'mix' | 'story' | 'mine';

const ROUTES: readonly Route[] = ['home', 'mix', 'story', 'mine'];

function routeFromHash(hash: string): Route | null {
  const r = hash.replace(/^#\/?/, '');
  return (ROUTES as readonly string[]).includes(r) ? (r as Route) : null;
}

class UIStore {
  route = $state<Route>('home');
  mobile = $state(false);
  timerSheetOpen = $state(false);
  editor = $state<{ open: boolean; initial: CustomStoryRecord | null }>({ open: false, initial: null });
  currentStory = $state<StoryDef | null>(null);

  private mql: MediaQueryList | null = null;
  /** 疊在 history 上的 overlay entry 數（story player / editor / timer sheet） */
  private overlayDepth = 0;
  /** 主動呼叫 history.back()/go() 收 entry 時，要略過的 popstate 次數 */
  private suppressPops = 0;

  initBreakpoint() {
    if (typeof window === 'undefined') return;
    this.mql = window.matchMedia('(min-width: 880px)');
    const apply = (e: MediaQueryListEvent | MediaQueryList) => {
      this.mobile = !e.matches;
    };
    apply(this.mql);
    this.mql.addEventListener('change', apply);
  }

  /** 從 hash 還原分頁，並接管返回鍵：overlay 開著時返回鍵先關 overlay 而非離開 app */
  initRouter() {
    if (typeof window === 'undefined') return;
    const r = routeFromHash(window.location.hash);
    if (r) this.route = r;
    history.replaceState(null, '', `#/${this.route}`);
    window.addEventListener('popstate', () => this.handlePopState());
  }

  private handlePopState() {
    if (this.suppressPops > 0) {
      this.suppressPops--;
      // 狀態已先更新，這裡只把 hash 補正到目前分頁
      history.replaceState(null, '', `#/${this.route}`);
      return;
    }
    if (this.overlayDepth > 0) {
      this.overlayDepth--;
      if (this.timerSheetOpen) this.timerSheetOpen = false;
      else if (this.editor.open) this.editor = { open: false, initial: null };
      else if (this.currentStory) this.currentStory = null;
      return;
    }
    // root 層的前進/後退（例如手動改 hash）：同步分頁
    const r = routeFromHash(window.location.hash);
    if (r) this.route = r;
  }

  private pushOverlay() {
    this.overlayDepth++;
    history.pushState({ overlay: this.overlayDepth }, '');
  }

  /** UI 主動關閉 overlay 時，收掉先前 push 的 history entry */
  private popOverlayEntry() {
    if (this.overlayDepth === 0) return;
    this.overlayDepth--;
    this.suppressPops++;
    history.back();
  }

  setRoute(r: Route) {
    if (this.overlayDepth > 0) {
      // 一次收掉所有 overlay entries（history.go 只觸發一次 popstate）
      this.suppressPops++;
      history.go(-this.overlayDepth);
      this.overlayDepth = 0;
    }
    this.timerSheetOpen = false;
    this.editor = { open: false, initial: null };
    this.currentStory = null;
    this.route = r;
    history.replaceState(null, '', `#/${r}`);
  }

  openTimer() {
    if (this.timerSheetOpen) return;
    this.timerSheetOpen = true;
    this.pushOverlay();
  }
  closeTimer() {
    if (!this.timerSheetOpen) return;
    this.timerSheetOpen = false;
    this.popOverlayEntry();
  }
  openEditor(initial: CustomStoryRecord | null = null) {
    if (this.editor.open) {
      this.editor = { open: true, initial };
      return;
    }
    this.editor = { open: true, initial };
    this.pushOverlay();
  }
  closeEditor() {
    if (!this.editor.open) return;
    this.editor = { open: false, initial: null };
    this.popOverlayEntry();
  }
  openStory(s: StoryDef) {
    if (this.currentStory) {
      this.currentStory = s;
      return;
    }
    this.currentStory = s;
    this.pushOverlay();
  }
  closeStory() {
    if (!this.currentStory) return;
    this.currentStory = null;
    this.popOverlayEntry();
  }
}

export const uiStore = new UIStore();
