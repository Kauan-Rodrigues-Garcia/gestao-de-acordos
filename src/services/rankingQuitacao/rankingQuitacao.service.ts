/**
 * rankingQuitacao.service.ts — o banco do Ranking de quitação (migration
 * 20261006120000).
 *
 *   ranking_quitacao_setores  — em que setor a aba existe, e os prêmios. A tela
 *                               lê direto (policy de leitura por empresa).
 *   fn_ranking_quitacao       — os 6 do setor no mês, com foto e prêmio.
 *   fn_ranking_quitacao_importar      — grava a foto do mês (substitui).
 *   fn_ranking_quitacao_definir_setor — liga/desliga o setor e grava os prêmios.
 *
 * As tabelas e funções ainda não estão nos tipos gerados: daí `tabelaSemTipo`
 * e `rpcSemTipo`.
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import type { AcordoQuitado } from './relatorioQuitacao';

/** A premiação de outubro/2026, do 1º ao 6º lugar — o padrão de setor novo. */
export const PREMIOS_PADRAO = [350, 250, 180, 100, 70, 50] as const;

export interface SetorDoRanking {
  setor_id: string;
  ativo: boolean;
  premios: number[];
}

export interface PosicaoRanking {
  posicao: number;
  operador_id: string;
  nome: string;
  foto_url: string | null;
  quitacoes: number;
  valor: number;
}

export interface RankingQuitacao {
  habilitado: boolean;
  premios: number[];
  participantes: number;
  importado_em: string | null;
  posicoes: PosicaoRanking[];
  /**
   * Quem está olhando, quando quitou algo no mês, e quem está logo acima dele
   * (`acima` nulo para o 1º; nome só quando o vizinho está no top 10).
   */
  eu: {
    posicao: number; quitacoes: number; valor: number;
    acima: { posicao: number; valor: number; nome: string | null } | null;
  } | null;
}

type EuDoBanco = {
  posicao: number | string; quitacoes: number | string; valor: number | string;
  acima_posicao?: number | string | null; acima_valor?: number | string | null; acima_nome?: string | null;
};

export async function listarSetoresDoRanking(empresaId: string): Promise<SetorDoRanking[]> {
  const { data, error } = await tabelaSemTipo<{ setor_id: string; ativo: boolean; premios: (number | string)[] }>('ranking_quitacao_setores')
    .select('setor_id, ativo, premios')
    .eq('empresa_id', empresaId);
  if (error) throw new Error(error.message);
  // NUMERIC chega como texto do PostgREST em alguns casos.
  return (data ?? []).map(s => ({ setor_id: s.setor_id, ativo: s.ativo, premios: (s.premios ?? []).map(Number) }));
}

export async function definirSetorDoRanking(
  empresaId: string, setorId: string, ativo: boolean, premios?: number[],
): Promise<void> {
  const { error } = await rpcSemTipo('fn_ranking_quitacao_definir_setor', {
    p_empresa_id: empresaId, p_setor_id: setorId, p_ativo: ativo, p_premios: premios ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function buscarRanking(empresaId: string, setorId: string, mes: string): Promise<RankingQuitacao> {
  const { data, error } = await rpcSemTipo<Omit<Partial<RankingQuitacao>, 'eu'> & {
    posicoes?: (PosicaoRanking & { valor: number | string })[];
    eu?: EuDoBanco | null;
  }>(
    'fn_ranking_quitacao', { p_empresa_id: empresaId, p_setor_id: setorId, p_mes: mes },
  );
  if (error) throw new Error(error.message);
  return {
    habilitado: data?.habilitado === true,
    premios: (data?.premios ?? []).map(Number),
    participantes: Number(data?.participantes ?? 0),
    importado_em: data?.importado_em ?? null,
    posicoes: (data?.posicoes ?? []).map(p => ({ ...p, quitacoes: Number(p.quitacoes), valor: Number(p.valor) })),
    eu: data?.eu ? {
      posicao: Number(data.eu.posicao),
      quitacoes: Number(data.eu.quitacoes),
      valor: Number(data.eu.valor),
      // Antes da migration 20261006150000 o banco não manda o vizinho: fica nulo.
      acima: data.eu.acima_posicao != null && data.eu.acima_valor != null
        ? { posicao: Number(data.eu.acima_posicao), valor: Number(data.eu.acima_valor), nome: data.eu.acima_nome ?? null }
        : null,
    } : null,
  };
}

/** Grava os acordos quitados do mês (substitui a importação anterior). Devolve quantos entraram. */
export async function importarRanking(
  empresaId: string,
  mes: string,
  acordos: (AcordoQuitado & { operador_id: string | null })[],
): Promise<number> {
  const { data, error } = await rpcSemTipo<number>('fn_ranking_quitacao_importar', {
    p_empresa_id: empresaId, p_mes: mes, p_linhas: acordos,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
