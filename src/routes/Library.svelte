<script lang="ts">
  import { favoritesRepo } from '../lib/storage/FavoritesRepo';
  import { recentsRepo } from '../lib/storage/RecentsRepo';
  import { mixRepo } from '../lib/storage/MixRepo';
  import { getSoundById, BUILTIN_SOUNDS } from '../lib/audio/builtinSounds';
  import { loadBuiltinStories } from '../lib/story/builtinStories';
  import { storyRepo } from '../lib/storage/StoryRepo';
  import { audioStore } from '../lib/stores/audioStore.svelte';
  import { timerStore } from '../lib/stores/timerStore.svelte';
  import { uiStore } from '../lib/stores/uiStore.svelte';
  import { toastStore } from '../lib/stores/toastStore.svelte';
  import Glyph from '../components/Glyph.svelte';
  import VolumeSlider from '../components/VolumeSlider.svelte';
  import type { FavoriteRecord, RecentRecord, MixRecord } from '../lib/storage/db';

  const FADE_PRESETS = [0, 10, 20, 30, 45, 60] as const;
  const TIMER_PRESETS = [15, 30, 45, 60, 90] as const;

  let favorites = $state<FavoriteRecord[]>([]);
  let recents = $state<RecentRecord[]>([]);
  let mixes = $state<MixRecord[]>([]);
  let storyTitles = $state<Record<string, string>>({});

  async function refresh() {
    const [fav, rec, mix, builtin, custom] = await Promise.all([
      favoritesRepo.listAll(),
      recentsRepo.listRecent(),
      mixRepo.listAll(),
      loadBuiltinStories().catch(() => []),
      storyRepo.listAll().catch(() => [])
    ]);
    favorites = fav;
    recents = rec;
    mixes = mix;
    const titles: Record<string, string> = {};
    for (const s of builtin) titles[s.id] = s.nameKey;
    for (const s of custom) titles[s.id] = s.nameKey;
    storyTitles = titles;
  }

  $effect(() => { void refresh(); });

  async function playSound(refId: string) {
    await audioStore.toggleSound(refId, 0.7);
    await refresh();
  }

  async function applyMix(m: MixRecord) {
    await audioStore.stopAll(0.3);
    for (const t of m.tracks) {
      await audioStore.toggleSound(t.soundId, t.volume);
      audioStore.setVolume(t.soundId, t.volume);
    }
    toastStore.show(`已套用「${m.name}」`);
  }

  async function deleteMix(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('刪除這個混音？')) return;
    const m = mixes.find((x) => x.id === id);
    await mixRepo.delete(id);
    if (m && audioStore.mode === 'mix') {
      const a = new Set(m.tracks.map((t) => t.soundId));
      const b = new Set(Object.keys(audioStore.tracks));
      const same = a.size === b.size && [...a].every((id) => b.has(id));
      if (same) await audioStore.stopAll(0.3);
    }
    await refresh();
  }

  async function removeFav(e: MouseEvent, id: string) {
    e.stopPropagation();
    await favoritesRepo.remove(id);
    await refresh();
  }

  function relTime(ts: number): string {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return '剛剛';
    if (min < 60) return `${min} 分鐘前`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} 小時前`;
    const d = Math.floor(h / 24);
    return `${d} 天前`;
  }

  let soundFavs = $derived(favorites.filter((f) => f.type === 'sound'));
</script>

<section class:mobile={uiStore.mobile}>
  <div class="title">
    <h1>我的</h1>
    <span class="subtitle">收藏 · 我的混音 · 最近播放</span>
  </div>
  <div class="hline"></div>

  <div class="block">
    <div class="section-label">收藏聲音</div>
    <div class="chips">
      {#if soundFavs.length === 0}
        <div class="empty-inline">還沒有收藏 — 在首頁聲音卡片右上角點愛心。</div>
      {:else}
        {#each soundFavs as f (f.id)}
          {@const s = getSoundById(f.refId)}
          {#if s}
            <span class="chip">
              <button class="chip-hit" onclick={() => playSound(s.id)}>
                <Glyph kind={s.iconKey} size={16} sw={1}/>
                {s.nameKey}
              </button>
              <button class="chip-x" onclick={(e) => removeFav(e, f.id)} aria-label="移除收藏">
                <Glyph kind="close" size={10}/>
              </button>
            </span>
          {/if}
        {/each}
      {/if}
    </div>
  </div>

  <div class="block">
    <div class="section-label">我的混音</div>
    {#if mixes.length === 0}
      <div class="empty">
        <div class="empty-title">還沒有自訂混音</div>
        <div class="empty-hint">在「混音」頁多選音效後點「儲存為我的混音」。</div>
      </div>
    {:else}
      <div class="grid">
        {#each mixes as m (m.id)}
          <div class="mix">
            <button class="mix-hit" onclick={() => applyMix(m)} aria-label={`套用 ${m.name}`}>
              <span class="mix-name">{m.name}</span>
              <span class="mix-tracks">
                {m.tracks.map((t) => getSoundById(t.soundId)?.nameKey ?? t.soundId).join(' · ')}
              </span>
              <span class="en mix-time">{relTime(m.createdAt)}</span>
            </button>
            <button class="del" onclick={(e) => deleteMix(e, m.id)} aria-label="刪除">
              <Glyph kind="close" size={12}/>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="block">
    <div class="section-label">最近播放</div>
    {#if recents.length === 0}
      <div class="empty-inline">尚未播放任何聲音</div>
    {:else}
      <div class="recents">
        {#each recents as r, i (r.id)}
          {@const s = r.type === 'sound' ? getSoundById(r.refId) : null}
          {#if s}
            <button class="recent" onclick={() => playSound(s.id)}>
              <span class="num en">0{i + 1}</span>
              <span class="r-glyph"><Glyph kind={s.iconKey} size={18} sw={1}/></span>
              <span class="r-name">{s.nameKey}</span>
              <span class="en r-time">{relTime(r.playedAt)}</span>
            </button>
          {:else}
            <div class="recent inert">
              <span class="num en">0{i + 1}</span>
              <span class="r-glyph"><Glyph kind="moon" size={18} sw={1}/></span>
              <span class="r-name">{r.type === 'story' ? `夜讀 · ${storyTitles[r.refId] ?? r.refId}` : `${r.type} · ${r.refId}`}</span>
              <span class="en r-time">{relTime(r.playedAt)}</span>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  <div class="block">
    <div class="section-label">設定</div>
    <div class="settings">
      <div class="setting">
        <div class="setting-head">
          <span class="setting-name">主音量</span>
          <span class="setting-val en">{Math.round(audioStore.masterVolume * 100)}%</span>
        </div>
        <VolumeSlider value={audioStore.masterVolume} oninput={(v) => audioStore.setMasterVolume(v)} />
      </div>

      <div class="setting">
        <div class="setting-head">
          <span class="setting-name">計時結束淡出</span>
          <span class="setting-val en">{timerStore.fadeOutSec === 0 ? '關閉' : `${timerStore.fadeOutSec}s`}</span>
        </div>
        <div class="seg">
          {#each FADE_PRESETS as f (f)}
            <button class:active={timerStore.fadeOutSec === f} onclick={() => timerStore.setFadeOutSec(f)}>
              {f === 0 ? '關' : `${f}s`}
            </button>
          {/each}
        </div>
      </div>

      <div class="setting">
        <div class="setting-head">
          <span class="setting-name">預設計時時長</span>
          <span class="setting-val en">{timerStore.defaultTimerMin} 分</span>
        </div>
        <div class="seg">
          {#each TIMER_PRESETS as m (m)}
            <button class:active={timerStore.defaultTimerMin === m} onclick={() => timerStore.setDefaultTimerMin(m)}>
              <span class="en">{m}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  section {
    padding: 32px 56px 32px;
    position: relative;
    z-index: 2;
  }
  section.mobile { padding: 16px 24px 32px; }
  .title { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
  h1 {
    font-size: clamp(36px, 5vw, 56px);
    font-weight: 500;
    line-height: 1;
    letter-spacing: 0.02em;
    margin: 0;
  }
  .subtitle {
    font-size: 13px;
    color: var(--mute);
    padding-bottom: 8px;
    letter-spacing: 0.1em;
  }
  .hline {
    height: 1px;
    background: var(--line);
    transform: scaleY(0.5);
    margin: 18px 0 24px;
  }
  .block { margin-top: 24px; }
  .section-label {
    font-size: 11px;
    letter-spacing: 0.4em;
    color: var(--mute);
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .chips { display: flex; flex-wrap: wrap; gap: 10px; }
  .chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--line);
    color: var(--ink);
    font-size: 14px;
  }
  .chip:hover { border-color: var(--ink); }
  .chip-hit {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 14px;
    color: inherit;
    background: transparent;
    border: 0;
    cursor: pointer;
  }
  .chip-x {
    padding: 8px 10px;
    color: var(--mute);
    border-left: 1px solid var(--line);
    line-height: 0;
  }
  .chip-x:hover { color: var(--seal); }

  .empty {
    padding: 24px 22px;
    border: 1px dashed var(--line);
    text-align: center;
    color: var(--mute);
  }
  .empty-title { font-size: 13px; margin-bottom: 4px; }
  .empty-hint { font-size: 11px; font-style: italic; }
  .empty-inline {
    color: var(--mute);
    font-size: 13px;
    font-style: italic;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  section.mobile .grid { grid-template-columns: 1fr; }
  .mix {
    position: relative;
    border: 1px solid var(--line);
    background: var(--bg-elev);
  }
  .mix:hover { border-color: var(--ink); }
  .mix-hit {
    width: 100%;
    text-align: left;
    padding: 16px 18px;
    background: transparent;
    border: 0;
    cursor: pointer;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mix-name { display: block; font-size: 16px; font-weight: 500; }
  .mix-tracks {
    display: block;
    font-size: 12px;
    color: var(--ink-soft);
    line-height: 1.55;
  }
  .mix-time {
    display: block;
    font-size: 10px;
    color: var(--mute);
    letter-spacing: 0.15em;
    margin-top: 4px;
  }
  .del {
    position: absolute;
    top: 8px;
    right: 8px;
    color: var(--mute);
    padding: 6px;
    line-height: 0;
  }
  .del:hover { color: var(--seal); }

  .recents { display: flex; flex-direction: column; }
  .recent {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 4px;
    border-bottom: 1px solid var(--line-soft);
    cursor: pointer;
    background: transparent;
    border-top: 0;
    border-left: 0;
    border-right: 0;
    color: inherit;
    text-align: left;
    width: 100%;
  }
  .recent:hover { background: var(--bg-elev); }
  .recent.inert { cursor: default; }
  .recent.inert:hover { background: transparent; }
  .num { font-size: 11px; color: var(--mute); min-width: 18px; }
  .r-glyph { color: var(--ink-soft); line-height: 0; }
  .r-name { font-size: 14px; flex: 1; }
  .r-time { font-size: 11px; color: var(--mute); }

  .settings {
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 460px;
  }
  .setting-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 10px;
  }
  .setting-name { font-size: 14px; }
  .setting-val { font-size: 12px; color: var(--mute); letter-spacing: 0.08em; }
  .seg {
    display: flex;
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    width: fit-content;
  }
  .seg button {
    padding: 8px 14px;
    min-width: 46px;
    background: var(--bg);
    color: var(--ink);
    font-size: 13px;
    line-height: 1.2;
    cursor: pointer;
  }
  .seg button.active {
    background: var(--ink);
    color: var(--bg);
  }
</style>
