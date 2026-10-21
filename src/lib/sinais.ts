/**
 * src/lib/sinais.ts — «esta tabela mudou nesta empresa», dito pelo banco.
 *
 * Tabela de escrita em lote (a importação do analítico grava milhares de linhas
 * de uma vez) não pode ir pelo Postgres Changes: o Realtime reavalia a RLS de
 * cada linha para cada assinante, o leitor estoura o tempo e derruba o tempo
 * real de todo mundo. Ver a migration 20260917110000.
 *
 * No lugar, um gatilho por COMANDO manda um Broadcast por empresa:
 *
 *   tópico  `<nome>:<empresa_id>`   evento `mudou`
 *   payload { tabela, operacao, importado_por }
 *
 * O canal é privado: a policy `sinal_mudou_receber` deixa ouvir só quem tem
 * acesso à empresa.
 *
 * ## O portão (18/09/2026)
 *
 * O sinal chega para a empresa INTEIRA no mesmo instante, e cada consumidor
 * relê o que mostra. Medido em 18/09/2026: ~700 sinais `analitico` por hora no
 * expediente (cada tabulação de linha é um UPDATE, e cada UPDATE é um sinal), e
 * 95.874 releituras de `fn_analitico_dashboard_mes_json` em 3 dias — 13,4 h de
 * banco, todas em rajada.
 *
 * Entre o sinal e o consumidor há agora um portão, por assinatura:
 *
 *   - aba escondida não relê: guarda que ficou devendo e paga uma vez, quando
 *     a pessoa volta;
 *   - aba visível espera um sorteio (`espalhamentoMs`), para as abas da empresa
 *     não baterem no banco no mesmo segundo;
 *   - entre duas entregas há um intervalo mínimo (`minimoMs`). Os sinais que
 *     chegam nesse meio-tempo se juntam num só.
 *
 * O analítico tolera 30 s: é um retrato do mês, e o importador tem o próprio
 * retorno na tela de importação. Os outros sinais são raros e só ganham o
 * sorteio.
 *
 * ## Só UPDATE (18/09/2026)
 *
 * Medido em 18/09/2026 depois do portão: cada tabulação é um PATCH (~160/h), e
 * isso bastava para manter todo dashboard aberto no teto de uma releitura a
 * cada 30 s — 14.182 chamadas de `fn_analitico_dashboard_mes_json` em 3,4 h,
 * 68% do tempo do banco. Tabular não muda valor nenhum, só o status.
 *
 * Quem relê o mês inteiro pode pedir `minimoSoUpdateMs`: enquanto tudo o que
 * chegou for UPDATE, a espera é essa (contada também desde a assinatura, que é
 * quando a tela acabou de ler). INSERT ou DELETE no meio encurta de volta para
 * o `minimoMs` da regra — importação continua chegando em 30 s.
 */
import { assinarTabela } from '@/lib/realtime';
import { invalidarCache } from '@/lib/cacheCurto';

/**
 * Os tópicos que o banco escreve: migration 20260917110000, e `diario`
 * (recebimento diário da PaguePlay) na 20260928180000. Desde 20261009201000
 * as configurações também: `comemoracoes`, `desafios` (desafios e
 * desafios_setores), `direto_extra` e `comissao` (as cinco tabelas) — eram
 * Postgres Changes, 1.387 assinaturas conferidas uma a uma no banco.
 * Desde 20261013170000, o resto das listas que só eram relidas:
 * `autorizacoes`, `contribuicao` (receptivo), `numeros` (as quatro tabelas de
 * números/chips) e `ajustes` (ajuste manual do analítico).
 */
export type NomeSinal =
  | 'analitico' | 'permissoes' | 'vendas' | 'rh' | 'diario'
  | 'comemoracoes' | 'desafios' | 'direto_extra' | 'comissao'
  | 'autorizacoes' | 'contribuicao' | 'numeros' | 'ajustes';

export interface SinalMudou {
  /** Tabela que mudou (`rh` cobre duas, `permissoes` também). */
  tabela:        string;
  operacao:      'INSERT' | 'UPDATE' | 'DELETE';
  /** Só no analítico: quem importou as linhas inseridas/atualizadas. */
  importado_por: string[];
}

export interface OuvinteSinal {
  onMudou?:       (sinal: SinalMudou) => void;
  /** O canal caiu e voltou: sinais do intervalo se perderam — releia. */
  onReconectado?: () => void;
}

export interface OpcoesSinal {
  /**
   * Intervalo mínimo enquanto tudo o que chegou foi UPDATE. Nunca abaixo do
   * `minimoMs` da regra. Ver «Só UPDATE» no cabeçalho.
   */
  minimoSoUpdateMs?: number;
}

interface RegraPortao {
  /** Intervalo mínimo entre duas entregas ao mesmo ouvinte. */
  minimoMs:       number;
  /** Teto do sorteio antes de cada entrega. */
  espalhamentoMs: number;
}

export const REGRAS_SINAL: Record<NomeSinal, RegraPortao> = {
  analitico:  { minimoMs: 30_000, espalhamentoMs: 10_000 },
  permissoes: { minimoMs: 0,      espalhamentoMs: 3_000 },
  vendas:     { minimoMs: 0,      espalhamentoMs: 2_000 },
  rh:         { minimoMs: 0,      espalhamentoMs: 3_000 },
  // Importação em blocos: um sinal por bloco. O mínimo junta a importação
  // inteira numa releitura, como fazia o antigo debounce de 1,5 s por linha.
  diario:     { minimoMs: 5_000,  espalhamentoMs: 3_000 },
  // Configurações: mudam poucas vezes por dia. A comemoração é a festa na
  // tela de todo mundo — o sorteio é curto para ela começar quase junto.
  comemoracoes: { minimoMs: 0, espalhamentoMs: 1_000 },
  desafios:     { minimoMs: 0, espalhamentoMs: 3_000 },
  direto_extra: { minimoMs: 0, espalhamentoMs: 3_000 },
  comissao:     { minimoMs: 0, espalhamentoMs: 3_000 },
  // Pedido de autorização: há alguém esperando a resposta do outro lado.
  autorizacoes: { minimoMs: 0, espalhamentoMs: 500 },
  contribuicao: { minimoMs: 0, espalhamentoMs: 2_000 },
  numeros:      { minimoMs: 0, espalhamentoMs: 1_000 },
  ajustes:      { minimoMs: 0, espalhamentoMs: 1_000 },
};

export function topicoDoSinal(nome: NomeSinal, empresaId: string): string {
  return `${nome}:${empresaId}`;
}

/**
 * Prefixo das leituras guardadas em `cacheCurto` que este sinal derruba.
 *
 * O sinal chega e a guardada some NA HORA, antes do portão: quando o consumidor
 * relê, lê do banco. Sem isso, guardar por alguns segundos uma leitura que o
 * sinal manda reler entregaria o número de antes da importação (21/10/2026).
 */
export function prefixoCacheDoSinal(nome: NomeSinal, empresaId?: string): string {
  return `sinal:${nome}:${empresaId ? `${empresaId}|` : ''}`;
}

function normalizar(payload: Record<string, unknown>): SinalMudou {
  const por = payload.importado_por;
  return {
    tabela:        String(payload.tabela ?? ''),
    operacao:      (payload.operacao as SinalMudou['operacao']) ?? 'UPDATE',
    importado_por: Array.isArray(por) ? por.filter((x): x is string => typeof x === 'string') : [],
  };
}

/**
 * Vários sinais viram um. INSERT prevalece (é o que acende o «chegou coisa
 * nova» de quem ouve), depois DELETE — o junto só vira UPDATE se tudo foi
 * UPDATE, que é o que `minimoSoUpdateMs` pergunta. Os importadores se somam.
 */
function juntar(a: SinalMudou | null, b: SinalMudou): SinalMudou {
  if (!a) return b;
  const ops = [a.operacao, b.operacao];
  return {
    tabela:        b.tabela,
    operacao:      ops.includes('INSERT') ? 'INSERT' : ops.includes('DELETE') ? 'DELETE' : 'UPDATE',
    importado_por: [...new Set([...a.importado_por, ...b.importado_por])],
  };
}

function abaEscondida(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Ouve o sinal `mudou` de uma empresa. Dois consumidores do mesmo sinal dividem
 * um canal; cada um tem o próprio portão.
 *
 * @returns função de cancelamento para o cleanup do `useEffect`.
 */
export function assinarSinal(
  nome: NomeSinal,
  empresaId: string,
  ouvinte: OuvinteSinal,
  opcoes: OpcoesSinal = {},
): () => void {
  const regra = REGRAS_SINAL[nome];
  const assinadoEm = Date.now();

  let pendente:      SinalMudou | null = null;
  let reconectou     = false;
  let timer:         ReturnType<typeof setTimeout> | null = null;
  let timerEm        = Infinity;
  let ultimaEntrega  = -Infinity;
  let devendo        = false;

  /** Quanto falta para poder entregar o que está pendente. */
  function falta(): number {
    const agora = Date.now();
    const soUpdate = opcoes.minimoSoUpdateMs != null && !reconectou && pendente?.operacao === 'UPDATE';
    if (!soUpdate) return Math.max(0, regra.minimoMs - (agora - ultimaEntrega));
    const minimo = Math.max(regra.minimoMs, opcoes.minimoSoUpdateMs ?? 0);
    return Math.max(0, minimo - (agora - Math.max(ultimaEntrega, assinadoEm)));
  }

  function entregar(): void {
    timer = null;
    timerEm = Infinity;
    if (abaEscondida()) { devendo = true; return; }

    const sinal = pendente;
    const releitura = reconectou;
    pendente   = null;
    reconectou = false;
    if (!sinal && !releitura) return;
    ultimaEntrega = Date.now();

    // Reconexão já é releitura completa: o sinal junto dela seria uma segunda.
    if (releitura && ouvinte.onReconectado) { ouvinte.onReconectado(); return; }
    ouvinte.onMudou?.(sinal ?? { tabela: '', operacao: 'UPDATE', importado_por: [] });
  }

  function agendar(): void {
    if (abaEscondida()) { devendo = true; return; }
    const ate = Date.now() + falta();
    // A entrega já marcada sai a tempo (ou antes): ela leva este sinal junto.
    // Só remarca quem esperava pelo prazo longo do «só UPDATE» e agora não precisa.
    if (timer && timerEm <= ate + regra.espalhamentoMs) return;
    if (timer) clearTimeout(timer);
    timerEm = ate + Math.random() * regra.espalhamentoMs;
    timer = setTimeout(entregar, timerEm - Date.now());
  }

  function aoTrocarVisibilidade(): void {
    if (abaEscondida() || !devendo) return;
    devendo = false;
    agendar();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);
  }

  const cancelarCanal = assinarTabela(
    { topico: topicoDoSinal(nome, empresaId), escutas: [{ sinal: 'mudou' }] },
    {
      onSinal: (payload) => {
        invalidarCache(prefixoCacheDoSinal(nome, empresaId));
        pendente = juntar(pendente, normalizar(payload));
        agendar();
      },
      onReconectado: () => {
        invalidarCache(prefixoCacheDoSinal(nome, empresaId));
        reconectou = true;
        agendar();
      },
    },
  );

  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
    timerEm = Infinity;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
    }
    cancelarCanal();
  };
}

// ── Aviso com os ids (20261013170000) ────────────────────────────────────────
//
// Conversa e mural não toleram a fila do sinal: a mensagem nova tem de chegar
// agora. O banco manda, por comando e sem fila, SÓ quais registros mudaram —
// `{ tabela, operacao, ids, autores }`, nunca o conteúdo — e a tela relê o que
// é dela com a RLS de sempre. Mesmo desenho de `acordos` (20261009220000).
//
// Sem portão de aba escondida, de propósito: a notificação do sistema
// operacional é justamente para a janela que está atrás de outra.

/** Os tópicos de aviso com ids que o banco escreve. */
export type NomeAviso = 'solicitacoes' | 'tickets' | 'parabens';

export interface AvisoIds {
  tabela:     string;
  operacao:   'INSERT' | 'UPDATE' | 'DELETE';
  /** O pedido, o ticket, a comemoração — o registro que a tela relê. */
  ids:        string[];
  /** Autor da mensagem, quem leu, quem parabenizou. Vazio quando não há. */
  autores:    string[];
  /** Comando grande demais (acima de 200 ids): releia tudo. */
  recarregar: boolean;
}

export interface OuvinteAviso {
  onAviso?:       (aviso: AvisoIds) => void;
  /** O canal caiu e voltou: avisos do intervalo se perderam — releia. */
  onReconectado?: () => void;
}

const textos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function normalizarAviso(payload: Record<string, unknown>): AvisoIds {
  return {
    tabela:     String(payload.tabela ?? ''),
    operacao:   (payload.operacao as AvisoIds['operacao']) ?? 'UPDATE',
    ids:        textos(payload.ids),
    autores:    textos(payload.autores),
    recarregar: payload.recarregar === true,
  };
}

/**
 * O aviso diz respeito a este registro? «Recarregar» diz respeito a todos.
 */
export function avisoToca(aviso: AvisoIds, id: string | null | undefined): boolean {
  return aviso.recarregar || (!!id && aviso.ids.includes(id));
}

/**
 * Ouve o aviso com ids de uma empresa. Consumidores do mesmo tópico dividem um
 * canal.
 *
 * @returns função de cancelamento para o cleanup do `useEffect`.
 */
export function assinarAviso(nome: NomeAviso, empresaId: string, ouvinte: OuvinteAviso): () => void {
  return assinarTabela(
    { topico: `${nome}:${empresaId}`, escutas: [{ sinal: 'mudou' }] },
    {
      onSinal:       (payload) => ouvinte.onAviso?.(normalizarAviso(payload)),
      onReconectado: () => ouvinte.onReconectado?.(),
    },
  );
}
