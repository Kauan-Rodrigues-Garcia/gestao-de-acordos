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
 */
import { assinarTabela } from '@/lib/realtime';

/** Os tópicos que a migration 20260917110000 escreve. */
export type NomeSinal = 'analitico' | 'permissoes' | 'vendas' | 'rh';

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
};

export function topicoDoSinal(nome: NomeSinal, empresaId: string): string {
  return `${nome}:${empresaId}`;
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
 * nova» de quem ouve), e os importadores se somam.
 */
function juntar(a: SinalMudou | null, b: SinalMudou): SinalMudou {
  if (!a) return b;
  return {
    tabela:        b.tabela,
    operacao:      a.operacao === 'INSERT' || b.operacao === 'INSERT' ? 'INSERT' : b.operacao,
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
export function assinarSinal(nome: NomeSinal, empresaId: string, ouvinte: OuvinteSinal): () => void {
  const regra = REGRAS_SINAL[nome];

  let pendente:      SinalMudou | null = null;
  let reconectou     = false;
  let timer:         ReturnType<typeof setTimeout> | null = null;
  let ultimaEntrega  = -Infinity;
  let devendo        = false;

  function entregar(): void {
    timer = null;
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
    if (timer) return;
    if (abaEscondida()) { devendo = true; return; }
    const falta = Math.max(0, regra.minimoMs - (Date.now() - ultimaEntrega));
    timer = setTimeout(entregar, falta + Math.random() * regra.espalhamentoMs);
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
        pendente = juntar(pendente, normalizar(payload));
        agendar();
      },
      onReconectado: () => {
        reconectou = true;
        agendar();
      },
    },
  );

  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
    }
    cancelarCanal();
  };
}
