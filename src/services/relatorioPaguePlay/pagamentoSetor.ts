/**
 * pagamentoSetor.ts — o relatório 945 de pagamento do setor Cofen, dia a dia.
 *
 * Alimenta o Gráfico recebimento do Painel Líder quando o setor Cofen está
 * inteiro em tela: lê `pp_relatorio_pagamentos` pela coluna `data`, a mesma
 * tabela e a mesma coluna que o Painel Diretoria › Relatórios PaguePlay agrupa
 * (migration 20261119110000). Assim os dois mostram o mesmo número por dia.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';
import { centavosParaReais } from './conciliacaoSetor';

export interface PagamentoDoDia { data: string; bruto: number; ho: number; quantidade: number }
export interface PagamentoSetor { setorId: string; dias: PagamentoDoDia[] }

/**
 * null = a função não está no banco, o setor Cofen não é único ou quem olha
 * não alcança o setor — o gráfico continua no recebimento diário.
 */
export async function carregarPagamentoSetorPorDia(empresaId: string, mes: string): Promise<PagamentoSetor | null> {
  const { data, error } = await rpcSemTipo<{
    setor_id: string;
    dias: { data: string; total_centavos: string; ho_centavos: string; quantidade: number }[];
  }>('fn_pp_pagamento_setor_por_dia', { p_empresa_id: empresaId, p_mes: mes });
  if (error || !data) return null;
  return {
    setorId: data.setor_id,
    dias: data.dias.map(d => ({
      data: d.data,
      bruto: centavosParaReais(d.total_centavos),
      ho: centavosParaReais(d.ho_centavos),
      quantidade: d.quantidade,
    })),
  };
}

/** Uma linha por dia, carimbada no setor: é o formato que o gráfico soma. */
export function linhasDoPagamento(p: PagamentoSetor): LinhaRecebidaDia[] {
  return p.dias.map((d): LinhaRecebidaDia => ({
    operador_id: null,
    setor_id: p.setorId,
    importado_por_id: null,
    valor_recebido: d.bruto,
    data_pagamento: d.data,
  }));
}

/**
 * O gráfico pode ler o 945? Só com o setor inteiro (nenhuma equipe marcada) e
 * o recorte sendo o próprio setor Cofen ou «todos» — o 945 não diz o operador,
 * então não sabe recortar equipe nem outro setor.
 */
export function graficoPeloPagamento(
  p: PagamentoSetor | null, setoresEmFoco: readonly string[], equipesEmFoco: readonly string[],
): boolean {
  if (!p || equipesEmFoco.length > 0) return false;
  return setoresEmFoco.length === 0 || (setoresEmFoco.length === 1 && setoresEmFoco[0] === p.setorId);
}
