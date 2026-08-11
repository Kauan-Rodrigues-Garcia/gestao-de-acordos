/**
 * som-notificacao.test.ts
 *
 * O que importa aqui não é o timbre: é que o som NUNCA derrube a notificação, e
 * que ele não vire metralhadora nem toque depois de desligado.
 *
 * Desde 11/08/2026 o plano A é o arquivo `/sounds/notificacao.mp3` e o plano B
 * é a síntese com WebAudio. Os dois caminhos são testados, e principalmente a
 * TROCA entre eles: é ela que impede o aviso sonoro de sumir quando o arquivo
 * não carrega.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  tocarSomNotificacao, somAtivo, definirSomAtivo, prepararSomNotificacao,
  __resetarSomNotificacao, CHAVE_SOM, INTERVALO_MINIMO_MS,
} from './som-notificacao';

// ── Áudio falso (plano A) ───────────────────────────────────────────────────

interface AudioFalso {
  src: string;
  volume: number;
  currentTime: number;
  preload: string;
  play: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  addEventListener: (evento: string, ouvinte: () => void, opts?: unknown) => void;
  /** Dispara o `error` do elemento, como um 404 faria. */
  quebrar: () => void;
}

let ultimoAudio: AudioFalso | null = null;
let audiosConstruidos = 0;

function instalarAudio(resultadoDoPlay: 'ok' | 'rejeita' | 'lanca' = 'ok') {
  audiosConstruidos = 0;
  (globalThis as Record<string, unknown>).Audio = function (this: AudioFalso, src: string) {
    audiosConstruidos += 1;
    const ouvintes: Record<string, (() => void)[]> = {};
    const el: AudioFalso = {
      src,
      volume: 1,
      currentTime: 0,
      preload: '',
      load: vi.fn(),
      play: vi.fn(() => {
        if (resultadoDoPlay === 'lanca') throw new Error('sem permissão');
        if (resultadoDoPlay === 'rejeita') return Promise.reject(new Error('autoplay'));
        return Promise.resolve();
      }),
      addEventListener: (evento, ouvinte) => {
        (ouvintes[evento] ??= []).push(ouvinte);
      },
      quebrar: () => { for (const o of ouvintes.error ?? []) o(); },
    };
    ultimoAudio = el;
    return el;
  } as unknown as typeof Audio;
}

// ── WebAudio falso (plano B) ────────────────────────────────────────────────

interface EspioesSintese {
  criarOscilador: ReturnType<typeof vi.fn>;
  construidos: number;
  picos: number[];
}

function instalarWebAudio(): EspioesSintese {
  const espioes: EspioesSintese = { criarOscilador: vi.fn(), construidos: 0, picos: [] };

  class AudioContextFalso {
    state = 'running';
    currentTime = 0;
    destination = {};
    constructor() { espioes.construidos += 1; }
    resume() { return Promise.resolve(); }
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn((v: number) => {
            if (v > 0.01) espioes.picos.push(v);
          }),
        },
        connect: vi.fn(),
      };
    }
    createBiquadFilter() {
      return { type: '', frequency: { value: 0 }, connect: vi.fn() };
    }
    createOscillator() {
      espioes.criarOscilador();
      return {
        type: '', frequency: { value: 0 },
        connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
      };
    }
  }

  (globalThis as Record<string, unknown>).AudioContext =
    AudioContextFalso as unknown as typeof AudioContext;
  return espioes;
}

const audioOriginal   = (globalThis as Record<string, unknown>).Audio;
const contextoOriginal = (globalThis as Record<string, unknown>).AudioContext;

beforeEach(() => {
  __resetarSomNotificacao();
  ultimoAudio = null;
  try { localStorage.removeItem(CHAVE_SOM); } catch { /* noop */ }
  // O tempo anda entre os casos para o intervalo mínimo não vazar de um para o
  // outro — quem testa o intervalo o faz de propósito, com `vi.setSystemTime`.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-11T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  if (audioOriginal === undefined) delete (globalThis as Record<string, unknown>).Audio;
  else (globalThis as Record<string, unknown>).Audio = audioOriginal;
  if (contextoOriginal === undefined) delete (globalThis as Record<string, unknown>).AudioContext;
  else (globalThis as Record<string, unknown>).AudioContext = contextoOriginal;
  __resetarSomNotificacao();
  try { localStorage.removeItem(CHAVE_SOM); } catch { /* noop */ }
});

// ── Plano A ─────────────────────────────────────────────────────────────────

describe('arquivo de som', () => {
  it('toca o mp3 escolhido pelo usuário', () => {
    instalarAudio();
    tocarSomNotificacao();

    expect(ultimoAudio?.src).toBe('/sounds/notificacao.mp3');
    expect(ultimoAudio?.play).toHaveBeenCalledTimes(1);
  });

  it('rebobina antes de tocar — senão o segundo aviso sai mudo', () => {
    instalarAudio();
    tocarSomNotificacao();
    ultimoAudio!.currentTime = 3;

    vi.setSystemTime(Date.now() + INTERVALO_MINIMO_MS + 10);
    tocarSomNotificacao();
    expect(ultimoAudio?.currentTime).toBe(0);
  });

  it('reaproveita um elemento só entre chamadas', () => {
    instalarAudio();
    tocarSomNotificacao();
    vi.setSystemTime(Date.now() + INTERVALO_MINIMO_MS + 10);
    tocarSomNotificacao();
    expect(audiosConstruidos).toBe(1);
  });

  it('urgência muda o volume, e nenhum chega a 1', () => {
    instalarAudio();

    tocarSomNotificacao('info');
    const info = ultimoAudio!.volume;

    vi.setSystemTime(Date.now() + INTERVALO_MINIMO_MS + 10);
    tocarSomNotificacao('critica');
    const critica = ultimoAudio!.volume;

    expect(critica).toBeGreaterThan(info);
    expect(critica).toBeLessThan(1);
  });

  it('prepararSomNotificacao baixa o arquivo antes da primeira notificação', () => {
    instalarAudio();
    prepararSomNotificacao();
    expect(ultimoAudio?.load).toHaveBeenCalled();
    expect(ultimoAudio?.preload).toBe('auto');
  });
});

// ── A troca para o plano B ──────────────────────────────────────────────────

describe('queda para a síntese', () => {
  it('sem suporte a Audio, sintetiza', () => {
    delete (globalThis as Record<string, unknown>).Audio;
    const espioes = instalarWebAudio();

    tocarSomNotificacao();
    expect(espioes.criarOscilador).toHaveBeenCalledTimes(2);
  });

  it('play que LANÇA cai na síntese na mesma hora', () => {
    instalarAudio('lanca');
    const espioes = instalarWebAudio();

    tocarSomNotificacao();
    expect(espioes.criarOscilador).toHaveBeenCalledTimes(2);
  });

  it('play REJEITADO (autoplay barrado) cai na síntese', async () => {
    instalarAudio('rejeita');
    const espioes = instalarWebAudio();

    tocarSomNotificacao();
    // A queda vem no `catch` da promessa, um tick depois.
    await vi.waitFor(() => expect(espioes.criarOscilador).toHaveBeenCalledTimes(2));
  });

  it('arquivo que deu 404 não é tentado de novo', () => {
    instalarAudio();
    instalarWebAudio();

    tocarSomNotificacao();
    expect(ultimoAudio?.play).toHaveBeenCalledTimes(1);
    // O elemento avisa do erro por evento, não por exceção do play.
    ultimoAudio!.quebrar();
    const quebrado = ultimoAudio!;

    vi.setSystemTime(Date.now() + INTERVALO_MINIMO_MS + 10);
    tocarSomNotificacao();
    expect(quebrado.play).toHaveBeenCalledTimes(1);
  });

  it('nem arquivo nem WebAudio: não estoura', () => {
    delete (globalThis as Record<string, unknown>).Audio;
    delete (globalThis as Record<string, unknown>).AudioContext;
    delete (globalThis as Record<string, unknown>).webkitAudioContext;
    expect(() => tocarSomNotificacao()).not.toThrow();
  });
});

// ── Intervalo mínimo ────────────────────────────────────────────────────────

describe('intervalo mínimo', () => {
  it('duas notificações no mesmo segundo tocam UMA vez', () => {
    instalarAudio();
    tocarSomNotificacao();
    tocarSomNotificacao();
    tocarSomNotificacao();
    expect(ultimoAudio?.play).toHaveBeenCalledTimes(1);
  });

  it('passado o intervalo, toca de novo', () => {
    instalarAudio();
    tocarSomNotificacao();
    vi.setSystemTime(Date.now() + INTERVALO_MINIMO_MS + 1);
    tocarSomNotificacao();
    expect(ultimoAudio?.play).toHaveBeenCalledTimes(2);
  });
});

// ── Preferência ─────────────────────────────────────────────────────────────

describe('ligar e desligar', () => {
  it('vem ligado por padrão', () => {
    expect(somAtivo()).toBe(true);
  });

  it('desligado não toca nada — nem arquivo, nem síntese', () => {
    instalarAudio();
    const espioes = instalarWebAudio();
    definirSomAtivo(false);

    tocarSomNotificacao();
    expect(somAtivo()).toBe(false);
    expect(ultimoAudio).toBeNull();
    expect(espioes.criarOscilador).not.toHaveBeenCalled();
  });

  it('a escolha sobrevive: religar volta a tocar', () => {
    instalarAudio();
    definirSomAtivo(false);
    tocarSomNotificacao();
    expect(ultimoAudio).toBeNull();

    definirSomAtivo(true);
    tocarSomNotificacao();
    expect(ultimoAudio?.play).toHaveBeenCalledTimes(1);
  });

  it('storage que lança (modo privativo) não derruba nem muda o padrão', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('bloqueado'); };
    try {
      expect(somAtivo()).toBe(true);
      expect(() => definirSomAtivo(false)).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
