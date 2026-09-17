/**
 * src/lib/realtime.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Assinaturas de tempo real compartilhadas, com contagem de referências e
 * recuperação de queda.
 *
 * ── Os problemas que isto resolve ────────────────────────────────────────────
 *
 * 1. TÓPICO DUPLICADO. Dois componentes que montam o mesmo hook não podem ter
 *    dois canais: o `removeChannel` do primeiro a desmontar derrubaria a
 *    assinatura que o outro ainda usa. Aqui o canal é um por tópico e só sai
 *    quando o último ouvinte cancela.
 *
 * 2. BURACO NO HISTÓRICO. Eventos que acontecem com o canal caído não são
 *    reenviados. `onReconectado` avisa quem guarda estado local para reler.
 *
 * 3. CANAL QUE NINGUÉM REERGUE. O supabase-js reentra sozinho num canal com
 *    ERRO ou TIMEOUT — e também quando o socket volta. Mas canal FECHADO pelo
 *    servidor (token vencido, expulsão) fica fechado para sempre.
 *
 * ── Por que o supabase-js conduz a volta, e não este módulo (17/09/2026) ─────
 *
 * A versão anterior recriava o canal 3 s depois de QUALQUER falha. Isso brigava
 * com a reentrada automática da biblioteca: cada recriação zerava o backoff
 * dela e, pior, o CLOSED do canal que NÓS tínhamos acabado de remover caía no
 * mesmo callback e agendava outra recriação. Com o servidor lento, o ciclo não
 * terminava — o log de produção mostrou `perfil-foto-…::r116`, a 116ª
 * recriação do mesmo canal numa sessão, e 450 mil inscrições em 48 h.
 *
 * Agora:
 *   - ERRO/TIMEOUT: a biblioteca reentra. Um vigia só recria se o canal não
 *     voltar em `VIGIA_MS` com o socket conectado.
 *   - CLOSED que não fomos nós: recria, com backoff e sorteio.
 *   - Callback de canal que já não é o atual: ignorado.
 *
 * ── Tabela ou sinal ──────────────────────────────────────────────────────────
 *
 *   { tabela, evento?, filtro? }   Postgres Changes: o evento é a linha.
 *   { sinal }                      Broadcast que o BANCO manda (`realtime.send`),
 *                                  em canal privado. Para tabela de escrita em
 *                                  lote, onde só interessa saber que mudou —
 *                                  ver `src/lib/sinais.ts` e a migration
 *                                  20260917110000.
 *
 * ── Como usar ────────────────────────────────────────────────────────────────
 *
 *   useEffect(() => assinarTabela(
 *     {
 *       topico:  `rt-x-${empresaId}`,
 *       escutas: [{ tabela: 'x', filtro: `empresa_id=eq.${empresaId}` }],
 *     },
 *     {
 *       onEvento:      (payload) => { … },
 *       onReconectado: () => { void refetch(); },
 *     },
 *   ), [empresaId]);
 *
 * ── Escopo ───────────────────────────────────────────────────────────────────
 * Presence tem `track` próprio e segue no `PresenceProvider`.
 */
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// ── Tipos públicos ───────────────────────────────────────────────────────────

export type EventoTabela = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface EscutaTabela {
  tabela:  string;
  /** Padrão: '*' (INSERT + UPDATE + DELETE). */
  evento?: EventoTabela;
  /**
   * Filtro do Postgres Changes, ex. `empresa_id=eq.${id}`.
   *
   * ⚠️ Não filtre DELETE por coluna que não seja a PK: o payload de DELETE só
   * traz a replica identity, então um filtro por `empresa_id` nunca casa e o
   * evento simplesmente não chega.
   */
  filtro?: string;
  /** Padrão: 'public'. */
  schema?: string;
}

/**
 * Evento de Broadcast emitido pelo banco. O canal passa a ser PRIVADO e o nome
 * do tópico é usado exatamente como veio — é o tópico que o gatilho escreve.
 */
export interface EscutaSinal {
  sinal: string;
}

export type Escuta = EscutaTabela | EscutaSinal;

export interface AssinaturaTabela {
  /**
   * Nome do tópico. É a chave de deduplicação: dois consumidores com o mesmo
   * tópico compartilham um único canal. Inclua no nome tudo que muda as
   * escutas (empresa, usuário, mês…), senão o segundo consumidor recebe as
   * escutas do primeiro.
   */
  topico:  string;
  escutas: Escuta[];
}

export type PayloadTabela = RealtimePostgresChangesPayload<Record<string, unknown>>;

export interface OuvinteTabela {
  /** Uma linha mudou (escutas de tabela). */
  onEvento?: (payload: PayloadTabela) => void;
  /** O banco mandou um sinal (escutas de sinal). */
  onSinal?: (payload: Record<string, unknown>, sinal: string) => void;
  /**
   * O canal caiu e voltou. Os eventos do intervalo foram perdidos — releia os
   * dados aqui.
   */
  onReconectado?: () => void;
}

// ── Constantes ───────────────────────────────────────────────────────────────

/**
 * Quanto esperar a reentrada da biblioteca antes de recriar o canal. O backoff
 * dela vai até 10 s; o vigia dá folga para algumas tentativas.
 */
export const VIGIA_MS = 45_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS  = 30_000;
/**
 * Quando o servidor cai, os canais de TODO mundo voltam no mesmo segundo. Se
 * todos relessem no mesmo instante, a volta viraria outro pico no banco: são
 * ~150 pessoas com uma dezena de telas ouvindo cada uma. Oito segundos
 * espalham isso em ~200 leituras por segundo no pior caso, em vez de 1.500 de
 * uma vez.
 */
export const ESPALHAMENTO_RELEITURA_MS = 8_000;
/** Voltar para a aba: rápido, mas não no mesmo milissegundo para todas as abas. */
const ESPALHAMENTO_RETOMADA_MS = 1_000;

// ── Estado do módulo ─────────────────────────────────────────────────────────

interface Registro {
  escutas:      Escuta[];
  ouvintes:     Set<OuvinteTabela>;
  channel:      RealtimeChannel | null;
  /** 0 = canal original; >0 = recriado (entra no nome, exceto em sinal). */
  geracao:      number;
  /** Recriações seguidas sem SUBSCRIBED — base do backoff. */
  tentativas:   number;
  /** Falhas seguidas sem SUBSCRIBED — só decide o tom do log. */
  falhas:       number;
  /** Caiu desde o último SUBSCRIBED: o próximo avisa `onReconectado`. */
  caiu:         boolean;
  recriando:    boolean;
  timerRecriar: ReturnType<typeof setTimeout> | null;
  timerVigia:   ReturnType<typeof setTimeout> | null;
  timerAviso:   ReturnType<typeof setTimeout> | null;
}

const registros = new Map<string, Registro>();

let supervisorAtivo = false;

// ── Helpers internos ─────────────────────────────────────────────────────────

function ehSinal(escuta: Escuta): escuta is EscutaSinal {
  return 'sinal' in escuta;
}

function limparTimers(reg: Registro): void {
  if (reg.timerRecriar) { clearTimeout(reg.timerRecriar); reg.timerRecriar = null; }
  if (reg.timerVigia)   { clearTimeout(reg.timerVigia);   reg.timerVigia   = null; }
  if (reg.timerAviso)   { clearTimeout(reg.timerAviso);   reg.timerAviso   = null; }
}

/** Sem cliente de realtime (mocks de teste), vale como conectado. */
function socketConectado(): boolean {
  const rt = (supabase as { realtime?: { isConnected?: () => boolean } }).realtime;
  return rt?.isConnected?.() ?? true;
}

function criarCanal(topico: string, reg: Registro): void {
  const privado = reg.escutas.some(ehSinal);
  // Tópico de sinal é o que o gatilho escreve: não pode ganhar sufixo. Por isso
  // `recriarCanal` espera o canal antigo sair antes de chegar aqui.
  const nome = privado || reg.geracao === 0 ? topico : `${topico}::r${reg.geracao}`;

  const canal = privado
    ? supabase.channel(nome, { config: { private: true } })
    : supabase.channel(nome);

  // `.on()` devolve o próprio canal, e é o valor RETORNADO que encadeamos: é o
  // contrato que o supabase-js documenta e o único que também vale para os mocks
  // dos testes, onde `on()` pode devolver um builder distinto do `channel()`.
  let encadeado = canal;

  for (const escuta of reg.escutas) {
    if (ehSinal(escuta)) {
      encadeado = encadeado.on('broadcast', { event: escuta.sinal }, (mensagem: { payload?: unknown }) => {
        const payload = (mensagem?.payload ?? {}) as Record<string, unknown>;
        for (const ouvinte of [...reg.ouvintes]) ouvinte.onSinal?.(payload, escuta.sinal);
      }) as typeof canal;
      continue;
    }

    const config: Record<string, unknown> = {
      event:  escuta.evento ?? '*',
      schema: escuta.schema ?? 'public',
      table:  escuta.tabela,
    };
    // `filter: undefined` vira `filter=undefined` na query do servidor — omitir.
    if (escuta.filtro) config.filter = escuta.filtro;

    // O tipo de `.on('postgres_changes', …)` é uma união discriminada por
    // literal de evento; com `event` vindo de variável a inferência não fecha.
    // O shape é validado logo acima.
    encadeado = encadeado.on('postgres_changes', config as never, (payload: PayloadTabela) => {
      // Cópia: um ouvinte pode se desinscrever durante o próprio despacho.
      for (const ouvinte of [...reg.ouvintes]) ouvinte.onEvento?.(payload);
    }) as typeof canal;
  }

  // Guardamos o objeto de `channel()`: é ele que `removeChannel()` espera.
  reg.channel = canal;

  encadeado.subscribe((status: string, err?: Error) => {
    // Registro descartado, ou canal que já não é o dele (foi removido para ser
    // recriado). Sem esta guarda o CLOSED do canal que NÓS removemos agendava
    // outra recriação — o laço do `::r116`.
    if (registros.get(topico) !== reg || reg.channel !== canal) return;

    if (status === 'SUBSCRIBED') {
      limparTimers(reg);
      reg.tentativas = 0;
      reg.falhas     = 0;
      if (reg.caiu) {
        reg.caiu = false;
        logger.info(`[realtime] ${topico}: reconectado`);
        avisarReconectado(topico, reg);
      }
      return;
    }

    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      reg.caiu = true;
      /*
       * A PRIMEIRA falha de um ciclo não é defeito. Quando o WebSocket cai,
       * TODO canal aberto dispara `CHANNEL_ERROR` no mesmo instante, sempre com
       * `undefined` do lado — e a reentrada resolve sozinha. Vira `warn` só se
       * a falha se repetir sem voltar.
       */
      const msg = `[realtime] ${topico}: ${status}`;
      const registrar = reg.falhas === 0 ? logger.info : logger.warn;
      // `err` só entra quando existe: `logger.warn(msg, undefined)` imprime a
      // palavra "undefined" no fim da linha e não informa nada.
      if (err) registrar(msg, err); else registrar(msg);
      reg.falhas += 1;
      armarVigia(topico, reg);
      return;
    }

    if (status === 'CLOSED') {
      // Fechado sem ser por nós: a biblioteca não reentra canal fechado.
      reg.caiu = true;
      agendarRecriacao(topico, reg);
    }
  });
}

function avisarReconectado(topico: string, reg: Registro): void {
  if (reg.timerAviso) return;
  reg.timerAviso = setTimeout(() => {
    reg.timerAviso = null;
    if (registros.get(topico) !== reg) return;
    for (const ouvinte of [...reg.ouvintes]) ouvinte.onReconectado?.();
  }, Math.random() * ESPALHAMENTO_RELEITURA_MS);
}

function armarVigia(topico: string, reg: Registro): void {
  if (reg.timerVigia) return;
  reg.timerVigia = setTimeout(() => {
    reg.timerVigia = null;
    if (registros.get(topico) !== reg) return;
    if (reg.channel?.state === 'joined') return;
    // Socket caído: quem reconecta é a biblioteca, e os canais entram juntos
    // quando ele voltar. Recriar agora só geraria um join que não sai.
    if (!socketConectado()) { armarVigia(topico, reg); return; }
    agendarRecriacao(topico, reg);
  }, VIGIA_MS);
}

/** Backoff exponencial com metade sorteada: as abas não voltam em uníssono. */
function agendarRecriacao(topico: string, reg: Registro): void {
  if (reg.timerRecriar || reg.recriando) return;
  const teto = Math.min(BACKOFF_BASE_MS * 2 ** reg.tentativas, BACKOFF_MAX_MS);
  const espera = teto / 2 + Math.random() * (teto / 2);
  reg.tentativas += 1;

  reg.timerRecriar = setTimeout(() => {
    reg.timerRecriar = null;
    if (registros.get(topico) !== reg) return;
    if (reg.channel?.state === 'joined') return;
    void recriarCanal(topico, reg);
  }, espera);
}

async function recriarCanal(topico: string, reg: Registro): Promise<void> {
  if (reg.recriando) return;
  reg.recriando = true;
  const antigo = reg.channel;
  // Antes de remover: o CLOSED que a remoção dispara já encontra outro canal
  // (ou nenhum) no registro e é ignorado.
  reg.channel = null;
  try {
    // `supabase.channel(nome)` devolve o canal que ainda estiver na lista com o
    // mesmo tópico — e um canal saindo não entra de novo. Esperar a saída.
    if (antigo) await supabase.removeChannel(antigo);
  } catch {
    // Remoção que falha não impede o canal novo.
  } finally {
    reg.recriando = false;
  }
  if (registros.get(topico) !== reg) return;
  if (reg.timerVigia) { clearTimeout(reg.timerVigia); reg.timerVigia = null; }
  reg.geracao += 1;
  reg.caiu = true;
  criarCanal(topico, reg);
}

/**
 * Usuário voltou para a aba, ou a rede voltou. O socket reconecta na hora (os
 * canais com erro reentram com ele); canal FECHADO é recriado, espalhado.
 */
function reviverCanais(): void {
  const rt = (supabase as { realtime?: { isConnected?: () => boolean; connect?: () => void } }).realtime;
  if (rt && rt.isConnected && !rt.isConnected()) rt.connect?.();

  for (const [topico, reg] of registros) {
    if (reg.recriando) continue;
    const estado = reg.channel?.state;
    if (estado === 'joined' || estado === 'joining' || estado === 'leaving') continue;
    if (estado === 'errored') { armarVigia(topico, reg); continue; }

    if (reg.timerRecriar) { clearTimeout(reg.timerRecriar); reg.timerRecriar = null; }
    reg.tentativas = 0;
    reg.timerRecriar = setTimeout(() => {
      reg.timerRecriar = null;
      if (registros.get(topico) !== reg) return;
      if (reg.channel?.state === 'joined') return;
      void recriarCanal(topico, reg);
    }, Math.random() * ESPALHAMENTO_RETOMADA_MS);
  }
}

/**
 * Um único par de listeners para todo o app, registrado na primeira assinatura e
 * nunca removido (vive enquanto a página vive). Refcontá-los não traria ganho e
 * abriria a janela em que uma troca de rota deixa o app sem supervisão.
 */
function ativarSupervisor(): void {
  if (supervisorAtivo) return;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  supervisorAtivo = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reviverCanais();
  });
  window.addEventListener('online', reviverCanais);
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Assina tabelas ou sinais num canal compartilhado por tópico.
 *
 * @returns função de cancelamento — chame no cleanup do `useEffect`. O canal só
 *          é removido quando o ÚLTIMO ouvinte do tópico cancela.
 */
export function assinarTabela(
  assinatura: AssinaturaTabela,
  ouvinte:    OuvinteTabela,
): () => void {
  const { topico, escutas } = assinatura;

  ativarSupervisor();

  let reg = registros.get(topico);

  if (!reg) {
    reg = {
      escutas, ouvintes: new Set(), channel: null,
      geracao: 0, tentativas: 0, falhas: 0, caiu: false, recriando: false,
      timerRecriar: null, timerVigia: null, timerAviso: null,
    };
    registros.set(topico, reg);
    reg.ouvintes.add(ouvinte);
    // Depois de registrar o ouvinte: se o canal subir de forma síncrona (mocks
    // de teste fazem isso), o primeiro despacho já encontra o ouvinte.
    criarCanal(topico, reg);
  } else {
    // Mesmo tópico com escutas diferentes: o segundo consumidor receberia
    // silenciosamente as escutas do primeiro. É erro de nomeação do tópico.
    if (import.meta.env.DEV && JSON.stringify(reg.escutas) !== JSON.stringify(escutas)) {
      logger.warn(
        `[realtime] tópico "${topico}" reutilizado com escutas diferentes. ` +
        'Inclua no nome do tópico tudo que muda as escutas.',
        { registrado: reg.escutas, recebido: escutas },
      );
    }
    reg.ouvintes.add(ouvinte);
  }

  const meuRegistro = reg;

  return () => {
    meuRegistro.ouvintes.delete(ouvinte);
    if (meuRegistro.ouvintes.size > 0) return;
    // Outro registro já assumiu o tópico — não é nosso para remover.
    if (registros.get(topico) !== meuRegistro) return;

    registros.delete(topico);
    limparTimers(meuRegistro);
    const canal = meuRegistro.channel;
    meuRegistro.channel = null;
    if (canal) void supabase.removeChannel(canal);
  };
}

/** Quantos tópicos estão ativos. Diagnóstico — não use para lógica de tela. */
export function topicosAtivos(): string[] {
  return [...registros.keys()];
}

/**
 * Descarta todo o estado do módulo. Existe para os testes: o registro é
 * global, então um canal criado num teste vazaria para o próximo e a
 * deduplicação faria o segundo teste não criar canal nenhum.
 */
export function __resetRealtimeParaTestes(): void {
  for (const reg of registros.values()) {
    limparTimers(reg);
    if (reg.channel) void supabase.removeChannel(reg.channel);
  }
  registros.clear();
}
