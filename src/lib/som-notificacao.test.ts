/**
 * som-notificacao.test.ts
 *
 * O que importa aqui não é o timbre: é que o som NUNCA derrube a notificação.
 * Navegador sem WebAudio, contexto barrado por autoplay, oscilador que lança —
 * em todos os casos o card tem de continuar de pé.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tocarSomNotificacao, __resetarContextoDeAudio } from './som-notificacao';

interface Espioes {
  criarOscilador: ReturnType<typeof vi.fn>;
  resume:         ReturnType<typeof vi.fn>;
  start:          ReturnType<typeof vi.fn>;
  stop:           ReturnType<typeof vi.fn>;
  construidos:    number;
}

const original = (globalThis as Record<string, unknown>).AudioContext;

function instalarAudioFalso(estado: 'running' | 'suspended' = 'running'): Espioes {
  const espioes: Espioes = {
    criarOscilador: vi.fn(),
    resume:         vi.fn(),
    start:          vi.fn(),
    stop:           vi.fn(),
    construidos:    0,
  };

  const ganhoFalso = () => ({
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  });

  class AudioContextFalso {
    state = estado;
    currentTime = 0;
    destination = {};
    constructor() { espioes.construidos += 1; }
    resume() { espioes.resume(); return Promise.resolve(); }
    createGain() { return ganhoFalso(); }
    createOscillator() {
      espioes.criarOscilador();
      return {
        type: '', frequency: { value: 0 },
        connect: vi.fn(),
        start: espioes.start,
        stop:  espioes.stop,
      };
    }
  }

  (globalThis as Record<string, unknown>).AudioContext =
    AudioContextFalso as unknown as typeof AudioContext;
  return espioes;
}

beforeEach(() => { __resetarContextoDeAudio(); });

afterEach(() => {
  if (original === undefined) delete (globalThis as Record<string, unknown>).AudioContext;
  else (globalThis as Record<string, unknown>).AudioContext = original;
  __resetarContextoDeAudio();
});

describe('tocarSomNotificacao', () => {
  it('toca as duas notas', () => {
    const espioes = instalarAudioFalso();
    tocarSomNotificacao();
    expect(espioes.criarOscilador).toHaveBeenCalledTimes(2);
    expect(espioes.start).toHaveBeenCalledTimes(2);
    // Agendar o stop é o que impede o oscilador de ficar tocando para sempre.
    expect(espioes.stop).toHaveBeenCalledTimes(2);
  });

  it('reaproveita um contexto só entre chamadas', () => {
    // Navegadores limitam AudioContext por página; um por notificação estouraria
    // o limite num dia de trabalho.
    const espioes = instalarAudioFalso();
    tocarSomNotificacao();
    tocarSomNotificacao();
    tocarSomNotificacao();
    expect(espioes.construidos).toBe(1);
  });

  it('contexto suspenso pela política de autoplay: tenta destravar e não estoura', () => {
    const espioes = instalarAudioFalso('suspended');
    expect(() => tocarSomNotificacao()).not.toThrow();
    expect(espioes.resume).toHaveBeenCalled();
  });

  it('navegador sem WebAudio não estoura', () => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    delete (globalThis as Record<string, unknown>).webkitAudioContext;
    expect(() => tocarSomNotificacao()).not.toThrow();
  });

  it('construtor que lança não derruba quem chamou', () => {
    (globalThis as Record<string, unknown>).AudioContext = class {
      constructor() { throw new Error('bloqueado'); }
    } as unknown as typeof AudioContext;
    expect(() => tocarSomNotificacao()).not.toThrow();
  });

  it('falha no meio da síntese não derruba quem chamou', () => {
    (globalThis as Record<string, unknown>).AudioContext = class {
      state = 'running';
      currentTime = 0;
      destination = {};
      createGain() { return { gain: {}, connect: () => {} }; }
      createOscillator(): never { throw new Error('sem recurso'); }
    } as unknown as typeof AudioContext;
    expect(() => tocarSomNotificacao()).not.toThrow();
  });
});
