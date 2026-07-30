/**
 * realtime.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cobre os dois comportamentos que justificam a existência do módulo:
 *
 *   1. Deduplicação por tópico — N ouvintes, UM canal; o canal só morre quando o
 *      último cancela (o bug antigo: o primeiro a desmontar derrubava os outros).
 *   2. Reconexão — carência, backoff exponencial, e `onReconectado` avisando o
 *      consumidor de que há um buraco no histórico de eventos.
 *
 * Usa timers falsos: os atrasos são de segundos e são parte do contrato.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock do Supabase ────────────────────────────────────────────────────────
//
// Cada `channel(nome)` devolve um canal novo e rastreável. Guardamos o callback
// de `subscribe` para dirigir o status à mão, e `state` é gravável para simular
// canal morto/vivo.

type Binding = { config: Record<string, unknown>; cb: (p: unknown) => void };

/**
 * O mesmo objeto serve de canal para o código de produção (`on`/`subscribe`/
 * `state`) e de controle para o teste (`emitirStatus`/`emitirEvento`) — assim o
 * teste dirige o status sem precisar de uma segunda camada de indireção.
 */
function novoCanalFalso(nome: string) {
  const canal = {
    nome,
    bindings: [] as Binding[],
    /** Lido por `agendarReconexao`/`reviverCanais` para saber se o canal vive. */
    state:    'closed',
    statusCb: null as ((status: string, err?: Error) => void) | null,

    on(_tipo: string, config: Record<string, unknown>, cb: (p: unknown) => void) {
      canal.bindings.push({ config, cb });
      return canal;
    },
    subscribe(cb: (status: string, err?: Error) => void) {
      canal.statusCb = cb;
      return canal;
    },

    /** Dispara um status como o servidor faria, ajustando `state` junto. */
    emitirStatus(status: string) {
      canal.state = status === 'SUBSCRIBED' ? 'joined' : 'closed';
      canal.statusCb?.(status);
    },
    /** Dispara um evento de postgres em todos os bindings do canal. */
    emitirEvento(payload: unknown) {
      for (const b of canal.bindings) b.cb(payload);
    },
  };
  return canal;
}

type CanalFalso = ReturnType<typeof novoCanalFalso>;

const canaisCriados: CanalFalso[] = [];
const removidos: string[] = [];

const mockChannel = vi.fn((nome: string) => {
  const c = novoCanalFalso(nome);
  canaisCriados.push(c);
  return c;
});
const mockRemoveChannel = vi.fn((c: { nome: string }) => {
  removidos.push(c.nome);
  return Promise.resolve('ok');
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel:       (nome: string) => mockChannel(nome),
    removeChannel: (c: { nome: string }) => mockRemoveChannel(c),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { assinarTabela, topicosAtivos, __resetRealtimeParaTestes } from '../realtime';

const ESCUTAS = [{ tabela: 'acordos', filtro: 'empresa_id=eq.e1' }];

beforeEach(() => {
  vi.useFakeTimers();
  canaisCriados.length = 0;
  removidos.length     = 0;
  mockChannel.mockClear();
  mockRemoveChannel.mockClear();
});

afterEach(() => {
  __resetRealtimeParaTestes();
  vi.useRealTimers();
});

// ── 1. Deduplicação por tópico ───────────────────────────────────────────────

describe('assinarTabela — deduplicação por tópico', () => {
  it('cria UM canal para dois ouvintes do mesmo tópico', () => {
    const a = vi.fn();
    const b = vi.fn();

    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: a });
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: b });

    expect(mockChannel).toHaveBeenCalledTimes(1);
    expect(mockChannel).toHaveBeenCalledWith('t1');
  });

  it('entrega o evento a todos os ouvintes do tópico', () => {
    const a = vi.fn();
    const b = vi.fn();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: a });
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: b });

    canaisCriados[0].emitirEvento({ eventType: 'INSERT', new: { id: 'x' } });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0][0]).toEqual({ eventType: 'INSERT', new: { id: 'x' } });
  });

  it('tópicos diferentes criam canais diferentes', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    assinarTabela({ topico: 't2', escutas: ESCUTAS }, { onEvento: vi.fn() });

    expect(mockChannel).toHaveBeenCalledTimes(2);
    expect(topicosAtivos()).toEqual(['t1', 't2']);
  });

  it('registra um binding por escuta, com schema e filtro resolvidos', () => {
    assinarTabela(
      {
        topico: 't1',
        escutas: [
          { tabela: 'a', filtro: 'empresa_id=eq.e1' },
          { tabela: 'b', evento: 'DELETE' },
        ],
      },
      { onEvento: vi.fn() },
    );

    const bindings = canaisCriados[0].bindings.map(b => b.config);
    expect(bindings).toEqual([
      { event: '*',      schema: 'public', table: 'a', filter: 'empresa_id=eq.e1' },
      { event: 'DELETE', schema: 'public', table: 'b' },
    ]);
  });
});

// ── 2. Ciclo de vida: o canal só morre com o último ouvinte ──────────────────

describe('assinarTabela — ciclo de vida', () => {
  it('NÃO remove o canal quando só um dos dois ouvintes cancela', () => {
    const cancelarA = assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    const b = vi.fn();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: b });

    cancelarA();

    expect(mockRemoveChannel).not.toHaveBeenCalled();
    // E o que ficou continua recebendo — este era exatamente o bug antigo.
    canaisCriados[0].emitirEvento({ eventType: 'UPDATE' });
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('remove o canal quando o último ouvinte cancela', () => {
    const cancelarA = assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    const cancelarB = assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });

    cancelarA();
    cancelarB();

    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    expect(removidos).toEqual(['t1']);
    expect(topicosAtivos()).toEqual([]);
  });

  it('cancelar duas vezes não remove o canal duas vezes', () => {
    const cancelar = assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    cancelar();
    cancelar();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('assinar de novo depois de remover cria um canal novo com o tópico original', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() })();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });

    expect(mockChannel).toHaveBeenNthCalledWith(2, 't1');
  });

  it('um ouvinte que cancela durante o despacho não interrompe os outros', () => {
    const b = vi.fn();
    let cancelarA: () => void = () => {};
    cancelarA = assinarTabela(
      { topico: 't1', escutas: ESCUTAS },
      { onEvento: () => cancelarA() },
    );
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: b });

    expect(() => canaisCriados[0].emitirEvento({ eventType: 'INSERT' })).not.toThrow();
    expect(b).toHaveBeenCalledTimes(1);
  });
});

// ── 3. Reconexão ─────────────────────────────────────────────────────────────

describe('assinarTabela — reconexão', () => {
  it('não reconecta antes da carência de 3s', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');

    vi.advanceTimersByTime(2_900);
    expect(mockChannel).toHaveBeenCalledTimes(1);
  });

  it('canal que volta sozinho durante a carência não é recriado', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('CLOSED');

    vi.advanceTimersByTime(1_000);
    canaisCriados[0].emitirStatus('SUBSCRIBED');   // reconectou por conta própria
    vi.advanceTimersByTime(60_000);

    expect(mockChannel).toHaveBeenCalledTimes(1);
  });

  it('recria o canal com sufixo de geração após carência + backoff', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');

    vi.advanceTimersByTime(3_000);   // carência
    vi.advanceTimersByTime(2_000);   // 1º backoff

    expect(mockChannel).toHaveBeenCalledTimes(2);
    // Nome novo de propósito: reusar um tópico recém-fechado devolve o canal morto.
    expect(mockChannel).toHaveBeenNthCalledWith(2, 't1::r1');
    expect(removidos).toEqual(['t1']);
  });

  it('backoff é exponencial e não desiste (2s, 4s, 8s…)', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });

    const esperas = [2_000, 4_000, 8_000];
    esperas.forEach((espera, i) => {
      canaisCriados[i].emitirStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(3_000);
      vi.advanceTimersByTime(espera - 1);
      expect(mockChannel).toHaveBeenCalledTimes(i + 1);   // ainda não
      vi.advanceTimersByTime(1);
      expect(mockChannel).toHaveBeenCalledTimes(i + 2);   // agora sim
    });
  });

  it('backoff satura em 30s em vez de crescer para sempre', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });

    // 10 falhas: 2^10 * 2s seria ~34min sem o teto.
    for (let i = 0; i < 10; i++) {
      canaisCriados[i].emitirStatus('CHANNEL_ERROR');
      vi.advanceTimersByTime(3_000 + 30_000);
    }
    expect(mockChannel).toHaveBeenCalledTimes(11);
  });

  it('avisa onReconectado somente depois de uma queda real', () => {
    const onReconectado = vi.fn();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn(), onReconectado });

    // Primeira conexão NÃO é reconexão: nada foi perdido.
    canaisCriados[0].emitirStatus('SUBSCRIBED');
    expect(onReconectado).not.toHaveBeenCalled();

    canaisCriados[0].emitirStatus('CHANNEL_ERROR');
    vi.advanceTimersByTime(3_000 + 2_000);
    canaisCriados[1].emitirStatus('SUBSCRIBED');

    // Agora sim: houve um buraco no histórico, o consumidor precisa reler.
    expect(onReconectado).toHaveBeenCalledTimes(1);
  });

  it('o canal recriado entrega eventos aos ouvintes originais', () => {
    const onEvento = vi.fn();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento });

    canaisCriados[0].emitirStatus('CHANNEL_ERROR');
    vi.advanceTimersByTime(3_000 + 2_000);
    canaisCriados[1].emitirStatus('SUBSCRIBED');
    canaisCriados[1].emitirEvento({ eventType: 'INSERT' });

    expect(onEvento).toHaveBeenCalledTimes(1);
  });

  it('cancelar durante o backoff aborta a reconexão', () => {
    const cancelar = assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');
    vi.advanceTimersByTime(3_000);

    cancelar();
    vi.advanceTimersByTime(60_000);

    expect(mockChannel).toHaveBeenCalledTimes(1);
  });
});

// ── 4. Supervisor: aba visível / rede de volta ───────────────────────────────

describe('assinarTabela — recuperação por visibilidade e rede', () => {
  it('voltar para a aba com canal morto reconecta na hora, sem esperar backoff', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');   // state = 'closed'

    document.dispatchEvent(new Event('visibilitychange'));

    // Sem avançar timer nenhum: quem está olhando a tela quer os dados agora.
    expect(mockChannel).toHaveBeenCalledTimes(2);
    expect(mockChannel).toHaveBeenNthCalledWith(2, 't1::r1');
  });

  it('voltar para a aba com canal vivo não recria nada', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('SUBSCRIBED');      // state = 'joined'

    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockChannel).toHaveBeenCalledTimes(1);
  });

  it('evento "online" reconecta os canais mortos', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('TIMED_OUT');

    window.dispatchEvent(new Event('online'));

    expect(mockChannel).toHaveBeenCalledTimes(2);
  });

  it('reconexão por visibilidade também avisa onReconectado', () => {
    const onReconectado = vi.fn();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn(), onReconectado });
    canaisCriados[0].emitirStatus('SUBSCRIBED');
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');

    document.dispatchEvent(new Event('visibilitychange'));
    canaisCriados[1].emitirStatus('SUBSCRIBED');

    expect(onReconectado).toHaveBeenCalledTimes(1);
  });
});
