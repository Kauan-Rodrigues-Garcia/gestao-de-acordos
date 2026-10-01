/**
 * trilha.test.ts — a música da mensagem de outubro.
 *
 * O timbre não se testa aqui. O que importa: só toca com a mensagem aberta,
 * nunca duas ao mesmo tempo, não passa do volume combinado, volta ao início no
 * trecho certo e falha em silêncio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  tocarTrilhaHalloween, TRECHO_S, VOLUME_ALVO, VOLUME_INICIAL, SUBIDA_S,
  type EstadoTrilha,
} from './trilha';

interface Agendamento { tipo: string; valor: number; t: number }

class ParamFalso {
  value = 1;
  agenda: Agendamento[] = [];
  setValueAtTime(valor: number, t: number) { this.agenda.push({ tipo: 'set', valor, t }); }
  linearRampToValueAtTime(valor: number, t: number) { this.agenda.push({ tipo: 'rampa', valor, t }); }
  cancelScheduledValues(t: number) { this.agenda.push({ tipo: 'cancela', valor: NaN, t }); }
}

interface FonteFalsa {
  buffer: unknown; loop: boolean; loopStart: number; loopEnd: number;
  iniciada: number | null; parada: boolean;
  connect: () => void; start: (t: number) => void; stop: () => void;
}

let contextos: ContextoFalso[] = [];
let estadoInicial: AudioContextState = 'running';
let duracaoMusica = 180;
let decodificacaoFalha = false;

class ContextoFalso {
  state: AudioContextState = estadoInicial;
  currentTime = 0;
  destination = {};
  onstatechange: (() => void) | null = null;
  ganhos: ParamFalso[] = [];
  fontes: FonteFalsa[] = [];
  fechado = false;
  constructor() { contextos.push(this); }
  resume() {
    this.state = 'running';
    this.onstatechange?.();
    return Promise.resolve();
  }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.fechado = true; this.state = 'closed'; return Promise.resolve(); }
  decodeAudioData() {
    return decodificacaoFalha
      ? Promise.reject(new Error('formato'))
      : Promise.resolve({ duration: duracaoMusica });
  }
  createGain() {
    const gain = new ParamFalso();
    this.ganhos.push(gain);
    return { gain, connect: () => {} };
  }
  createBufferSource() {
    const f: FonteFalsa = {
      buffer: null, loop: false, loopStart: 0, loopEnd: 0, iniciada: null, parada: false,
      connect: () => {},
      start: (t) => { f.iniciada = t; },
      stop: () => { f.parada = true; },
    };
    this.fontes.push(f);
    return f;
  }
}

/** Deixa o download e a decodificação falsos terminarem. */
const carregar = () => new Promise((r) => setTimeout(r, 0));

let respostaOk = true;

beforeEach(() => {
  contextos = [];
  estadoInicial = 'running';
  duracaoMusica = 180;
  decodificacaoFalha = false;
  respostaOk = true;
  vi.stubGlobal('AudioContext', ContextoFalso);
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: respostaOk, status: respostaOk ? 200 : 404,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tocarTrilhaHalloween', () => {
  it('toca o trecho em volta, subindo de baixinho até o volume combinado', async () => {
    const estados: EstadoTrilha[] = [];
    const t = tocarTrilhaHalloween((e) => estados.push(e));
    await carregar();

    const ctx = contextos[0];
    const fonte = ctx.fontes[0];
    expect(fonte.iniciada).toBe(0);
    expect(fonte.loop).toBe(true);
    expect(fonte.loopStart).toBe(0);
    expect(fonte.loopEnd).toBe(TRECHO_S);

    const envelope = ctx.ganhos[0].agenda;
    expect(envelope[0]).toEqual({ tipo: 'set', valor: VOLUME_INICIAL, t: 0 });
    expect(envelope[1]).toEqual({ tipo: 'rampa', valor: VOLUME_ALVO, t: SUBIDA_S });
    // Nunca passa de 30%.
    expect(Math.max(...envelope.map((a) => a.valor))).toBeLessThanOrEqual(0.3);
    // A respiração cai exatamente na volta ao início.
    expect(envelope).toContainEqual({ tipo: 'rampa', valor: VOLUME_INICIAL, t: TRECHO_S });

    expect(estados).toEqual(['tocando']);
    t.parar();
  });

  it('música menor que o trecho volta ao início no fim dela', async () => {
    duracaoMusica = 25;
    const t = tocarTrilhaHalloween();
    await carregar();
    expect(contextos[0].fontes[0].loopEnd).toBe(25);
    t.parar();
  });

  it('parar fecha o contexto e não deixa ouvinte para trás', async () => {
    vi.useFakeTimers();
    try {
      const t = tocarTrilhaHalloween();
      await vi.advanceTimersByTimeAsync(0);
      const ctx = contextos[0];
      t.parar();
      // Fade de saída antes de fechar.
      expect(ctx.ganhos[1].agenda.at(-1)).toMatchObject({ tipo: 'rampa', valor: 0 });
      expect(ctx.fechado).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(ctx.fechado).toBe(true);
      expect(ctx.fontes[0].parada).toBe(true);
      expect(t.estado).toBe('parada');
      t.parar(); // de novo: sem erro
    } finally {
      vi.useRealTimers();
    }
  });

  it('fechada antes de o download terminar, não começa a tocar', async () => {
    const t = tocarTrilhaHalloween();
    t.parar();
    await carregar();
    expect(contextos[0].fontes).toHaveLength(0);
    expect(contextos[0].fechado).toBe(true);
  });

  it('nunca duas ao mesmo tempo: a nova para a anterior', async () => {
    const a = tocarTrilhaHalloween();
    await carregar();
    const b = tocarTrilhaHalloween();
    await carregar();
    expect(a.estado).toBe('parada');
    expect(b.estado).toBe('tocando');
    b.parar();
  });

  it('sem gesto na página fica bloqueada e começa no primeiro toque', async () => {
    estadoInicial = 'suspended';
    const ctx0 = { resume: ContextoFalso.prototype.resume };
    // O navegador recusa o primeiro resume (sem gesto).
    let permitir = false;
    ContextoFalso.prototype.resume = function (this: ContextoFalso) {
      return permitir ? ctx0.resume.call(this) : Promise.resolve();
    };
    try {
      const estados: EstadoTrilha[] = [];
      const t = tocarTrilhaHalloween((e) => estados.push(e));
      await carregar();
      expect(t.estado).toBe('bloqueada');

      permitir = true;
      window.dispatchEvent(new Event('pointerdown'));
      await carregar();
      expect(t.estado).toBe('tocando');
      expect(estados).toEqual(['bloqueada', 'tocando']);
      t.parar();
    } finally {
      ContextoFalso.prototype.resume = ctx0.resume;
    }
  });

  it('o toque no botão de fechar não libera o som', async () => {
    estadoInicial = 'suspended';
    const original = ContextoFalso.prototype.resume;
    let pedidos = 0;
    ContextoFalso.prototype.resume = function () { pedidos += 1; return Promise.resolve(); };
    try {
      const t = tocarTrilhaHalloween();
      await carregar();
      const antes = pedidos;
      const botao = document.createElement('button');
      botao.setAttribute('data-hw-sem-destravar', '');
      document.body.appendChild(botao);
      botao.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(pedidos).toBe(antes);
      botao.remove();
      t.parar();
    } finally {
      ContextoFalso.prototype.resume = original;
    }
  });

  it('alternarSom cala e devolve sem parar a música', async () => {
    const t = tocarTrilhaHalloween();
    await carregar();
    const mestre = contextos[0].ganhos[1];
    t.alternarSom();
    expect(t.estado).toBe('muda');
    expect(mestre.agenda.at(-1)).toMatchObject({ tipo: 'rampa', valor: 0 });
    t.alternarSom();
    expect(t.estado).toBe('tocando');
    expect(mestre.agenda.at(-1)).toMatchObject({ tipo: 'rampa', valor: 1 });
    expect(contextos[0].fontes[0].parada).toBe(false);
    t.parar();
  });

  it('aba escondida pausa; ao voltar, continua', async () => {
    const t = tocarTrilhaHalloween();
    await carregar();
    const ctx = contextos[0];
    const oculto = vi.spyOn(document, 'hidden', 'get');
    oculto.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.state).toBe('suspended');
    oculto.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.state).toBe('running');
    oculto.mockRestore();
    t.parar();
  });

  it.each([
    ['arquivo ausente', () => { respostaOk = false; }],
    ['arquivo ilegível', () => { decodificacaoFalha = true; }],
  ])('%s: fica indisponível, em silêncio', async (_, preparar) => {
    preparar();
    const t = tocarTrilhaHalloween();
    await carregar();
    expect(t.estado).toBe('indisponivel');
    expect(contextos[0].fechado).toBe(true);
    t.parar();
  });

  it('sem WebAudio: indisponível, sem lançar', () => {
    vi.stubGlobal('AudioContext', undefined);
    const t = tocarTrilhaHalloween();
    expect(t.estado).toBe('indisponivel');
    t.parar();
  });
});
