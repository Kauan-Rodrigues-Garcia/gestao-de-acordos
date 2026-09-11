/**
 * useMinhaComissao — a comissão da própria pessoa, para o painel do menu lateral.
 *
 * ## De onde vem cada peça
 *
 *   • meta, metas extras e meta indireta: a linha de `metas` da pessoa no mês;
 *   • realizado: `buscarResumoOperadoresAnalitico`, a MESMA fonte da aba Comissão
 *     da tela de Metas e do RH Gestão — as três telas contam o mesmo número;
 *   • indireta: `buscarRecebimentoIndireto`, só da pessoa;
 *   • configuração e confirmação do setor: `useConfigsComissao`, com tempo real —
 *     a confirmação do líder chega sem recarregar;
 *   • setor e equipe de origem: o perfil.
 *
 * Só busca com o painel aberto. O Desempenho do Dia já pagou caro por consultar
 * com a gaveta fechada, em toda página.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { normalizarMes, partesDoMes } from '@/lib/mesReferencia';
import { useTenant } from '@/lib/tenant-config';
import { buscarResumoOperadoresAnalitico } from '@/services/analitico/analitico.service';
import { buscarRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';
import { calcularComissao, type ResultadoComissao } from './comissao';
import { montarEntradaComissao, type MetaLinhaBruta } from './entradaDoOperador';
import { useConfigsComissao } from './useConfigsComissao';

export interface MinhaComissao {
  /** `dashboard_comissao`. */
  podeVer: boolean;
  carregando: boolean;
  /** `false` = a comissão ainda não existe neste banco. */
  dbAtiva: boolean;
  /** `null` enquanto carrega, sem permissão, sem banco ou com erro. */
  resultado: ResultadoComissao | null;
  /** A leitura do mês falhou — sem ela, R$ 0,00 pareceria resultado. */
  erro: boolean;
  isPaguePlay: boolean;
  recarregar: () => void;
}

interface Pecas {
  chave: string;
  erro: boolean;
  meta: MetaLinhaBruta | null;
  recebidoBruto: number;
  recebidoHO: number;
  recebidoIndiretoBruto: number;
}

export function useMinhaComissao(params: { aberto: boolean; mes: string }): MinhaComissao {
  const mes = normalizarMes(params.mes);
  const { ano, mes: mesNum } = partesDoMes(mes);

  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const isPaguePlay = useTenant().isPaguePlay;

  const podeVer = temPermissao('dashboard_comissao');
  const ativo = params.aberto && podeVer;
  const empresaId = empresa?.id ?? null;
  const operadorId = perfil?.id ?? null;
  const setorId = perfil?.setor_id ?? null;
  const equipeId = (perfil as { equipe_id?: string | null } | null)?.equipe_id ?? null;
  const chave = `${empresaId ?? ''}|${operadorId ?? ''}|${mes}`;

  const configs = useConfigsComissao({ empresaId, ano, mes: mesNum, ativo });
  const recarregarConfigs = configs.recarregar;

  const [pecas, setPecas] = useState<Pecas | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => {
    setVersao(v => v + 1);
    recarregarConfigs();
  }, [recarregarConfigs]);

  useEffect(() => {
    if (!ativo || !empresaId || !operadorId) return;
    let vivo = true;
    setBuscando(true);

    void (async () => {
      try {
        const [metaRes, resumoRes, indiretos] = await Promise.all([
          // `*` e não a lista: as colunas da meta indireta chegaram numa
          // migration própria, e nomear coluna ausente derruba a consulta.
          supabase.from('metas')
            .select('*')
            .eq('empresa_id', empresaId).eq('tipo', 'operador')
            .eq('referencia_id', operadorId)
            .eq('mes', mesNum).eq('ano', ano)
            .maybeSingle(),
          buscarResumoOperadoresAnalitico(empresaId, mes),
          buscarRecebimentoIndireto({ empresaId, mes, operadores: [operadorId] }),
        ]);
        if (!vivo) return;

        const erro = !!metaRes.error || !!resumoRes.error;
        if (erro) console.warn('[comissao] leitura do mês:', metaRes.error?.message ?? resumoRes.error);
        const minha = resumoRes.data.find(r => r.operador_id === operadorId);
        setPecas({
          chave,
          erro,
          meta: (metaRes.data as MetaLinhaBruta | null) ?? null,
          recebidoBruto: Number(minha?.total_recebido) || 0,
          recebidoHO: Number(minha?.total_ho) || 0,
          recebidoIndiretoBruto: indiretos[operadorId]?.bruto ?? 0,
        });
      } catch (e) {
        console.warn('[comissao] leitura do mês:', e);
        if (vivo) setPecas({ chave, erro: true, meta: null, recebidoBruto: 0, recebidoHO: 0, recebidoIndiretoBruto: 0 });
      } finally {
        if (vivo) setBuscando(false);
      }
    })();

    return () => { vivo = false; };
  }, [ativo, empresaId, operadorId, mes, mesNum, ano, chave, versao]);

  const pecasDoMes = pecas && pecas.chave === chave ? pecas : null;

  const resultado = useMemo<ResultadoComissao | null>(() => {
    if (!ativo || !pecasDoMes || pecasDoMes.erro || !configs.carregado || !configs.dbAtiva) return null;
    return calcularComissao(montarEntradaComissao({
      meta: pecasDoMes.meta,
      recebidoBruto: pecasDoMes.recebidoBruto,
      recebidoHO: pecasDoMes.recebidoHO,
      recebidoIndiretoBruto: pecasDoMes.recebidoIndiretoBruto,
      isPaguePlay,
      configs: configs.configs,
      setorOrigemId: setorId,
      equipeOrigemId: equipeId,
    }));
  }, [ativo, pecasDoMes, configs.carregado, configs.dbAtiva, configs.configs, isPaguePlay, setorId, equipeId]);

  return {
    podeVer,
    carregando: ativo && (buscando || !configs.carregado || (configs.dbAtiva && !pecasDoMes)),
    dbAtiva: configs.dbAtiva,
    resultado,
    erro: !!pecasDoMes?.erro,
    isPaguePlay,
    recarregar,
  };
}
