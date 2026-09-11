/**
 * useComissaoOperador — a comissão de uma pessoa, no Dashboard.
 *
 * ## De onde vem cada peça
 *
 *   • meta, metas extras, meta indireta e recebido: do `usePainelMetas`, a mesma
 *     base dos cards ao lado (`comissaoBase`);
 *   • configuração do mês e confirmação do setor: `useConfigsComissao`, com
 *     tempo real — a confirmação do líder chega sem recarregar;
 *   • setor e equipe de ORIGEM: do perfil da própria pessoa, ou de `perfis`
 *     quando a liderança filtra outro operador no Dashboard.
 *
 * ## Quem vê
 *
 * A própria comissão: `dashboard_comissao`. A de outra pessoa, filtrada no
 * Dashboard: `metas_comissao_ver`, a mesma chave da consulta na tela de Metas.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import type { BaseComissaoOperador } from '@/hooks/usePainelMetas';
import { normalizarMes, partesDoMes } from '@/lib/mesReferencia';
import { useTenant } from '@/lib/tenant-config';
import { calcularComissao, type ResultadoComissao } from './comissao';
import { montarEntradaComissao } from './entradaDoOperador';
import { useConfigsComissao } from './useConfigsComissao';

interface Origem {
  operadorId: string;
  nome: string;
  setorId: string | null;
  equipeId: string | null;
}

export interface ComissaoDoOperador {
  /** `null` enquanto carrega, sem permissão ou fora do modo individual. */
  resultado: ResultadoComissao | null;
  /** Nome para o título de «Ver comissão». */
  nome: string;
  podeVer: boolean;
  dbAtiva: boolean;
}

export function useComissaoOperador(params: {
  base: BaseComissaoOperador | null;
  /** `yyyy-MM`. */
  mes: string;
}): ComissaoDoOperador {
  const { base } = params;
  const mes = normalizarMes(params.mes);
  const { ano, mes: mesNum } = partesDoMes(mes);

  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const isPaguePlay = useTenant().isPaguePlay;

  const operadorId = base?.operadorId ?? null;
  const ehEuMesmo = !!operadorId && operadorId === perfil?.id;
  const podeVer = !!operadorId && (ehEuMesmo
    ? temPermissao('dashboard_comissao')
    : temPermissao('metas_comissao_ver'));

  const perfilSetorId = perfil?.setor_id ?? null;
  const perfilEquipeId = (perfil as { equipe_id?: string | null } | null)?.equipe_id ?? null;
  const perfilNome = perfil?.nome ?? '';

  const [origem, setOrigem] = useState<Origem | null>(null);
  useEffect(() => {
    if (!operadorId || !podeVer) return;
    if (ehEuMesmo) {
      setOrigem({ operadorId, nome: perfilNome, setorId: perfilSetorId, equipeId: perfilEquipeId });
      return;
    }
    let vivo = true;
    void supabase.from('perfis')
      .select('nome, setor_id, equipe_id')
      .eq('id', operadorId)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        const linha = data as { nome: string | null; setor_id: string | null; equipe_id: string | null } | null;
        setOrigem({
          operadorId,
          nome: linha?.nome ?? '',
          setorId: linha?.setor_id ?? null,
          equipeId: linha?.equipe_id ?? null,
        });
      });
    return () => { vivo = false; };
  }, [operadorId, podeVer, ehEuMesmo, perfilNome, perfilSetorId, perfilEquipeId]);

  const configs = useConfigsComissao({ empresaId: empresa?.id, ano, mes: mesNum, ativo: podeVer });

  const origemAtual = origem && origem.operadorId === operadorId ? origem : null;

  const resultado = useMemo<ResultadoComissao | null>(() => {
    if (!base || !podeVer || !origemAtual || !configs.carregado || !configs.dbAtiva) return null;
    return calcularComissao(montarEntradaComissao({
      meta: base.metaLinha,
      recebidoBruto: base.recebidoBruto,
      recebidoHO: base.recebidoHO,
      recebidoIndiretoBruto: base.recebidoIndiretoBruto,
      isPaguePlay,
      configs: configs.configs,
      setorOrigemId: origemAtual.setorId,
      equipeOrigemId: origemAtual.equipeId,
    }));
  }, [base, podeVer, origemAtual, configs.carregado, configs.dbAtiva, configs.configs, isPaguePlay]);

  return {
    resultado,
    nome: origemAtual?.nome || perfilNome,
    podeVer,
    dbAtiva: configs.dbAtiva,
  };
}
