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
 * Ouve o sinal `mudou` de uma empresa. Dois consumidores do mesmo sinal dividem
 * um canal.
 *
 * @returns função de cancelamento para o cleanup do `useEffect`.
 */
export function assinarSinal(nome: NomeSinal, empresaId: string, ouvinte: OuvinteSinal): () => void {
  return assinarTabela(
    { topico: topicoDoSinal(nome, empresaId), escutas: [{ sinal: 'mudou' }] },
    {
      onSinal:       (payload) => ouvinte.onMudou?.(normalizar(payload)),
      onReconectado: ouvinte.onReconectado,
    },
  );
}
