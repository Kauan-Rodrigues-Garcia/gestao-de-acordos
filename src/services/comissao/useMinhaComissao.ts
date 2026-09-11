/**
 * useMinhaComissao — a comissão da própria pessoa, para o painel do menu lateral.
 *
 * ## De onde vem cada peça
 *
 *   • meta, metas extras e meta indireta: a linha de `metas` da pessoa no mês;
 *   • realizado: as próprias linhas do agregado do Dashboard
 *     (`useAnaliticoDashboard` + `agregarAnalitico`), já com o ajuste manual — a
 *     mesma base dos cards de meta e do card de comissão que existia lá;
 *   • indireta: `buscarRecebimentoIndireto`, só da pessoa;
 *   • configuração e confirmação do setor: `useConfigsComissao`, com tempo real —
 *     a confirmação do líder chega sem recarregar;
 *   • setor e equipe de origem: o perfil.
 *
 * ## Por que não o resumo por operador
 *
 * A aba Comissão e o RH leem `fn_analitico_resumo_por_operador`. Ela devolve
 * VAZIO, sem erro, para quem não tem `ver_analitico`, `analitico_sub_analitico`
 * e `analitico_sub_ranking` — e operador comum não tem o Ranking. Lendo dela, o
 * painel mostrava R$ 0,00 e «Nenhuma faixa ainda» para quem tinha comissão.
 *
 * Só busca com o painel aberto. O Desempenho do Dia já pagou caro por consultar
 * com a gaveta fechada, em toda página.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useAnaliticoDashboard, agregarAnalitico } from '@/hooks/useAnaliticoDashboard';
import { normalizarMes, partesDoMes } from '@/lib/mesReferencia';
import { useTenant } from '@/lib/tenant-config';
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

  // O mesmo cache do Dashboard: com ele aberto, o painel não busca de novo.
  const analitico = useAnaliticoDashboard(ativo, mes);
  const refetchAnalitico = analitico.refetch;
  const realizado = useMemo(
    () => (operadorId ? agregarAnalitico(analitico.linhas, { tipo: 'operador', operadorId }) : null),
    [analitico.linhas, operadorId],
  );

  const [pecas, setPecas] = useState<Pecas | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => {
    setVersao(v => v + 1);
    recarregarConfigs();
    void refetchAnalitico();
  }, [recarregarConfigs, refetchAnalitico]);

  useEffect(() => {
    if (!ativo || !empresaId || !operadorId) return;
    let vivo = true;
    setBuscando(true);

    void (async () => {
      try {
        const [metaRes, indiretos] = await Promise.all([
          // `*` e não a lista: as colunas da meta indireta chegaram numa
          // migration própria, e nomear coluna ausente derruba a consulta.
          supabase.from('metas')
            .select('*')
            .eq('empresa_id', empresaId).eq('tipo', 'operador')
            .eq('referencia_id', operadorId)
            .eq('mes', mesNum).eq('ano', ano)
            .maybeSingle(),
          buscarRecebimentoIndireto({ empresaId, mes, operadores: [operadorId] }),
        ]);
        if (!vivo) return;

        if (metaRes.error) console.warn('[comissao] meta do mês:', metaRes.error.message);
        setPecas({
          chave,
          erro: !!metaRes.error,
          meta: (metaRes.data as MetaLinhaBruta | null) ?? null,
          recebidoIndiretoBruto: indiretos[operadorId]?.bruto ?? 0,
        });
      } catch (e) {
        console.warn('[comissao] leitura do mês:', e);
        if (vivo) setPecas({ chave, erro: true, meta: null, recebidoIndiretoBruto: 0 });
      } finally {
        if (vivo) setBuscando(false);
      }
    })();

    return () => { vivo = false; };
  }, [ativo, empresaId, operadorId, mes, mesNum, ano, chave, versao]);

  const pecasDoMes = pecas && pecas.chave === chave ? pecas : null;
  // Sem o analítico no banco, o realizado seria zero — e zero parece resultado.
  const erro = !!pecasDoMes?.erro || !analitico.dbAtiva;

  const resultado = useMemo<ResultadoComissao | null>(() => {
    if (!ativo || !pecasDoMes || erro || !realizado || !analitico.carregado) return null;
    if (!configs.carregado || !configs.dbAtiva) return null;
    return calcularComissao(montarEntradaComissao({
      meta: pecasDoMes.meta,
      recebidoBruto: realizado.bruto,
      recebidoHO: realizado.ho,
      recebidoIndiretoBruto: pecasDoMes.recebidoIndiretoBruto,
      isPaguePlay,
      configs: configs.configs,
      setorOrigemId: setorId,
      equipeOrigemId: equipeId,
    }));
  }, [
    ativo, pecasDoMes, erro, realizado, analitico.carregado,
    configs.carregado, configs.dbAtiva, configs.configs, isPaguePlay, setorId, equipeId,
  ]);

  return {
    podeVer,
    carregando: ativo && (
      buscando || !analitico.carregado || !configs.carregado || (configs.dbAtiva && !pecasDoMes)
    ),
    dbAtiva: configs.dbAtiva,
    resultado,
    erro,
    isPaguePlay,
    recarregar,
  };
}
