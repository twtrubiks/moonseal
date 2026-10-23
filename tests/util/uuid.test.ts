import { describe, it, expect, vi, afterEach } from 'vitest';
import { uuid } from '../../src/lib/util/uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('有 crypto.randomUUID 時直接使用', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-2222-4333-8444-555555555555');
    expect(uuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(spy).toHaveBeenCalledOnce();
  });

  describe('沒有 randomUUID 時的 fallback（非安全環境如 http 區網）', () => {
    function withoutRandomUUID(fill: (bytes: Uint8Array) => void) {
      vi.stubGlobal('crypto', {
        getRandomValues: (bytes: Uint8Array) => { fill(bytes); return bytes; }
      });
    }
    afterEach(() => { vi.unstubAllGlobals(); });

    it('產生符合 RFC 4122 v4 格式的字串', () => {
      withoutRandomUUID((b) => b.fill(0xff));
      const id = uuid();
      expect(id).toMatch(V4);
      // 0xff 的 version nibble 被強制成 4、variant 高兩位被強制成 10
      expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    });

    it('全 0 bytes 也會設上 version / variant 位元並補零', () => {
      withoutRandomUUID((b) => b.fill(0));
      expect(uuid()).toBe('00000000-0000-4000-8000-000000000000');
    });

    it('每個 byte 依序對應到正確的位置與分段', () => {
      withoutRandomUUID((b) => b.forEach((_, i) => { b[i] = i; }));
      // byte6 = 0x06 → 0x46；byte8 = 0x08 → 0x88
      expect(uuid()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    });
  });
});
