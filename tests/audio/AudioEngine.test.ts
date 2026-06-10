import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const startMock = vi.fn(async () => {});
  const loadedMock = vi.fn(async () => {});
  const gainToDb = (g: number) => (g <= 0 ? -Infinity : 20 * Math.log10(g));

  class FakeParam {
    rampTo = vi.fn();
    value = 0;
  }
  class FakeGain {
    gain = new FakeParam();
    connect(_: unknown) { return this; }
    toDestination() { return this; }
    dispose = vi.fn();
  }
  const playerInstances: FakePlayer[] = [];
  const noiseInstances: FakeNoise[] = [];

  class FakePlayer {
    src: string;
    loop = false;
    state = 'stopped';
    volume = new FakeParam();
    start = vi.fn(() => { this.state = 'started'; });
    stop = vi.fn(() => { this.state = 'stopped'; });
    dispose = vi.fn();
    connect = vi.fn(() => this);
    toDestination = vi.fn(() => this);
    constructor(src: string) {
      this.src = src;
      playerInstances.push(this);
    }
  }
  class FakeNoise {
    type: string;
    state = 'stopped';
    volume = new FakeParam();
    start = vi.fn(() => { this.state = 'started'; });
    stop = vi.fn(() => { this.state = 'stopped'; });
    dispose = vi.fn();
    connect = vi.fn(() => this);
    toDestination = vi.fn(() => this);
    constructor(type: string) {
      this.type = type;
      noiseInstances.push(this);
    }
  }

  return { startMock, loadedMock, gainToDb, FakeGain, FakePlayer, FakeNoise, playerInstances, noiseInstances };
});

vi.mock('tone', () => ({
  Player: mocks.FakePlayer,
  Noise: mocks.FakeNoise,
  Gain: mocks.FakeGain,
  start: mocks.startMock,
  loaded: mocks.loadedMock,
  gainToDb: mocks.gainToDb,
  getDestination: () => new mocks.FakeGain()
}));

import { AudioEngine } from '../../src/lib/audio/AudioEngine';

const { playerInstances, noiseInstances, startMock, loadedMock, gainToDb } = mocks;
const MIN_DB = -100;
const dbOf = (linear: number) => (linear <= 0 ? MIN_DB : gainToDb(linear));

describe('AudioEngine', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    playerInstances.length = 0;
    noiseInstances.length = 0;
    startMock.mockClear();
    loadedMock.mockClear();
    engine = new AudioEngine();
  });

  it('initialize() calls Tone.start() (autoplay unlock)', async () => {
    await engine.initialize();
    expect(startMock).toHaveBeenCalledOnce();
  });

  it('playTrack creates a Tone.Player for file-type sounds and starts it', async () => {
    await engine.initialize();
    await engine.playTrack('ocean', 0.7);
    expect(playerInstances).toHaveLength(1);
    expect(playerInstances[0]?.src).toBe(`${import.meta.env.BASE_URL}audio/ocean.mp3`);
    expect(playerInstances[0]?.loop).toBe(true);
    expect(playerInstances[0]?.start).toHaveBeenCalled();
  });

  it('playTrack creates a Tone.Noise for synth-type sounds', async () => {
    await engine.initialize();
    await engine.playTrack('white', 0.5);
    expect(noiseInstances).toHaveLength(1);
    expect(noiseInstances[0]?.type).toBe('white');
    expect(noiseInstances[0]?.start).toHaveBeenCalled();
  });

  it('playTrack on the same id twice does not double-create', async () => {
    await engine.initialize();
    await engine.playTrack('ocean', 0.5);
    await engine.playTrack('ocean', 0.8);
    expect(playerInstances).toHaveLength(1);
  });

  it('setVolume ramps the track volume in decibels', async () => {
    await engine.initialize();
    await engine.playTrack('ocean', 0.5);
    engine.setVolume('ocean', 0.9, 1);
    expect(playerInstances[0]?.volume.rampTo).toHaveBeenLastCalledWith(dbOf(0.9), 1);
  });

  it('stopTrack stops and disposes the Tone resource', async () => {
    await engine.initialize();
    await engine.playTrack('ocean', 0.5);
    await engine.stopTrack('ocean', 0);
    expect(playerInstances[0]?.stop).toHaveBeenCalled();
    expect(playerInstances[0]?.dispose).toHaveBeenCalled();
  });

  it('stopAll stops every active track', async () => {
    await engine.initialize();
    await engine.playTrack('ocean', 0.5);
    await engine.playTrack('rain', 0.5);
    await engine.stopAll(0);
    expect(playerInstances[0]?.stop).toHaveBeenCalled();
    expect(playerInstances[1]?.stop).toHaveBeenCalled();
  });

  it('throws on unknown sound id', async () => {
    await engine.initialize();
    await expect(engine.playTrack('not-a-sound', 0.5)).rejects.toThrow(/unknown sound/i);
  });

  it('crossfadeTo ramps current track to 0 and new track to target volume', async () => {
    await engine.initialize();
    await engine.playTrack('ocean', 0.7);
    await engine.crossfadeTo('rain', 0.6, 5);
    expect(playerInstances[0]?.volume.rampTo).toHaveBeenLastCalledWith(dbOf(0), 5);
    expect(playerInstances[1]?.volume.rampTo).toHaveBeenLastCalledWith(dbOf(0.6), 5);
  });

  it('crossfadeTo with no current track simply starts the new one at target volume', async () => {
    await engine.initialize();
    await engine.crossfadeTo('rain', 0.5, 3);
    expect(playerInstances).toHaveLength(1);
    expect(playerInstances[0]?.volume.rampTo).toHaveBeenLastCalledWith(dbOf(0.5), 3);
  });

  it('crossfadeTo to the currently-playing same id only adjusts volume', async () => {
    await engine.initialize();
    await engine.playTrack('ocean', 0.4);
    await engine.crossfadeTo('ocean', 0.9, 2);
    expect(playerInstances).toHaveLength(1);
    expect(playerInstances[0]?.volume.rampTo).toHaveBeenLastCalledWith(dbOf(0.9), 2);
  });

  it('playTrack pre-sets volume to MIN_DB before fade-in to avoid full-volume blast', async () => {
    await engine.initialize();
    await engine.playTrack('ocean', 0.7, 1);
    expect(playerInstances[0]?.volume.value).toBe(MIN_DB);
    expect(playerInstances[0]?.volume.rampTo).toHaveBeenLastCalledWith(dbOf(0.7), 1);
  });

  it('previewOnce creates a separate preview track that is not in main tracks list', async () => {
    await engine.initialize();
    await engine.playTrack('ocean', 0.5);
    await engine.previewOnce('rain', 5, 0.7);
    expect(playerInstances).toHaveLength(2);
    expect(engine.activeTrackIds()).toEqual(['ocean']);
  });

  it('previewOnce does not affect main tracks when stopAll is called', async () => {
    await engine.initialize();
    await engine.previewOnce('ocean', 5, 0.7);
    await engine.stopAll(0);
    expect(playerInstances[0]?.stop).not.toHaveBeenCalled();
  });

  it('previewOnce replaces existing preview (only one preview at a time)', async () => {
    await engine.initialize();
    await engine.previewOnce('ocean', 5, 0.7);
    await engine.previewOnce('rain', 5, 0.7);
    expect(playerInstances[0]?.stop).toHaveBeenCalled();
    expect(playerInstances[0]?.dispose).toHaveBeenCalled();
  });

  it('stopPreview disposes the preview track without touching main tracks', async () => {
    await engine.initialize();
    await engine.playTrack('ocean', 0.5);
    await engine.previewOnce('rain', 5, 0.7);
    await engine.stopPreview(0);
    expect(playerInstances[0]?.stop).not.toHaveBeenCalled();
    expect(playerInstances[1]?.stop).toHaveBeenCalled();
    expect(playerInstances[1]?.dispose).toHaveBeenCalled();
  });

  it('crossfadeTo does not affect preview track', async () => {
    await engine.initialize();
    await engine.previewOnce('ocean', 5, 0.7);
    await engine.crossfadeTo('rain', 0.5, 1);
    expect(playerInstances[0]?.stop).not.toHaveBeenCalled();
  });

  it('createTrack 載入失敗時要 dispose 掉已建立的 Player，不留孤兒節點', async () => {
    loadedMock.mockRejectedValueOnce(new Error('load failed'));
    await engine.initialize();
    await expect(engine.playTrack('ocean', 0.5)).rejects.toThrow('load failed');
    expect(playerInstances[0]?.dispose).toHaveBeenCalled();
  });

  describe('preview 停止計時器', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('快速連續試聽：前一個試聽的停止計時器不能砍掉新的試聽', async () => {
      await engine.initialize();
      await engine.previewOnce('ocean', 5, 0.7);     // t=0：排程 t=5s 停止
      await vi.advanceTimersByTimeAsync(3000);

      const p = engine.previewOnce('rain', 5, 0.7);  // t=3s：換試聽 rain
      await vi.advanceTimersByTimeAsync(100);        // 讓內部 stopPreview(0.1) 的 fade 完成
      await p;                                       // rain 排程 t≈8.1s 停止

      // 走到 ocean 的舊計時器（t=5s）之後再加 1 秒 fade：rain 不能被砍
      await vi.advanceTimersByTimeAsync(3000);
      expect(playerInstances[1]?.stop).not.toHaveBeenCalled();

      // rain 自己的計時器到期後正常停止
      await vi.advanceTimersByTimeAsync(4000);
      expect(playerInstances[1]?.stop).toHaveBeenCalled();
      expect(playerInstances[1]?.dispose).toHaveBeenCalled();
    });
  });

  describe('crossfade 殺軌計時器 race', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('crossfade 走掉又在窗口內切回來：復活的軌不能被舊計時器殺掉', async () => {
      await engine.initialize();
      await engine.playTrack('ocean', 0.7);          // 段 N：ocean
      await engine.crossfadeTo('rain', 0.6, 10);     // 段 N+1：排程 +10s 殺 ocean
      await vi.advanceTimersByTimeAsync(5000);       // 段 N+1 只播 5 秒
      await engine.crossfadeTo('ocean', 0.7, 1);     // 段 N+2：切回 ocean（復活）
      await vi.advanceTimersByTimeAsync(10000);      // 原殺軌計時器到期

      expect(engine.isPlaying('ocean')).toBe(true);
      expect(playerInstances[0]?.stop).not.toHaveBeenCalled();
      expect(playerInstances[0]?.dispose).not.toHaveBeenCalled();
    });

    it('過期計時器不能把同 id 重建的新軌踢出追蹤名單（幽靈軌）', async () => {
      await engine.initialize();
      await engine.playTrack('ocean', 0.7);
      await engine.crossfadeTo('rain', 0.6, 10);     // 排程 +10s 殺 ocean
      await vi.advanceTimersByTimeAsync(5000);
      await engine.stopTrack('ocean', 0);            // 提前手動停掉舊 ocean
      await engine.playTrack('ocean', 0.5);          // 同 id 重建新軌
      await vi.advanceTimersByTimeAsync(10000);      // 舊計時器到期

      expect(engine.isPlaying('ocean')).toBe(true);
      const newOcean = playerInstances[2];
      expect(newOcean?.stop).not.toHaveBeenCalled();
    });
  });
});
