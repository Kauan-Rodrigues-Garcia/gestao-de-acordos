/**
 * Os acordos de um operador para uma lista de códigos do Analítico — o que
 * `situacaoDasLinhas` precisa para dizer «falta marcar pago» e «falta
 * reagendar» (16/11/2026).
 *
 * Leitura comum, com a RLS de quem olha: o operador lê os próprios acordos, e
 * o líder, os do alcance dele. Acordo fora do alcance simplesmente não vem, e
 * a linha fica «em dia» — a tela não acusa pendência que não consegue ver.
 *
 * O código do relatório casa com o NR (Nosso produto) ou com a instituição
 * (Cofen). São duas consultas porque um `or` entre as duas colunas não usa os
 * índices `(nr_cliente)` e `(instituicao)`; na segunda só vale o acordo sem
 * NR — na regra Nosso produto a instituição é categoria, não chave.
 */
import { supabase } from '@/lib/supabase';
import type { AcordoDoOperador } from '@/pages/Analitico/Extrato/situacaoAcordos';

const COLUNAS =
  'id, nr_cliente, instituicao, status, tipo, parcelas, numero_parcela, acordo_grupo_id, vencimento, data_pagamento';

/** Códigos por consulta: cabe na URL do PostgREST com folga. */
const BLOCO = 150;

export async function buscarAcordosDoOperador(
  empresaId: string,
  operadorId: string,
  codigos: readonly string[],
): Promise<{ data: AcordoDoOperador[]; error: string | null }> {
  if (!empresaId || !operadorId || codigos.length === 0) return { data: [], error: null };

  const achados = new Map<string, AcordoDoOperador>();
  for (let i = 0; i < codigos.length; i += BLOCO) {
    const bloco = codigos.slice(i, i + BLOCO);
    const base = () => supabase
      .from('acordos')
      .select(COLUNAS)
      .eq('empresa_id', empresaId)
      .eq('operador_id', operadorId);

    const [porNr, porInstituicao] = await Promise.all([
      base().in('nr_cliente', bloco),
      base().in('instituicao', bloco),
    ]);
    const erro = porNr.error ?? porInstituicao.error;
    if (erro) return { data: [], error: erro.message };

    for (const a of (porNr.data ?? []) as AcordoDoOperador[]) achados.set(a.id, a);
    for (const a of (porInstituicao.data ?? []) as AcordoDoOperador[]) {
      if (!(a.nr_cliente ?? '').trim()) achados.set(a.id, a);
    }
  }
  return { data: [...achados.values()], error: null };
}
