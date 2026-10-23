import { describe, it, expect } from 'vitest';
import {
  validateStorySegment,
  validateSegments,
  validateStoryDef
} from '../../src/lib/story/validate';

const goodSeg = { soundId: 'rain', durationSec: 60, crossfadeSec: 5, volume: 0.7 };
const goodStory = {
  id: 'seaside',
  nameKey: '海邊',
  description: '',
  builtin: true,
  segments: [goodSeg],
  totalDurationSec: 60
};

describe('validateStorySegment', () => {
  it('接受合法段落並剝除未知欄位', () => {
    const seg = validateStorySegment({ ...goodSeg, poeticText: '海', junk: 1 });
    expect(seg).toEqual({ soundId: 'rain', durationSec: 60, crossfadeSec: 5, volume: 0.7, poeticText: '海' });
    expect('junk' in seg).toBe(false);
  });

  it('poeticText 可省略', () => {
    expect(validateStorySegment(goodSeg).poeticText).toBeUndefined();
  });

  it('poeticText 省略時不留下 undefined 欄位（exactOptionalPropertyTypes / IDB 存檔乾淨）', () => {
    expect('poeticText' in validateStorySegment(goodSeg)).toBe(false);
    expect('poeticText' in validateStorySegment({ ...goodSeg, poeticText: undefined })).toBe(false);
  });

  it('poeticText 允許空字串', () => {
    expect(validateStorySegment({ ...goodSeg, poeticText: '' }).poeticText).toBe('');
  });

  it.each([
    ['crossfadeSec 為 0', { ...goodSeg, crossfadeSec: 0 }],
    ['volume 為 0', { ...goodSeg, volume: 0 }],
    ['volume 為 1', { ...goodSeg, volume: 1 }],
    ['durationSec 為極小正數', { ...goodSeg, durationSec: 0.001 }]
  ])('接受邊界值：%s', (_label, seg) => {
    expect(validateStorySegment(seg)).toEqual(seg);
  });

  it.each([
    ['soundId 空字串', { ...goodSeg, soundId: '' }, 'segment: soundId 無效'],
    ['soundId 非字串（有 length 的陣列）', { ...goodSeg, soundId: ['rain'] }, 'segment: soundId 無效'],
    ['durationSec 為 0', { ...goodSeg, durationSec: 0 }, 'segment: durationSec 必須為正數'],
    ['durationSec 負數', { ...goodSeg, durationSec: -1 }, 'segment: durationSec 必須為正數'],
    ['durationSec 為 Infinity', { ...goodSeg, durationSec: Infinity }, 'segment: durationSec 必須為正數'],
    ['durationSec 為字串', { ...goodSeg, durationSec: '60' }, 'segment: durationSec 必須為正數'],
    ['crossfadeSec 負數', { ...goodSeg, crossfadeSec: -1 }, 'segment: crossfadeSec 必須 >= 0'],
    ['crossfadeSec 缺少', { ...goodSeg, crossfadeSec: undefined }, 'segment: crossfadeSec 必須 >= 0'],
    ['volume 超出範圍', { ...goodSeg, volume: 1.5 }, 'segment: volume 必須在 0..1'],
    ['volume 略大於 1', { ...goodSeg, volume: 1.0001 }, 'segment: volume 必須在 0..1'],
    ['volume 負數', { ...goodSeg, volume: -0.1 }, 'segment: volume 必須在 0..1'],
    ['volume 為 NaN', { ...goodSeg, volume: NaN }, 'segment: volume 必須在 0..1'],
    ['poeticText 非字串', { ...goodSeg, poeticText: 123 }, 'segment: poeticText 必須是字串'],
    ['不是物件', null, 'segment: 不是物件'],
    ['原始型別', 'rain', 'segment: 不是物件']
  ])('拒絕 %s', (_label, bad, message) => {
    expect(() => validateStorySegment(bad)).toThrow(message);
  });

  it('錯誤訊息帶上呼叫端給的位置', () => {
    expect(() => validateStorySegment(null, 'segment[3]')).toThrow('segment[3]: 不是物件');
  });
});

describe('validateSegments', () => {
  it('允許空陣列（草稿）', () => {
    expect(validateSegments([])).toEqual([]);
  });
  it('非陣列丟錯', () => {
    expect(() => validateSegments({} as unknown)).toThrow('segments 必須是陣列');
    expect(() => validateSegments({ length: 0 } as unknown)).toThrow('segments 必須是陣列');
  });
  it('其中一段無效就整體丟錯，訊息指出是第幾段', () => {
    expect(() => validateSegments([goodSeg, { ...goodSeg, volume: 9 }])).toThrow('segment[1]: volume 必須在 0..1');
  });
  it('回傳逐段正規化後的新陣列', () => {
    const out = validateSegments([{ ...goodSeg, junk: 1 }, goodSeg]);
    expect(out).toEqual([goodSeg, goodSeg]);
  });
});

describe('validateStoryDef', () => {
  it('接受合法 story', () => {
    expect(validateStoryDef(goodStory)).toMatchObject({ id: 'seaside', builtin: true });
  });

  it('totalDurationSec 缺失時由段落推算', () => {
    const { totalDurationSec: _omit, ...noTotal } = goodStory;
    const story = validateStoryDef({ ...noTotal, segments: [goodSeg, goodSeg] });
    expect(story.totalDurationSec).toBe(120);
  });

  it('剝除未知欄位', () => {
    const story = validateStoryDef({ ...goodStory, evil: '<script>' });
    expect('evil' in story).toBe(false);
  });

  it('回傳完整正規化後的物件', () => {
    expect(validateStoryDef(goodStory)).toEqual(goodStory);
  });

  it.each([
    ['為 0 時保留', 0, 0],
    ['為正數時保留（即使與段落加總不同）', 999, 999],
    ['為負數時改由段落推算', -1, 60],
    ['為 NaN 時改由段落推算', NaN, 60],
    ['為 Infinity 時改由段落推算', Infinity, 60],
    ['為字串時改由段落推算', '60', 60]
  ])('totalDurationSec %s', (_label, total, expected) => {
    expect(validateStoryDef({ ...goodStory, totalDurationSec: total }).totalDurationSec).toBe(expected);
  });

  it.each([
    ['id 無效', { ...goodStory, id: '' }, 'story.id 無效'],
    ['nameKey 非字串', { ...goodStory, nameKey: 1 }, 'story.nameKey 必須是字串'],
    ['builtin 非布林', { ...goodStory, builtin: 'yes' }, 'story.builtin 必須是布林'],
    ['segments 為空', { ...goodStory, segments: [] }, 'story.segments 不可為空'],
    ['segments 非陣列', { ...goodStory, segments: 'x' }, 'segments 必須是陣列'],
    ['description 非字串', { ...goodStory, description: null }, 'story.description 必須是字串'],
    ['不是物件', 'nope', 'story 不是物件'],
    ['null', null, 'story 不是物件']
  ])('拒絕 %s', (_label, bad, message) => {
    expect(() => validateStoryDef(bad)).toThrow(message);
  });

  it('nameKey 允許空字串（自訂夜讀可以先不命名）', () => {
    expect(validateStoryDef({ ...goodStory, nameKey: '' }).nameKey).toBe('');
  });
});
