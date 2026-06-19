import * as Tone from 'tone';
import { getSoundById } from './builtinSounds';
import type { SoundDef } from './types';

interface ActiveTrack {
  soundId: string;
  source: Tone.Player | Tone.Noise;
}

const MIN_DB = -100;

function rampVolume(source: Tone.Player | Tone.Noise, linearGain: number, sec: number) {
  const db = linearGain <= 0 ? MIN_DB : Tone.gainToDb(linearGain);
  source.volume.rampTo(db, sec);
}

export class AudioEngine {
  private initialized = false;
  /** 所有音軌都接到這個 master gain 再到喇叭，調它就等於套用 master volume 到全部播放 */
  private master: Tone.Gain | null = null;
  private masterLinear = 1;
  private readonly tracks = new Map<string, ActiveTrack>();
  /** crossfade 淡出後延遲殺軌的計時器，key 為 soundId；軌復活或提前停掉時必須取消 */
  private readonly pendingKills = new Map<string, ReturnType<typeof setTimeout>>();
  private previewTrack: ActiveTrack | null = null;
  private previewStopTimer: ReturnType<typeof setTimeout> | null = null;

  private cancelPendingKill(soundId: string): void {
    const handle = this.pendingKills.get(soundId);
    if (handle === undefined) return;
    clearTimeout(handle);
    this.pendingKills.delete(soundId);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();
    this.master = new Tone.Gain(this.masterLinear).toDestination();
    this.initialized = true;
  }

  /** 套用 master volume 到所有播放（playTrack / crossfade / story / preview 都經過 master gain） */
  setMasterVolume(linear: number, rampSec = 0.05): void {
    this.masterLinear = Math.max(0, Math.min(1, linear));
    this.master?.gain.rampTo(this.masterLinear, rampSec);
  }

  async playTrack(soundId: string, volume: number, fadeInSec = 1): Promise<void> {
    const def = getSoundById(soundId);
    if (!def) throw new Error(`unknown sound: ${soundId}`);
    if (this.tracks.has(soundId)) {
      this.cancelPendingKill(soundId);
      this.setVolume(soundId, volume, fadeInSec);
      return;
    }
    const track = await this.createTrack(def);
    this.tracks.set(soundId, track);
    track.source.volume.value = MIN_DB;
    track.source.start();
    rampVolume(track.source, volume, fadeInSec);
  }

  setVolume(soundId: string, volume: number, rampSec = 0.1): void {
    const t = this.tracks.get(soundId);
    if (!t) return;
    rampVolume(t.source, volume, rampSec);
  }

  async stopTrack(soundId: string, fadeOutSec = 0.5): Promise<void> {
    const t = this.tracks.get(soundId);
    if (!t) return;
    this.cancelPendingKill(soundId);
    if (fadeOutSec > 0) {
      rampVolume(t.source, 0, fadeOutSec);
      await new Promise((r) => setTimeout(r, fadeOutSec * 1000));
    }
    t.source.stop();
    t.source.dispose();
    this.tracks.delete(soundId);
  }

  async stopAll(fadeOutSec = 0.5): Promise<void> {
    const ids = [...this.tracks.keys()];
    await Promise.all(ids.map((id) => this.stopTrack(id, fadeOutSec)));
  }

  async crossfadeTo(soundId: string, volume: number, crossfadeSec: number): Promise<void> {
    const def = getSoundById(soundId);
    if (!def) throw new Error(`unknown sound: ${soundId}`);

    const previousIds = [...this.tracks.keys()].filter((id) => id !== soundId);

    if (this.tracks.has(soundId)) {
      this.cancelPendingKill(soundId);
      this.setVolume(soundId, volume, crossfadeSec);
    } else {
      const track = await this.createTrack(def);
      this.tracks.set(soundId, track);
      track.source.volume.value = MIN_DB;
      track.source.start();
      rampVolume(track.source, volume, crossfadeSec);
    }

    for (const id of previousIds) {
      const prev = this.tracks.get(id)!;
      rampVolume(prev.source, 0, crossfadeSec);
      this.cancelPendingKill(id);
      const handle = setTimeout(() => {
        this.pendingKills.delete(id);
        try {
          prev.source.stop();
          prev.source.dispose();
        } catch {
          /* already disposed */
        }
        // 只刪掉自己排程時的那條軌；同 id 若已被重建，不能誤刪新軌
        if (this.tracks.get(id) === prev) this.tracks.delete(id);
      }, crossfadeSec * 1000);
      this.pendingKills.set(id, handle);
    }
  }

  async masterFadeOut(fadeOutSec: number): Promise<void> {
    for (const t of this.tracks.values()) {
      rampVolume(t.source, 0, fadeOutSec);
    }
    await new Promise((r) => setTimeout(r, fadeOutSec * 1000));
    await this.stopAll(0);
  }

  isPlaying(soundId: string): boolean {
    return this.tracks.has(soundId);
  }

  activeTrackIds(): string[] {
    return [...this.tracks.keys()];
  }

  async previewOnce(soundId: string, durationSec: number, volume: number): Promise<void> {
    await this.stopPreview(0.1);
    const def = getSoundById(soundId);
    if (!def) throw new Error(`unknown sound: ${soundId}`);
    const track = await this.createTrack(def);
    this.previewTrack = track;
    track.source.volume.value = MIN_DB;
    track.source.start();
    rampVolume(track.source, volume, 0.3);
    this.previewStopTimer = setTimeout(() => {
      this.previewStopTimer = null;
      void this.stopPreview(1);
    }, durationSec * 1000);
  }

  async stopPreview(fadeOutSec = 0.3): Promise<void> {
    if (this.previewStopTimer) {
      clearTimeout(this.previewStopTimer);
      this.previewStopTimer = null;
    }
    const t = this.previewTrack;
    if (!t) return;
    this.previewTrack = null;
    if (fadeOutSec > 0) {
      rampVolume(t.source, 0, fadeOutSec);
      await new Promise((r) => setTimeout(r, fadeOutSec * 1000));
    }
    t.source.stop();
    t.source.dispose();
  }

  private async createTrack(def: SoundDef): Promise<ActiveTrack> {
    const out = this.master ?? Tone.getDestination();
    if (def.type === 'file') {
      const player = new Tone.Player(def.src!).connect(out);
      player.loop = true;
      try {
        await Tone.loaded();
      } catch (e) {
        player.dispose();
        throw e;
      }
      return { soundId: def.id, source: player };
    }
    const noise = new Tone.Noise(def.flavor!).connect(out);
    return { soundId: def.id, source: noise };
  }
}

export const audioEngine = new AudioEngine();
