/**
 * useComissaoRh — a comissão por meta das linhas de comissão da competência.
 *
 * O RH Gestão paga o mês de APURAÇÃO. Para as linhas dos setores do tipo
 * Comissão, este hook calcula a comissão daquele mês com as mesmas peças da tela
 * de Metas: metas do operador, realizado do resumo do analítico, indireta e a
 * configuração do mês. A origem (setor e equipe) é a do snapshot do lançamento.
 *
 * ## Separado de `useRhGestao` de propósito
 *
 * A consulta de metas aqui pede `*` (metas extras e meta indireta), e uma falha
 * nela não pode levar junto o percentual, que a conclusão da equipe congela. Sem
 * as peças, a linha só fica sem sugestão.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizarMes, partesDoMes } from '@/lib/mesReferencia';
import { useTenant } from '@/lib/tenant-config';
import { buscarResumoOperadoresAnalitico } from '@/services/analitico/analitico.service';
import {
  buscarRecebimentoIndireto, type MapaRecebimentoIndireto,
} from '@/services/metas/recebimentoIndireto.service';
import { calcularComissao } from '@/services/comissao/comissao';
import { montarEntradaComissao, type MetaLinhaBruta } from '@/services/comissao/entradaDoOperador';
import { useConfigsComissao } from '@/services/comissao/useConfigsComissao';
import type { RhLancamento } from '@/services/rh/rhGestao.service';
import { sugestaoDaComissao, type SugestaoComissao } from '@/services/rh/rhComissao';

interface Pecas {
  chave: string;
  metas: Record<string, MetaLinhaBruta>;
  realizados: Record<string, { bruto: number; ho: number }>;
  indiretos: MapaRecebimentoIndireto;
}

const NENHUMA: Record<string, SugestaoComissao> = {};

/** `operador_id` → a comissão sugerida. Vazio sem linhas de comissão. */
export function useComissaoRh(params: {
  empresaId: string | null;
  /** `yyyy-MM` ou a data da coluna. `null` sem competência em foco. */
  mesApuracao: string | null;
  lancamentos: readonly RhLancamento[];
}): Record<string, SugestaoComissao> {
  const { empresaId, lancamentos } = params;
  const isPaguePlay = useTenant().isPaguePlay;

  const mesApuracao = params.mesApuracao ? normalizarMes(params.mesApuracao.slice(0, 7)) : null;
  const { ano, mes } = partesDoMes(mesApuracao);

  const deComissao = useMemo(
    () => lancamentos.filter(l => l.tipo_remuneracao_snapshot === 'comissao'),
    [lancamentos],
  );
  const operadores = useMemo(
    () => [...new Set(deComissao.map(l => l.operador_id))].sort().join(','),
    [deComissao],
  );

  const ativo = !!empresaId && !!mesApuracao && operadores !== '';
  const configs = useConfigsComissao({ empresaId, ano, mes, ativo });

  const chave = `${empresaId ?? ''}|${mesApuracao ?? ''}|${operadores}`;
  const [pecas, setPecas] = useState<Pecas | null>(null);

  useEffect(() => {
    if (!ativo || !empresaId || !mesApuracao) return;
    let vivo = true;

    void (async () => {
      try {
        const [metasRes, resumoRes, indiretos] = await Promise.all([
          // O mês inteiro da empresa, como o percentual: a lista de ids numa
          // URL de GET estoura com a folha de um setor grande.
          supabase.from('metas')
            .select('*')
            .eq('empresa_id', empresaId).eq('tipo', 'operador')
            .eq('mes', mes).eq('ano', ano),
          buscarResumoOperadoresAnalitico(empresaId, mesApuracao),
          buscarRecebimentoIndireto({ empresaId, mes: mesApuracao, operadores: operadores.split(',') }),
        ]);
        if (!vivo) return;

        // Sem meta ou sem realizado confiável, nada é sugerido: sugerir errado
        // na folha é pior que não sugerir.
        if (metasRes.error || resumoRes.error) {
          console.warn('[rh-comissao] peças indisponíveis:', metasRes.error?.message ?? resumoRes.error);
          setPecas(null);
          return;
        }

        const metas: Record<string, MetaLinhaBruta> = {};
        for (const m of (metasRes.data ?? []) as MetaLinhaBruta[]) {
          if (m.referencia_id) metas[m.referencia_id] = m;
        }
        const realizados: Record<string, { bruto: number; ho: number }> = {};
        for (const r of resumoRes.data) {
          realizados[r.operador_id] = { bruto: Number(r.total_recebido) || 0, ho: Number(r.total_ho) || 0 };
        }
        setPecas({ chave, metas, realizados, indiretos });
      } catch (e) {
        console.warn('[rh-comissao] peças indisponíveis:', e);
        if (vivo) setPecas(null);
      }
    })();

    return () => { vivo = false; };
  }, [ativo, empresaId, mesApuracao, ano, mes, operadores, chave]);

  return useMemo(() => {
    if (!ativo || !pecas || pecas.chave !== chave || !configs.carregado || !configs.dbAtiva) return NENHUMA;

    const saida: Record<string, SugestaoComissao> = {};
    for (const l of deComissao) {
      const realizado = pecas.realizados[l.operador_id];
      saida[l.operador_id] = sugestaoDaComissao(calcularComissao(montarEntradaComissao({
        meta: pecas.metas[l.operador_id] ?? null,
        recebidoBruto: realizado?.bruto ?? 0,
        recebidoHO: realizado?.ho ?? 0,
        recebidoIndiretoBruto: pecas.indiretos[l.operador_id]?.bruto ?? 0,
        isPaguePlay,
        configs: configs.configs,
        setorOrigemId: l.setor_id_snapshot ?? null,
        equipeOrigemId: l.equipe_id_snapshot ?? null,
      })));
    }
    return saida;
  }, [ativo, pecas, chave, configs.carregado, configs.dbAtiva, configs.configs, deComissao, isPaguePlay]);
}
