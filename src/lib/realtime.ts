/**
 * src/lib/realtime.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Assinaturas de `postgres_changes` compartilhadas, com contagem de referências
 * e reconexão automática.
 *
 * ── Os dois problemas que isto resolve ───────────────────────────────────────
 *
 * 1. TÓPICO DUPLICADO. `supabase.channel(nome)` NÃO deduplica: dois componentes
 *    que montam o mesmo hook criam dois canais com o mesmo tópico, e o
 *    `removeChannel` do primeiro a desmontar derruba a assinatura que o outro
 *    ainda está usando. Esse bug já tinha sido diagnosticado duas vezes no
 *    projeto — foi o que motivou o `RealtimeAcordosProvider` e o
 *    `PresenceProvider` — mas os hooks de `nr_registros`, `direto_extra_config`,
 *    `pet_estado` e foto de perfil continuavam expostos a ele.
 *
 * 2. QUEDA SILENCIOSA. Só o canal de acordos tinha reconexão. Todos os outros
 *    ficavam mortos para sempre depois de suspender a máquina, perder a rede ou
 *    o servidor encerrar o socket: a tela seguia mostrando dados velhos, sem
 *    nenhum sinal de que o tempo real havia parado. É a explicação mais provável
 *    para "o realtime funciona e depois de um tempo para".
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
 * `onReconectado` importa para todo consumidor que mantenha estado local: os
 * eventos ocorridos durante a queda NÃO são reenviados, então reler é a única
 * forma de voltar ao estado correto. Sem isso, reconectar só garante que os
 * próximos eventos chegam — o que já estava errado continua errado na tela.
 *
 * ── Escopo ───────────────────────────────────────────────────────────────────
 * Cuida apenas de `postgres_changes`. Presence tem `track`/heartbeat próprios e
 * segue no `PresenceProvider`.
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

export interface AssinaturaTabela {
  /**
   * Nome do tópico. É a chave de deduplicação: dois consumidores com o mesmo
   * tópico compartilham um único canal. Inclua no nome tudo que muda as
   * escutas (empresa, usuário, mês…), senão o segundo consumidor recebe as
   * escutas do primeiro.
   */
  topico:  string;
  escutas: EscutaTabela[];
}

export type PayloadTabela = RealtimePostgresChangesPayload<Record<string, unknown>>;

export interface OuvinteTabela {
  /** Um evento chegou do Postgres. */
  onEvento?: (payload: PayloadTabela) => void;
  /**
   * O canal caiu e voltou. Os eventos do intervalo foram perdidos — releia os
   * dados aqui.
   */
  onReconectado?: () => void;
}

// ── Constantes de reconexão ──────────────────────────────────────────────────

/**
 * Trocar de aba fecha e reabre o socket em ~1s. Sem essa carência, cada alt-tab
 * gastaria uma tentativa de reconexão e criaria um canal novo à toa.
 */
const GRACA_MS        = 3_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS  = 30_000;

// ── Estado do módulo ─────────────────────────────────────────────────────────

interface Registro {
  escutas:      EscutaTabela[];
  ouvintes:     Set<OuvinteTabela>;
  channel:      RealtimeChannel | null;
  /** 0 = canal original; >0 = recriado após queda (entra no nome do tópico). */
  geracao:      number;
  tentativas:   number;
  timerGraca:   ReturnType<typeof setTimeout> | null;
  timerBackoff: ReturnType<typeof setTimeout> | null;
}

const registros = new Map<string, Registro>();

let supervisorAtivo = false;

// ── Helpers internos ─────────────────────────────────────────────────────────

function limparTimers(reg: Registro): void {
  if (reg.timerGraca)   { clearTimeout(reg.timerGraca);   reg.timerGraca   = null; }
  if (reg.timerBackoff) { clearTimeout(reg.timerBackoff); reg.timerBackoff = null; }
}

function criarCanal(topico: string, reg: Registro): void {
  // Reaproveitar o nome de um tópico que acabou de fechar devolve o mesmo canal
  // morto — a partir da 2ª geração o nome muda.
  const nome = reg.geracao === 0 ? topico : `${topico}::r${reg.geracao}`;

  const canal = supabase.channel(nome);

  // `.on()` devolve o próprio canal, e é o valor RETORNADO que encadeamos: é o
  // contrato que o supabase-js documenta e o único que também vale para os mocks
  // dos testes, onde `on()` pode devolver um builder distinto do `channel()`.
  let encadeado = canal;

  for (const escuta of reg.escutas) {
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
    // Registro já descartado (último ouvinte saiu) ou substituído: ignore.
    if (registros.get(topico) !== reg) return;

    if (status === 'SUBSCRIBED') {
      limparTimers(reg);
      reg.tentativas = 0;
      // Geração > 0 significa que este NÃO é o primeiro canal do tópico: houve
      // uma queda, logo há um buraco no histórico de eventos.
      if (reg.geracao > 0) {
        logger.info(`[realtime] ${topico}: reconectado (geração ${reg.geracao})`);
        for (const ouvinte of [...reg.ouvintes]) ouvinte.onReconectado?.();
      }
      return;
    }

    if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      // CLOSED é rotina (troca de aba, remoção do canal) — não é ruído de log.
      if (status !== 'CLOSED') logger.warn(`[realtime] ${topico}: ${status}`, err);
      agendarReconexao(topico, reg);
    }
  });
}

function recriarCanal(topico: string, reg: Registro): void {
  const antigo = reg.channel;
  reg.channel  = null;
  if (antigo) void supabase.removeChannel(antigo);
  reg.geracao += 1;
  criarCanal(topico, reg);
}

function agendarReconexao(topico: string, reg: Registro): void {
  // Já há uma tentativa em curso.
  if (reg.timerGraca || reg.timerBackoff) return;

  reg.timerGraca = setTimeout(() => {
    reg.timerGraca = null;
    if (registros.get(topico) !== reg) return;
    // Voltou sozinho durante a carência (caso comum no alt-tab).
    if (reg.channel?.state === 'joined') return;

    const espera = Math.min(BACKOFF_BASE_MS * 2 ** reg.tentativas, BACKOFF_MAX_MS);
    reg.tentativas += 1;

    reg.timerBackoff = setTimeout(() => {
      reg.timerBackoff = null;
      if (registros.get(topico) !== reg) return;
      recriarCanal(topico, reg);
    }, espera);
  }, GRACA_MS);
}

/**
 * Usuário voltou para a aba, ou a rede voltou: recria na hora todo canal que não
 * esteja `joined`, sem esperar o backoff. Sem backoff de propósito — quem está
 * olhando a tela agora quer os dados agora.
 */
function reviverCanais(): void {
  for (const [topico, reg] of registros) {
    if (reg.channel?.state === 'joined') continue;
    limparTimers(reg);
    reg.tentativas = 0;
    recriarCanal(topico, reg);
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
 * Assina uma ou mais tabelas num canal compartilhado por tópico.
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
      geracao: 0, tentativas: 0, timerGraca: null, timerBackoff: null,
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
    if (meuRegistro.channel) void supabase.removeChannel(meuRegistro.channel);
    meuRegistro.channel = null;
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
