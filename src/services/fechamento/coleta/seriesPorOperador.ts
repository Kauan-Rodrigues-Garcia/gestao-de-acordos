/**
 * seriesPorOperador.ts — recebimento por pessoa e por dia, numa leitura só.
 *
 * A página individual precisa da curva diária de cada operador. O caminho
 * ingênuo — uma consulta por pessoa — daria catorze idas ao banco num setor
 * médio e mais de cem no relatório da diretoria.
 *
 * Aqui é UMA leitura paginada do mês, agregada em memória por
 * `(operador_id, dia)` e por `(operador_id, forma)`. É a mesma tabela que
 * `diretoExtra.service` já varre; o agrupamento é local e barato.
 *
 * A RPC dedicada seria mais eficiente e está registrada no design como
 * evolução — exige migration, e este change se propôs a não ter nenhuma.
 */

import { supabase } from '@/lib/supabase';
import { primeiroDiaDoMes, diasNoMes } from '@/lib/mesReferencia';
import type { FatiaForma } from '../tipos';

const PAGINA = 1000;

export interface SerieOperador {
  /** Recebimento por dia do mês, índice 0 = dia 1. */
  porDia: number[];
  porForma: FatiaForma[];
  total: number;
}

interface LinhaSerie {
  operador_id: string | null;
  data_pagamento: string;
  valor_recebido: number | string | null;
  forma_pagamento: string | null;
  forma_detalhe: string | null;
}

/**
 * `operador_id` → série do mês.
 *
 * Operador sem linha nenhuma simplesmente não aparece no mapa; quem chama
 * trata a ausência como "sem movimento", que é diferente de "sem dado".
 */
export async function coletarSeriesPorOperador(params: {
  empresaId: string;
  mes: string;
  /** Recorte opcional — no nível operador evita varrer a empresa inteira. */
  operadorId?: string | null;
  setorId?: string | null;
}): Promise<Map<string, SerieOperador>> {
  const { empresaId, mes } = params;
  const saida = new Map<string, SerieOperador>();
  const totalDias = diasNoMes(mes);

  try {
    const linhas: LinhaSerie[] = [];
    let offset = 0;

    for (;;) {
      let q = supabase
        .from('analitico_recebimentos')
        .select('operador_id, data_pagamento, valor_recebido, forma_pagamento, forma_detalhe')
        .eq('empresa_id', empresaId)
        .eq('mes_referencia', primeiroDiaDoMes(mes))
        .order('id', { ascending: true });

      if (params.operadorId) q = q.eq('operador_id', params.operadorId);
      else if (params.setorId) q = q.eq('setor_id', params.setorId);

      const { data, error } = await q.range(offset, offset + PAGINA - 1);
      if (error) {
        console.warn('[seriesPorOperador] leitura falhou:', error.message);
        break;
      }
      const lote = (data as LinhaSerie[]) ?? [];
      linhas.push(...lote);
      if (lote.length < PAGINA) break;
      offset += PAGINA;
    }

    // Agregação local: um passe só sobre as linhas, alimentando dia e forma.
    const formasPorOperador = new Map<string, Map<string, { valor: number; qtd: number }>>();

    for (const l of linhas) {
      const id = l.operador_id;
      if (!id) continue;

      let serie = saida.get(id);
      if (!serie) {
        serie = { porDia: new Array<number>(totalDias).fill(0), porForma: [], total: 0 };
        saida.set(id, serie);
      }

      const valor = Number(l.valor_recebido) || 0;
      const dia = Number(String(l.data_pagamento).slice(8, 10));
      if (dia >= 1 && dia <= totalDias) serie.porDia[dia - 1] += valor;
      serie.total += valor;

      const rotulo = l.forma_detalhe
        ?? (l.forma_pagamento === 'cartao' ? 'Cartão' : 'Pix/Boleto');
      let formas = formasPorOperador.get(id);
      if (!formas) { formas = new Map(); formasPorOperador.set(id, formas); }
      const f = formas.get(rotulo) ?? { valor: 0, qtd: 0 };
      f.valor += valor;
      f.qtd += 1;
      formas.set(rotulo, f);
    }

    for (const [id, formas] of formasPorOperador) {
      const serie = saida.get(id);
      if (!serie) continue;
      serie.porForma = [...formas.entries()]
        .map(([rotulo, f]) => ({
          rotulo,
          bruto: f.valor,
          ho: 0,
          qtd: f.qtd,
          pct: serie.total > 0 ? Math.round((f.valor / serie.total) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.bruto - a.bruto);
    }

    return saida;
  } catch {
    return saida;
  }
}
