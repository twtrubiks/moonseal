import type { StoryDef, StorySegment } from './types';

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}
function isFiniteNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}
function isNonEmptyStr(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

/** 驗證單一段落，回傳只含已知欄位的乾淨物件；無效則 throw */
export function validateStorySegment(x: unknown, where = 'segment'): StorySegment {
  if (!isObj(x)) throw new Error(`${where}: 不是物件`);
  if (!isNonEmptyStr(x.soundId)) throw new Error(`${where}: soundId 無效`);
  if (!isFiniteNum(x.durationSec) || x.durationSec <= 0) throw new Error(`${where}: durationSec 必須為正數`);
  if (!isFiniteNum(x.crossfadeSec) || x.crossfadeSec < 0) throw new Error(`${where}: crossfadeSec 必須 >= 0`);
  if (!isFiniteNum(x.volume) || x.volume < 0 || x.volume > 1) throw new Error(`${where}: volume 必須在 0..1`);
  if (x.poeticText !== undefined && typeof x.poeticText !== 'string') throw new Error(`${where}: poeticText 必須是字串`);
  const seg: StorySegment = {
    soundId: x.soundId,
    durationSec: x.durationSec,
    crossfadeSec: x.crossfadeSec,
    volume: x.volume
  };
  if (typeof x.poeticText === 'string') seg.poeticText = x.poeticText;
  return seg;
}

/** 驗證段落陣列（允許空陣列，對應尚未編好的草稿）；無效則 throw */
export function validateSegments(x: unknown): StorySegment[] {
  if (!Array.isArray(x)) throw new Error('segments 必須是陣列');
  return x.map((s, i) => validateStorySegment(s, `segment[${i}]`));
}

/** 驗證並正規化整個 StoryDef（剝除未知欄位）；無效則 throw。totalDurationSec 缺失時由段落推算 */
export function validateStoryDef(x: unknown): StoryDef {
  if (!isObj(x)) throw new Error('story 不是物件');
  if (!isNonEmptyStr(x.id)) throw new Error('story.id 無效');
  if (typeof x.nameKey !== 'string') throw new Error('story.nameKey 必須是字串');
  if (typeof x.description !== 'string') throw new Error('story.description 必須是字串');
  if (typeof x.builtin !== 'boolean') throw new Error('story.builtin 必須是布林');
  const segments = validateSegments(x.segments);
  if (segments.length === 0) throw new Error('story.segments 不可為空');
  const totalDurationSec = isFiniteNum(x.totalDurationSec) && x.totalDurationSec >= 0
    ? x.totalDurationSec
    : segments.reduce((sum, s) => sum + s.durationSec, 0);
  return {
    id: x.id,
    nameKey: x.nameKey,
    description: x.description,
    builtin: x.builtin,
    segments,
    totalDurationSec
  };
}
