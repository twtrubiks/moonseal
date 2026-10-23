import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUILTIN_STORY_IDS, loadBuiltinStories } from '../../src/lib/story/builtinStories';
import { getSoundById } from '../../src/lib/audio/builtinSounds';

const B = import.meta.env.BASE_URL;

function readStoryJson(id: string): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, '../../public/stories', `${id}.json`), 'utf8'));
}

/** 以 public/stories 的實際檔案回應 fetch，可針對單一 id 改寫回應 */
function stubFetch(override: (id: string) => Response | undefined = () => undefined) {
  const fetchMock = vi.fn(async (url: string) => {
    const id = /stories\/(.+)\.json$/.exec(url)?.[1] ?? '';
    return override(id) ?? new Response(JSON.stringify(readStoryJson(id)), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('builtinStories', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('exposes 5 ids', () => {
    expect(BUILTIN_STORY_IDS).toHaveLength(5);
  });

  it('依 BASE_URL 逐一載入並依宣告順序回傳', async () => {
    const fetchMock = stubFetch();
    const stories = await loadBuiltinStories();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(
      BUILTIN_STORY_IDS.map((id) => `${B}stories/${id}.json`)
    );
    expect(stories.map((s) => s.id)).toEqual([...BUILTIN_STORY_IDS]);
  });

  it('回應非 2xx 時丟出含 id 的錯誤', async () => {
    stubFetch((id) => (id === 'forest-spa' ? new Response('', { status: 404 }) : undefined));
    await expect(loadBuiltinStories()).rejects.toThrow('failed to load story: forest-spa');
  });

  it('JSON 格式錯誤時丟出含 id 與驗證原因的錯誤', async () => {
    stubFetch((id) => (id === 'rainy-fireplace'
      ? new Response(JSON.stringify({ id: 'rainy-fireplace' }), { status: 200 })
      : undefined));
    await expect(loadBuiltinStories()).rejects.toThrow(/^story rainy-fireplace 格式錯誤：story\.nameKey/);
  });

  it('非 Error 的例外也會被包成可讀訊息', async () => {
    stubFetch((id) => {
      if (id !== 'seaside-walk') return undefined;
      const res = new Response('{}', { status: 200 });
      vi.spyOn(res, 'json').mockRejectedValue('bad payload');
      return res;
    });
    await expect(loadBuiltinStories()).rejects.toThrow('story seaside-walk 格式錯誤：bad payload');
  });

  describe('內建夜讀資料完整性（public/stories/*.json）', () => {
    it.each(BUILTIN_STORY_IDS)('%s：id 與檔名一致、只用內建聲音、總長等於段落加總', async (id) => {
      stubFetch();
      const story = (await loadBuiltinStories()).find((s) => s.id === id)!;
      expect(story.builtin).toBe(true);
      expect(story.segments.length).toBeGreaterThan(0);
      for (const seg of story.segments) {
        expect(getSoundById(seg.soundId), `${id} 用了未知聲音 ${seg.soundId}`).toBeDefined();
        // crossfade 不可長於段落本身，否則下一段開始時上一段還沒淡完
        expect(seg.crossfadeSec).toBeLessThanOrEqual(seg.durationSec);
      }
      const sum = story.segments.reduce((s, seg) => s + seg.durationSec, 0);
      expect(story.totalDurationSec).toBe(sum);
    });
  });
});
