/**
 * excluirSetor.service.ts — remover um setor, só quando ele está zerado.
 *
 * As duas RPCs da migration `20260916100000`:
 *
 *   fn_setor_impedimentos_exclusao .. o que impede — equipes, usuários
 *                                     (inclusive arquivados) e qualquer
 *                                     histórico que aponte para o setor
 *   fn_setor_excluir ................ apaga, se e somente se a lista acima
 *                                     vier vazia
 *
 * Não é um `DELETE` na tabela: 44 colunas apontam para `setores`, quase todas
 * com SET NULL ou CASCADE, e um DELETE solto soltaria acordo e recebimento do
 * setor sem erro nenhum. Ver o cabeçalho da migration.
 *
 * Discriminante em string, e não `ok: boolean`: o projeto roda com
 * `strict: false`, e sem ele a união não estreita (ver `fotoSetor.service`).
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

export interface ImpedimentoExclusao {
  motivo: string;
  /** Contado até 1000 — para impedir basta existir. Ver `rotuloDoImpedimento`. */
  quantidade: number;
}

export type ResultadoImpedimentos =
  | { status: 'ok'; impedimentos: ImpedimentoExclusao[] }
  | { status: 'falha'; mensagem: string };

export type ResultadoExclusao =
  | { status: 'ok' }
  | { status: 'falha'; mensagem: string };

const MIGRATION = '20260916100000_setor_excluir_so_quando_zerado.sql';

function traduzir(mensagem: string): string {
  if (/could not find the function|does not exist|schema cache/i.test(mensagem)) {
    return `A remoção de setores ainda não foi instalada neste banco (migration ${MIGRATION}).`;
  }
  return mensagem;
}

/** «3 equipes criadas», e «1.000+ acordos» quando a contagem bateu no teto. */
export function rotuloDoImpedimento(i: ImpedimentoExclusao): string {
  const n = i.quantidade >= 1000 ? '1.000+' : i.quantidade.toLocaleString('pt-BR');
  return `${n} ${i.motivo}`;
}

export async function buscarImpedimentosDeExclusao(setorId: string): Promise<ResultadoImpedimentos> {
  const { data, error } = await rpcSemTipo<{ motivo: string; quantidade: number | string }[]>(
    'fn_setor_impedimentos_exclusao', { p_setor_id: setorId },
  );
  if (error) return { status: 'falha', mensagem: traduzir(error.message) };
  return {
    status: 'ok',
    impedimentos: (data ?? []).map(l => ({ motivo: String(l.motivo), quantidade: Number(l.quantidade) || 0 })),
  };
}

export async function excluirSetor(setorId: string): Promise<ResultadoExclusao> {
  const { error } = await rpcSemTipo<null>('fn_setor_excluir', { p_setor_id: setorId });
  if (error) return { status: 'falha', mensagem: traduzir(error.message) };
  return { status: 'ok' };
}
