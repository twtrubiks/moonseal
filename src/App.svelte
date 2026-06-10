<script lang="ts">
  import Home from './routes/Home.svelte';
  import Mixer from './routes/Mixer.svelte';
  import Stories from './routes/Stories.svelte';
  import StoryPlayer from './routes/StoryPlayer.svelte';
  import StoryEditor from './routes/StoryEditor.svelte';
  import Library from './routes/Library.svelte';
  import Header from './components/Header.svelte';
  import MobileTabBar from './components/MobileTabBar.svelte';
  import PlayerBar from './components/PlayerBar.svelte';
  import Toast from './components/Toast.svelte';
  import TimerFAB from './components/TimerFAB.svelte';
  import TimerSheet from './components/TimerSheet.svelte';
  import { uiStore } from './lib/stores/uiStore.svelte';

  uiStore.initBreakpoint();
  uiStore.initRouter();

  let storiesKey = $state(0);
</script>

<div class="app paper-grain" class:mobile={uiStore.mobile}>
  <Header />

  <main>
    {#if uiStore.currentStory}
      <StoryPlayer story={uiStore.currentStory} onClose={() => uiStore.closeStory()} />
    {:else if uiStore.route === 'home'}
      <Home />
    {:else if uiStore.route === 'mix'}
      <Mixer />
    {:else if uiStore.route === 'story'}
      {#key storiesKey}
        <Stories
          onSelect={(s) => uiStore.openStory(s)}
          onCreate={() => uiStore.openEditor(null)}
          onEdit={(s) => uiStore.openEditor(s)}
        />
      {/key}
    {:else if uiStore.route === 'mine'}
      <Library />
    {/if}
  </main>

  <PlayerBar />

  {#if uiStore.mobile && !uiStore.currentStory}
    <MobileTabBar />
  {/if}

  <TimerFAB />
  <TimerSheet />

  {#if uiStore.editor.open}
    <StoryEditor
      initial={uiStore.editor.initial}
      onClose={() => uiStore.closeEditor()}
      onSaved={() => { uiStore.closeEditor(); storiesKey++; }}
    />
  {/if}

  <Toast />
</div>

<style>
  .app {
    min-height: 100dvh;
    background: var(--bg);
    color: var(--ink);
    overflow-x: hidden;
  }
  main {
    position: relative;
    z-index: 2;
    /* desktop: 為底部 player bar 留空間 */
    padding-bottom: 88px;
  }
  .app.mobile main {
    /* mobile: tabbar(56) + player bar(58) + 安全邊 */
    padding-bottom: calc(140px + env(safe-area-inset-bottom));
  }
</style>
