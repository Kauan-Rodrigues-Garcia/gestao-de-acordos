/**
 * realtime.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cobre os comportamentos que justificam a existência do módulo:
 *
 *   1. Deduplicação por tópico — N ouvintes, UM canal; o canal só morre quando o
 *      último cancela (o bug antigo: o primeiro a desmontar derrubava os outros).
 *   2. Recuperação — erro fica com a reentrada do supabase-js (vigia só age se
 *      ela não vier), CLOSED recria com backoff, e `onReconectado` avisa o
 *      consumidor de que há um buraco no histórico de eventos.
 *   3. O laço de 17/09/2026: o CLOSED do canal que o próprio módulo removeu não
 *      pode agendar outra recriação.
 *   4. Sinais do banco — canal privado, nome exato, payload normalizado.
 *
 * Usa timers falsos: os atrasos são de segundos e são parte do contrato. O
 * sorteio (`Math.random`) é fixado em 1 para que cada espera seja o seu teto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock do Supabase ────────────────────────────────────────────────────────
//
// Cada `channel(nome)` devolve um canal novo e rastreável. Guardamos o callback
// de `subscribe` para dirigir o status à mão, e `state` acompanha o status como
// no supabase-js.

type Binding = { tipo: string; config: Record<string, unknown>; cb: (p: unknown) => void };

function novoCanalFalso(nome: string, opcoes?: unknown) {
  const canal = {
    nome,
    opcoes,
    bindings: [] as Binding[],
    state:    'closed',
    statusCb: null as ((status: string, err?: Error) => void) | null,

    on(tipo: string, config: Record<string, unknown>, cb: (p: unknown) => void) {
      canal.bindings.push({ tipo, config, cb });
      return canal;
    },
    subscribe(cb: (status: string, err?: Error) => void) {
      canal.statusCb = cb;
      canal.state = 'joining';
      return canal;
    },

    /** Dispara um status como o servidor faria, ajustando `state` junto. */
    emitirStatus(status: string) {
      canal.state = status === 'SUBSCRIBED' ? 'joined'
        : status === 'CLOSED' ? 'closed'
        : 'errored';
      canal.statusCb?.(status);
    },
    /** Dispara um evento em todos os bindings do tipo. */
    emitirEvento(payload: unknown, tipo = 'postgres_changes') {
      for (const b of canal.bindings) if (b.tipo === tipo) b.cb(payload);
    },
  };
  return canal;
}

type CanalFalso = ReturnType<typeof novoCanalFalso>;

const canaisCriados: CanalFalso[] = [];
const removidos: string[] = [];
const socket = { conectado: true };

const mockChannel = vi.fn((nome: string, opcoes?: unknown) => {
  const c = novoCanalFalso(nome, opcoes);
  canaisCriados.push(c);
  return c;
});
const mockRemoveChannel = vi.fn((c: CanalFalso) => {
  removidos.push(c.nome);
  // Como no supabase-js: sair dispara o CLOSED do próprio canal.
  c.emitirStatus('CLOSED');
  return Promise.resolve('ok');
});
const mockConnect = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel:       (nome: string, opcoes?: unknown) => mockChannel(nome, opcoes),
    removeChannel: (c: CanalFalso) => mockRemoveChannel(c),
    realtime: {
      isConnected: () => socket.conectado,
      connect:     () => mockConnect(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  assinarTabela, topicosAtivos, __resetRealtimeParaTestes,
  VIGIA_MS, ESPALHAMENTO_RELEITURA_MS,
} from '../realtime';
import { assinarSinal, REGRAS_SINAL } from '../sinais';

const ESCUTAS = [{ tabela: 'acordos', filtro: 'empresa_id=eq.e1' }];

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(1);
  canaisCriados.length = 0;
  removidos.length     = 0;
  socket.conectado     = true;
  mockChannel.mockClear();
  mockRemoveChannel.mockClear();
  mockConnect.mockClear();
});

afterEach(() => {
  __resetRealtimeParaTestes();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ── 1. Deduplicação por tópico ───────────────────────────────────────────────

describe('assinarTabela — deduplicação por tópico', () => {
  it('cria UM canal para dois ouvintes do mesmo tópico', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });

    expect(mockChannel).toHaveBeenCalledTimes(1);
    expect(mockChannel.mock.calls[0][0]).toBe('t1');
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

  it('o CLOSED da remoção pelo último ouvinte não recria nada', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() })();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockChannel).toHaveBeenCalledTimes(1);
  });

  it('assinar de novo depois de remover cria um canal novo com o tópico original', () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() })();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });

    expect(mockChannel.mock.calls[1][0]).toBe('t1');
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

// ── 3. Recuperação ───────────────────────────────────────────────────────────

describe('assinarTabela — erro fica com a reentrada da biblioteca', () => {
  it('CHANNEL_ERROR não recria o canal antes do vigia', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');

    await vi.advanceTimersByTimeAsync(VIGIA_MS - 1);
    expect(mockChannel).toHaveBeenCalledTimes(1);
    expect(mockRemoveChannel).not.toHaveBeenCalled();
  });

  it('reentrada da biblioteca no MESMO canal avisa onReconectado e não recria', async () => {
    const onReconectado = vi.fn();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn(), onReconectado });
    canaisCriados[0].emitirStatus('SUBSCRIBED');
    expect(onReconectado).not.toHaveBeenCalled();   // primeira conexão não é reconexão

    canaisCriados[0].emitirStatus('TIMED_OUT');
    await vi.advanceTimersByTimeAsync(2_000);
    canaisCriados[0].emitirStatus('SUBSCRIBED');     // o supabase-js reentrou
    await vi.advanceTimersByTimeAsync(ESPALHAMENTO_RELEITURA_MS);

    expect(onReconectado).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(VIGIA_MS * 2);
    expect(mockChannel).toHaveBeenCalledTimes(1);
  });

  it('a releitura é sorteada, não no mesmo instante para todas as abas', async () => {
    const onReconectado = vi.fn();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn(), onReconectado });
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');
    canaisCriados[0].emitirStatus('SUBSCRIBED');

    await vi.advanceTimersByTimeAsync(ESPALHAMENTO_RELEITURA_MS - 1);
    expect(onReconectado).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onReconectado).toHaveBeenCalledTimes(1);
  });

  it('se não voltar em VIGIA_MS com o socket conectado, recria', async () => {
    const onReconectado = vi.fn();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn(), onReconectado });
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');

    await vi.advanceTimersByTimeAsync(VIGIA_MS + 2_000);

    expect(mockChannel).toHaveBeenCalledTimes(2);
    expect(mockChannel.mock.calls[1][0]).toBe('t1::r1');
    expect(removidos).toEqual(['t1']);

    canaisCriados[1].emitirStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(ESPALHAMENTO_RELEITURA_MS);
    expect(onReconectado).toHaveBeenCalledTimes(1);
  });

  it('com o socket caído o vigia espera — quem reconecta é a biblioteca', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    socket.conectado = false;
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');

    await vi.advanceTimersByTimeAsync(VIGIA_MS * 3);
    expect(mockChannel).toHaveBeenCalledTimes(1);

    socket.conectado = true;
    await vi.advanceTimersByTimeAsync(VIGIA_MS + 2_000);
    expect(mockChannel).toHaveBeenCalledTimes(2);
  });
});

describe('assinarTabela — CLOSED recria', () => {
  it('CLOSED do servidor recria com backoff', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('CLOSED');

    await vi.advanceTimersByTimeAsync(1_999);
    expect(mockChannel).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockChannel).toHaveBeenCalledTimes(2);
  });

  it('o CLOSED do canal que o módulo removeu NÃO agenda outra recriação (laço ::r116)', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mockChannel).toHaveBeenCalledTimes(2);

    // O mock de removeChannel já emitiu CLOSED no canal 0. Mais um, atrasado:
    canaisCriados[0].emitirStatus('CLOSED');
    // O canal novo demora a entrar (servidor lento) — antes, isso recriava de novo.
    await vi.advanceTimersByTimeAsync(VIGIA_MS - 1);

    expect(mockChannel).toHaveBeenCalledTimes(2);
  });

  it('backoff é exponencial e não desiste (2s, 4s, 8s…)', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });

    const esperas = [2_000, 4_000, 8_000];
    for (let i = 0; i < esperas.length; i++) {
      canaisCriados[i].emitirStatus('CLOSED');
      await vi.advanceTimersByTimeAsync(esperas[i] - 1);
      expect(mockChannel).toHaveBeenCalledTimes(i + 1);   // ainda não
      await vi.advanceTimersByTimeAsync(1);
      expect(mockChannel).toHaveBeenCalledTimes(i + 2);   // agora sim
    }
  });

  it('backoff satura em 30s em vez de crescer para sempre', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });

    // 10 quedas: 2^10 * 2s seria ~34min sem o teto.
    for (let i = 0; i < 10; i++) {
      canaisCriados[i].emitirStatus('CLOSED');
      await vi.advanceTimersByTimeAsync(30_000);
    }
    expect(mockChannel).toHaveBeenCalledTimes(11);
  });

  it('o canal recriado entrega eventos aos ouvintes originais', async () => {
    const onEvento = vi.fn();
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento });

    canaisCriados[0].emitirStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(2_000);
    canaisCriados[1].emitirStatus('SUBSCRIBED');
    canaisCriados[1].emitirEvento({ eventType: 'INSERT' });

    expect(onEvento).toHaveBeenCalledTimes(1);
  });

  it('cancelar durante o backoff aborta a reconexão', async () => {
    const cancelar = assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(1_000);

    cancelar();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockChannel).toHaveBeenCalledTimes(1);
  });
});

// ── 4. Supervisor: aba visível / rede de volta ───────────────────────────────

describe('assinarTabela — recuperação por visibilidade e rede', () => {
  it('voltar para a aba com canal FECHADO recria logo, sem esperar backoff', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    // Fechado e com a recriação num backoff longo.
    for (let i = 0; i < 4; i++) {
      canaisCriados[i].emitirStatus('CLOSED');
      await vi.advanceTimersByTimeAsync(2_000 * 2 ** i);
    }
    canaisCriados[4].emitirStatus('CLOSED');   // próxima espera seria 30 s

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mockChannel).toHaveBeenCalledTimes(6);
  });

  it('voltar para a aba com canal vivo não recria nada', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].emitirStatus('SUBSCRIBED');

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(5_000);

    expect(mockChannel).toHaveBeenCalledTimes(1);
  });

  it('voltar para a aba com canal em ERRO religa o socket e deixa a biblioteca reentrar', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    socket.conectado = false;
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(5_000);

    expect(mockConnect).toHaveBeenCalled();
    expect(mockChannel).toHaveBeenCalledTimes(1);
  });

  it('evento "online" recria os canais fechados', async () => {
    assinarTabela({ topico: 't1', escutas: ESCUTAS }, { onEvento: vi.fn() });
    canaisCriados[0].state = 'closed';

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mockChannel).toHaveBeenCalledTimes(2);
  });
});

// ── 5. Sinais do banco ───────────────────────────────────────────────────────

describe('assinarSinal', () => {
  it('abre canal PRIVADO com o tópico exato e escuta o broadcast «mudou»', () => {
    assinarSinal('analitico', 'e1', { onMudou: vi.fn() });

    expect(mockChannel).toHaveBeenCalledWith('analitico:e1', { config: { private: true } });
    expect(canaisCriados[0].bindings.map(b => [b.tipo, b.config])).toEqual([
      ['broadcast', { event: 'mudou' }],
    ]);
  });

  it('entrega o payload normalizado, depois do sorteio', async () => {
    const onMudou = vi.fn();
    assinarSinal('analitico', 'e1', { onMudou });

    canaisCriados[0].emitirEvento(
      { type: 'broadcast', event: 'mudou',
        payload: { tabela: 'analitico_recebimentos', operacao: 'INSERT', importado_por: ['u1', 7], id: 'x' } },
      'broadcast',
    );

    expect(onMudou).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(REGRAS_SINAL.analitico.espalhamentoMs);

    expect(onMudou).toHaveBeenCalledWith({
      tabela: 'analitico_recebimentos', operacao: 'INSERT', importado_por: ['u1'],
    });
  });

  it('duas telas no mesmo sinal dividem um canal', async () => {
    const a = vi.fn();
    const b = vi.fn();
    assinarSinal('analitico', 'e1', { onMudou: a });
    assinarSinal('analitico', 'e1', { onMudou: b });

    canaisCriados[0].emitirEvento({ payload: {} }, 'broadcast');
    await vi.advanceTimersByTimeAsync(REGRAS_SINAL.analitico.espalhamentoMs);

    expect(mockChannel).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('recriado, mantém o nome exato — é o tópico que o gatilho escreve', async () => {
    assinarSinal('permissoes', 'e1', { onMudou: vi.fn() });
    canaisCriados[0].emitirStatus('CLOSED');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(mockChannel).toHaveBeenCalledTimes(2);
    expect(mockChannel.mock.calls[1]).toEqual(['permissoes:e1', { config: { private: true } }]);
    // E só depois de o antigo sair.
    expect(removidos).toEqual(['permissoes:e1']);
  });
});

// ── 6. O portão entre o sinal e a tela ───────────────────────────────────────

describe('assinarSinal — portão', () => {
  const ESPALHA = REGRAS_SINAL.analitico.espalhamentoMs;
  const MINIMO  = REGRAS_SINAL.analitico.minimoMs;

  let visibilidade: DocumentVisibilityState = 'visible';
  beforeEach(() => {
    visibilidade = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilidade);
  });

  function trocarVisibilidade(estado: DocumentVisibilityState) {
    visibilidade = estado;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function sinal(payload: Record<string, unknown>) {
    canaisCriados[0].emitirEvento({ payload }, 'broadcast');
  }

  it('sinais na mesma espera viram UM, com INSERT prevalecendo e importadores somados', async () => {
    const onMudou = vi.fn();
    assinarSinal('analitico', 'e1', { onMudou });

    sinal({ tabela: 'analitico_recebimentos', operacao: 'INSERT', importado_por: ['u1'] });
    sinal({ tabela: 'analitico_recebimentos', operacao: 'UPDATE', importado_por: ['u2', 'u1'] });
    await vi.advanceTimersByTimeAsync(ESPALHA);

    expect(onMudou).toHaveBeenCalledTimes(1);
    expect(onMudou).toHaveBeenCalledWith({
      tabela: 'analitico_recebimentos', operacao: 'INSERT', importado_por: ['u1', 'u2'],
    });
  });

  it('respeita o intervalo mínimo entre duas entregas', async () => {
    const onMudou = vi.fn();
    assinarSinal('analitico', 'e1', { onMudou });

    sinal({ operacao: 'UPDATE' });
    await vi.advanceTimersByTimeAsync(ESPALHA);
    expect(onMudou).toHaveBeenCalledTimes(1);

    sinal({ operacao: 'UPDATE' });
    await vi.advanceTimersByTimeAsync(MINIMO - 1);
    expect(onMudou).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ESPALHA + 1);
    expect(onMudou).toHaveBeenCalledTimes(2);
  });

  it('aba escondida não relê; paga uma vez ao voltar', async () => {
    const onMudou = vi.fn();
    assinarSinal('analitico', 'e1', { onMudou });

    trocarVisibilidade('hidden');
    sinal({ operacao: 'INSERT' });
    sinal({ operacao: 'UPDATE' });
    await vi.advanceTimersByTimeAsync(10 * MINIMO);
    expect(onMudou).not.toHaveBeenCalled();

    trocarVisibilidade('visible');
    await vi.advanceTimersByTimeAsync(ESPALHA);
    expect(onMudou).toHaveBeenCalledTimes(1);
    expect(onMudou.mock.calls[0][0].operacao).toBe('INSERT');
  });

  it('sinal que escondeu durante o sorteio espera a volta', async () => {
    const onMudou = vi.fn();
    assinarSinal('analitico', 'e1', { onMudou });

    sinal({ operacao: 'UPDATE' });
    trocarVisibilidade('hidden');
    await vi.advanceTimersByTimeAsync(ESPALHA);
    expect(onMudou).not.toHaveBeenCalled();

    trocarVisibilidade('visible');
    await vi.advanceTimersByTimeAsync(ESPALHA);
    expect(onMudou).toHaveBeenCalledTimes(1);
  });

  it('reconexão chama onReconectado, e o sinal junto dela não vira segunda releitura', async () => {
    const onMudou = vi.fn();
    const onReconectado = vi.fn();
    assinarSinal('analitico', 'e1', { onMudou, onReconectado });

    canaisCriados[0].emitirStatus('SUBSCRIBED');
    canaisCriados[0].emitirStatus('CHANNEL_ERROR');
    canaisCriados[0].emitirStatus('SUBSCRIBED');
    sinal({ operacao: 'INSERT' });
    await vi.advanceTimersByTimeAsync(ESPALHAMENTO_RELEITURA_MS + ESPALHA);

    expect(onReconectado).toHaveBeenCalledTimes(1);
    expect(onMudou).not.toHaveBeenCalled();
  });

  it('cancelar descarta a entrega pendente', async () => {
    const onMudou = vi.fn();
    const cancelar = assinarSinal('analitico', 'e1', { onMudou });

    sinal({ operacao: 'UPDATE' });
    cancelar();
    await vi.advanceTimersByTimeAsync(ESPALHA);

    expect(onMudou).not.toHaveBeenCalled();
  });
});
