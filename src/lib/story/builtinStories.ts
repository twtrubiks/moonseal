import type { StoryDef } from './types';
import { validateStoryDef } from './validate';

export const BUILTIN_STORY_IDS = [
  'seaside-walk',
  'rainy-fireplace',
  'forest-spa',
  'mountain-stream',
  'summer-thunder'
] as const;

export type BuiltinStoryId = typeof BUILTIN_STORY_IDS[number];

export async function loadBuiltinStories(): Promise<StoryDef[]> {
  const out: StoryDef[] = [];
  for (const id of BUILTIN_STORY_IDS) {
    const res = await fetch(`${import.meta.env.BASE_URL}stories/${id}.json`);
    if (!res.ok) throw new Error(`failed to load story: ${id}`);
    try {
      out.push(validateStoryDef(await res.json()));
    } catch (e) {
      throw new Error(`story ${id} 格式錯誤：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}
