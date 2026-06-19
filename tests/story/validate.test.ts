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

  it.each([
    ['soundId 空字串', { ...goodSeg, soundId: '' }],
    ['durationSec 為 0', { ...goodSeg, durationSec: 0 }],
    ['durationSec 負數', { ...goodSeg, durationSec: -1 }],
    ['crossfadeSec 負數', { ...goodSeg, crossfadeSec: -1 }],
    ['volume 超出範圍', { ...goodSeg, volume: 1.5 }],
    ['volume 為 NaN', { ...goodSeg, volume: NaN }],
    ['poeticText 非字串', { ...goodSeg, poeticText: 123 }],
    ['不是物件', null]
  ])('拒絕 %s', (_label, bad) => {
    expect(() => validateStorySegment(bad)).toThrow();
  });
});

describe('validateSegments', () => {
  it('允許空陣列（草稿）', () => {
    expect(validateSegments([])).toEqual([]);
  });
  it('非陣列丟錯', () => {
    expect(() => validateSegments({} as unknown)).toThrow();
  });
  it('其中一段無效就整體丟錯', () => {
    expect(() => validateSegments([goodSeg, { ...goodSeg, volume: 9 }])).toThrow();
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

  it.each([
    ['id 無效', { ...goodStory, id: '' }],
    ['builtin 非布林', { ...goodStory, builtin: 'yes' }],
    ['segments 為空', { ...goodStory, segments: [] }],
    ['description 非字串', { ...goodStory, description: null }],
    ['不是物件', 'nope']
  ])('拒絕 %s', (_label, bad) => {
    expect(() => validateStoryDef(bad)).toThrow();
  });
});
