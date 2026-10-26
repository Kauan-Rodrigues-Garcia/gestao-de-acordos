/**
 * service.ts — chamadas de `fn_relatorio_945` (migration 20261026150000).
 *
 * Uma importação grava o Relatório de pagamento da diretoria e o recebimento
 * diário juntos; quem confere permissão, período, cobertura e totais é o banco.
 * Sem xlsx aqui: o arquivo é lido em worker (`relatorioPaguePlay/lerEmWorker`).
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { RelatorioLido } from '@/services/relatorioPaguePlay/modelo';
import type { Cobertura, Conferencia, ResultadoImportacao945 } from './modelo';

export type Origem945 = 'diario' | 'diretoria';

async function operar<T>(acao: string, dados: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpcSemTipo<T>('fn_relatorio_945', { p_acao: acao, p_dados: dados });
  if (error) throw new Error(error.message);
  return data as T;
}

export const carregarCobertura = (empresa: string) => operar<Cobertura>('cobertura', { empresa });

/** O que o banco já tem no período e o arquivo não trouxe. */
export const conferirArquivo = (empresa: string, inicio: string, fim: string, ids: string[]) =>
  operar<Conferencia>('conferir', { empresa, inicio, fim, ids });

/** Limpar dia/mês ou excluir histórico: esses dias voltam a exigir arquivo. */
export const invalidarCobertura = (empresa: string, inicio: string, fim: string) =>
  operar<number>('invalidar', { empresa, inicio, fim });

export interface OpcoesImportacao945 {
  empresa: string;
  origem: Origem945;
  arquivo: string;
  relatorio: RelatorioLido;
  inicio: string;
  fim: string;
  /** Login do arquivo → perfil. Ausente = ninguém vinculado. */
  operadores: Record<string, string | null>;
  /** Apagar do diário as linhas sem Id.Baixa no período (nunca são do 945). */
  removerSemId: boolean;
  /** Apagar das duas tabelas as baixas do período que o arquivo não trouxe. */
  removerAusentes: boolean;
  progresso?: (n: number) => void;
}

const BLOCO = 1500;

export async function importar945(o: OpcoesImportacao945): Promise<ResultadoImportacao945> {
  const { relatorio } = o;
  const lote = await operar<string>('abrir', {
    empresa: o.empresa, origem: o.origem, arquivo: o.arquivo, inicio: o.inicio, fim: o.fim,
    corte: relatorio.corte, quantidade: relatorio.linhas.length, totais: relatorio.totais,
    com_diario: relatorio.temOperador,
  });
  try {
    for (let i = 0; i < relatorio.linhas.length; i += BLOCO) {
      const linhas = relatorio.linhas.slice(i, i + BLOCO).map(p => {
        const d = relatorio.diario[p.id_baixa];
        return {
          // As 12 chaves do pagamento, nem uma a mais: o banco confere.
          p: {
            id_baixa: p.id_baixa, data: p.data, data_pagamento: p.data_pagamento, uf: p.uf, acordo: p.acordo,
            parcela: p.parcela, forma: p.forma, ia: p.ia, total: p.total, coren: p.coren, cofen: p.cofen, pp: p.pp,
          },
          d: d ? {
            operador_usuario: d.operador,
            operador_id: d.operador ? o.operadores[d.operador] ?? null : null,
            cliente_codigo: d.cliente_codigo || null,
            nome_cliente: d.profissional || null,
            acordo_codigo: p.acordo || null,
            forma: p.forma,
            prox_contato: d.prox_contato,
            tabulacao: d.tabulacao || null,
          } : null,
        };
      });
      await operar('adicionar', { lote, linhas });
      o.progresso?.(Math.min(95, Math.round((i + BLOCO) / relatorio.linhas.length * 95)));
    }
    const resultado = await operar<ResultadoImportacao945>('concluir', {
      lote, remover_sem_id: o.removerSemId, remover_ausentes: o.removerAusentes,
    });
    o.progresso?.(100);
    return resultado;
  } catch (e) {
    // Se a conclusão chegou ao banco e só a resposta se perdeu, cancelar não
    // desfaz nada: lote concluído não é apagado, e reimportar é idempotente.
    await operar('cancelar', { lote }).catch((): void => undefined);
    throw e;
  }
}
