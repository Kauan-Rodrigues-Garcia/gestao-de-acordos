import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Um WebAudio de mentira que cobra o que o de verdade cobra: rampa
 * exponencial não aceita zero nem negativo, e tempo/valor precisam ser
 * números (o navegador lança erro — e o som sumiria calado, porque `sons.ts`
 * engole o erro).
 */
const criados: string[] = [];
const invalidos: string[] = [];

class Param {
  value = 0;
  setValueAtTime(v: number, t: number) { if (!Number.isFinite(v) || !Number.isFinite(t)) invalidos.push(`setValue ${v} em ${t}`); return this; }
  linearRampToValueAtTime(v: number, t: number) { if (!Number.isFinite(v) || !Number.isFinite(t)) invalidos.push(`linear ${v} em ${t}`); return this; }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (!(v > 0) || !Number.isFinite(t)) invalidos.push(`exponencial ${v} em ${t}`);
    return this;
  }
}
class No {
  connect() { return this; }
  start(em = 0, desde = 0) { if (!Number.isFinite(em) || !(desde >= 0)) invalidos.push(`start ${em} ${desde}`); }
  stop(em = 0) { if (!Number.isFinite(em)) invalidos.push(`stop ${em}`); }
}
class ContextoFalso {
  currentTime = 1;
  sampleRate = 8000;
  state = 'running';
  destination = new No();
  resume() { return Promise.resolve(); }
  createGain() { criados.push('gain'); return Object.assign(new No(), { gain: new Param() }); }
  createOscillator() { criados.push('osc'); return Object.assign(new No(), { type: 'square', frequency: new Param() }); }
  createBiquadFilter() { criados.push('filtro'); return Object.assign(new No(), { type: 'lowpass', frequency: new Param(), Q: new Param() }); }
  createBufferSource() { criados.push('ruido'); return Object.assign(new No(), { buffer: null, playbackRate: new Param() }); }
  createBuffer(_c: number, n: number) { return { sampleRate: this.sampleRate, duration: n / this.sampleRate, getChannelData: () => new Float32Array(n) }; }
}

beforeEach(() => {
  criados.length = 0;
  invalidos.length = 0;
  vi.resetModules();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('os sons da caça', () => {
  it('tocam sem depender de nada ligado: todo som monta sem parâmetro inválido', async () => {
    vi.stubGlobal('AudioContext', ContextoFalso);
    const s = await import('./sons');
    s.somTiro(); s.somAcerto(); s.somCerebro(); s.somRicochete();
    s.somBaque(0.7); s.somCrava(); s.somPop(); s.somPlof(); s.somGemido();
    expect(criados.length).toBeGreaterThan(40);
    expect(invalidos).toEqual([]);
  });

  it('o headshot é o som mais cheio: estalo, splorch, baque, bolhas e pingos', async () => {
    vi.stubGlobal('AudioContext', ContextoFalso);
    const s = await import('./sons');
    s.somCerebro();
    const bolhasEPingos = criados.filter(c => c === 'osc' || c === 'ruido').length;
    expect(bolhasEPingos).toBeGreaterThanOrEqual(15);
  });

  it('baque fraquinho não faz barulho', async () => {
    vi.stubGlobal('AudioContext', ContextoFalso);
    const s = await import('./sons');
    s.somBaque(0.02);
    expect(criados).toHaveLength(0);
  });

  it('navegador sem WebAudio: a caça segue muda, sem erro', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const s = await import('./sons');
    expect(() => { s.somTiro(); s.somCerebro(); s.somGemido(); }).not.toThrow();
  });
});
