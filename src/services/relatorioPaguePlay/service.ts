import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { Modalidade, RelatorioLido, ResumoSalvo } from './modelo';

async function operar<T>(acao: string, dados: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpcSemTipo<T>('fn_pp_relatorio', { p_acao: acao, p_dados: dados });
  if (error) throw new Error(error.message);
  return data as T;
}

export const carregarResumo = (empresa: string, modalidade: Modalidade) =>
  operar<ResumoSalvo>('resumo', { empresa, modalidade });

export async function importarRelatorio(
  empresa: string, modalidade: Modalidade, arquivo: string, relatorio: RelatorioLido,
  inicio: string, fim: string, progresso: (n: number) => void,
) {
  const lote = await operar<string>('abrir', { empresa, modalidade, arquivo, inicio, fim,
    quantidade: relatorio.linhas.length, totais: relatorio.totais });
  try {
    for (let i = 0; i < relatorio.linhas.length; i += 1500) {
      await operar('adicionar', { lote, linhas: relatorio.linhas.slice(i, i + 1500) });
      progresso(Math.min(95, Math.round((i + 1500) / relatorio.linhas.length * 95)));
    }
    const resultado = await operar<{ inseridos: number; ignorados: number }>('concluir', { lote });
    progresso(100);
    return resultado;
  } catch (e) {
    // Se a confirmação chegou ao servidor mas sua resposta se perdeu, cancelar
    // não desfaz o lote concluído. A próxima leitura/reimportação é idempotente.
    await operar('cancelar', { lote }).catch((): void => undefined);
    throw e;
  }
}

export const excluirRelatorio = (empresa: string, modalidade: Modalidade, mes: string | null) =>
  operar<number>('excluir', { empresa, modalidade, mes });
