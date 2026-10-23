import { describe, it, expect } from 'vitest';
import { fmtMMSS, fmtMin } from '../../src/lib/util/format';

describe('fmtMMSS', () => {
  it.each([
    [0, '00:00'],
    [5, '00:05'],
    [59, '00:59'],
    [60, '01:00'],
    [61, '01:01'],
    [600, '10:00'],
    [3599, '59:59'],
    // 超過一小時不進位成時，分鐘數照長
    [3600, '60:00'],
    [6000, '100:00']
  ])('%d 秒 → %s', (sec, expected) => {
    expect(fmtMMSS(sec)).toBe(expected);
  });

  it('小數秒無條件捨去（倒數顯示不提早跳秒）', () => {
    expect(fmtMMSS(59.9)).toBe('00:59');
    expect(fmtMMSS(60.999)).toBe('01:00');
  });

  it('負數夾到 0', () => {
    expect(fmtMMSS(-1)).toBe('00:00');
    expect(fmtMMSS(-120)).toBe('00:00');
  });
});

describe('fmtMin', () => {
  it.each([
    [0, '0 分鐘'],
    [60, '1 分鐘'],
    [1500, '25 分鐘'],
    // 四捨五入到整分
    [89, '1 分鐘'],
    [90, '2 分鐘'],
    [29, '0 分鐘']
  ])('%d 秒 → %s', (sec, expected) => {
    expect(fmtMin(sec)).toBe(expected);
  });
});
