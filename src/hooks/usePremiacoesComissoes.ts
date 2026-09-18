/**
 * usePremiacoesComissoes — as linhas de Fechamento › Premiações e Comissões.
 *
 * ## As fontes, uma por pergunta
 *
 *   quem entra .............. `perfis` de operador, elite e LÍDER — a planilha
 *                             que a aba substitui trazia a liderança do setor
 *   de que setor, no mês .... `buscarEquipesComOperadores` (retrato do mês
 *                             fechado, ao vivo no corrente) + `setoresDoOperador`,
 *                             o mesmo recorte da aba Fechamento
 *   quanto recebeu .......... `buscarResumoOperadoresAnalitico` — o número do Analítico
 *   meta, faixas, % ......... `metas` + `useConfigsComissao` + `calcularComissao`,
 *                             como o RH (`useComissaoRh`)
 *   cidade, tipo, crachá .... `fn_fechamento_premiacoes_dados` (tabelas do RH)
 *   situação no fechamento .. `fechamento_operadores` — só para a Obs.
 *
 * A configuração da comissão é a da ORIGEM da pessoa (setor e equipe dela no
 * mês), nunca a da equipe que a tomou emprestada como clone.
 *
 * Reimportar o Analítico ou lançar ajuste relê em silêncio, como no Fechamento.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ehMesAtual, partesDoMes } from '@/lib/mesReferencia';
import { useTenant } from '@/lib/tenant-config';
import { assinarTabela } from '@/lib/realtime';
import { assinarSinal } from '@/lib/sinais';
import { criarAgrupador } from '@/lib/agrupador';
import { comecouAtualizacao } from '@/lib/estadoAtualizacao';
import { invalidarSomasDeAjuste } from '@/services/analitico/ajusteManual.service';
import {
  buscarEquipesComOperadores, buscarResumoOperadoresAnalitico,
  mapaSetorDaEquipe, setoresDoOperador, type ComposicaoEquipes,
} from '@/services/analitico/analitico.service';
import {
  buscarRecebimentoIndireto, type MapaRecebimentoIndireto,
} from '@/services/metas/recebimentoIndireto.service';
import { lerMetaIndiretaDaLinha } from '@/services/metas/metaIndireta';
import { calcularComissao } from '@/services/comissao/comissao';
import { montarEntradaComissao, type MetaLinhaBruta } from '@/services/comissao/entradaDoOperador';
import { useConfigsComissao } from '@/services/comissao/useConfigsComissao';
import { buscarManuaisDoMes } from '@/services/fechamentoOperadores/fechamentoOperadores.service';
import type { SituacaoFechamento } from '@/services/fechamentoOperadores/situacoes';
import {
  buscarDadosPremiacoes, salvarCracha as salvarCrachaNoBanco,
} from '@/services/premiacoes/premiacoes.service';
import {
  montarLinhaPremiacao, ordenarLinhasPremiacao, resumirPremiacoes,
  type LinhaPremiacao, type ResumoPremiacoes, type VinculoSetor,
} from '@/services/premiacoes/calculoPremiacoes';

/** Quem aparece na planilha: quem produz recebimento e a liderança do setor. */
const PERFIS_DA_PLANILHA = ['operador', 'elite', 'lider'] as const;

interface PerfilPlanilha {
  id: string;
  nome: string;
  setor_id: string | null;
  equipe_id: string | null;
  arquivado?: boolean | null;
  desligado_em?: string | null;
}

interface Base {
  chave: string;
  perfis: PerfilPlanilha[];
  recebido: Map<string, number>;
  metas: Map<string, MetaLinhaBruta>;
  indiretos: MapaRecebimentoIndireto;
  composicao: ComposicaoEquipes;
  situacoes: Map<string, SituacaoFechamento>;
  vinculos: Map<string, VinculoSetor>;
  /** A RPC do RH existe neste banco? */
  disponivel: boolean;
  erro: string | null;
}

export interface PremiacoesComissoes {
  linhas: LinhaPremiacao[];
  resumo: ResumoPremiacoes;
  carregando: boolean;
  atualizando: boolean;
  erro: string | null;
  /** `false` = a migration 20260918150000 ainda não foi aplicada. */
  disponivel: boolean;
  /** `false` = a comissão por meta não existe neste banco. */
  comissaoAtiva: boolean;
  salvandoId: string | null;
  salvarCracha: (operadorId: string, cracha: string | null) => Promise<{ ok: boolean; erro: string | null }>;
  recarregar: () => Promise<void>;
}

export function usePremiacoesComissoes(params: {
  empresaId: string | null;
  /** 'yyyy-MM' */
  mes: string;
  /** Setor em foco. `null` = todos os setores do alcance. */
  setorId: string | null;
  /** id → nome de todos os setores da empresa. */
  nomesDosSetores: ReadonlyMap<string, string>;
  /** `false` congela: não busca nem assina. */
  ativo: boolean;
}): PremiacoesComissoes {
  const { empresaId, mes, setorId, nomesDosSetores, ativo } = params;
  const { ano, mes: mesNum } = partesDoMes(mes);
  const isPaguePlay = useTenant().isPaguePlay;

  const [base, setBase] = useState<Base | null>(null);
  const [crachas, setCrachas] = useState<Map<string, string>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const configs = useConfigsComissao({ empresaId, ano, mes: mesNum, ativo: ativo && !!empresaId });

  /** Só a releitura mais recente escreve. */
  const serie = useRef(0);
  const chaveNaTela = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    if (!ativo || !empresaId) return;
    const meu = ++serie.current;
    const chave = `${empresaId}:${mes}`;
    const primeira = chaveNaTela.current !== chave;
    if (primeira) setCarregando(true);
    else setAtualizando(true);
    const encerrar = primeira ? null : comecouAtualizacao();

    try {
      const [perfisResp, resumoResp, metasResp, composicao, manuais, dados] = await Promise.all([
        supabase.from('perfis')
          .select('id, nome, setor_id, equipe_id, arquivado, desligado_em')
          .eq('empresa_id', empresaId)
          .in('perfil', [...PERFIS_DA_PLANILHA])
          .or('ativo.eq.true,situacao.eq.desligado')
          .order('nome'),
        buscarResumoOperadoresAnalitico(empresaId, mes),
        // `*`: metas extras e meta indireta dependem de migration, e nomear
        // coluna ausente derruba a consulta inteira no PostgREST.
        supabase.from('metas').select('*')
          .eq('empresa_id', empresaId).eq('tipo', 'operador')
          .eq('mes', mesNum).eq('ano', ano),
        buscarEquipesComOperadores(empresaId, mes),
        buscarManuaisDoMes(empresaId, ano, mesNum),
        buscarDadosPremiacoes(empresaId, ano, mesNum),
      ]);
      if (meu !== serie.current) { encerrar?.(false); return; }
      if (perfisResp.error) throw new Error(perfisResp.error.message);

      const perfis = ((perfisResp.data as unknown as PerfilPlanilha[]) ?? [])
        .filter(p => p.arquivado !== true
          || (!!p.desligado_em && mes <= p.desligado_em.slice(0, 7)));

      const recebido = new Map<string, number>();
      for (const r of resumoResp.data) recebido.set(r.operador_id, Number(r.total_recebido) || 0);

      const metas = new Map<string, MetaLinhaBruta>();
      for (const m of (metasResp.data ?? []) as MetaLinhaBruta[]) {
        if (m.referencia_id) metas.set(m.referencia_id, m);
      }

      // O indireto só importa a quem tem meta indireta ligada.
      const comIndireta = [...metas.values()]
        .filter(m => lerMetaIndiretaDaLinha(m) !== null)
        .map(m => m.referencia_id!)
        .filter(id => perfis.some(p => p.id === id));
      const indiretos = comIndireta.length
        ? await buscarRecebimentoIndireto({ empresaId, mes, operadores: comIndireta })
        : {};
      if (meu !== serie.current) { encerrar?.(false); return; }

      const situacoes = new Map<string, SituacaoFechamento>();
      for (const [id, m] of manuais.porOperador) if (m.situacao) situacoes.set(id, m.situacao);

      setBase({
        chave,
        perfis,
        recebido,
        metas,
        indiretos,
        composicao,
        situacoes,
        vinculos: dados.vinculos,
        disponivel: dados.disponivel,
        erro: resumoResp.error ?? (metasResp.error?.message ?? null) ?? (dados.disponivel ? dados.erro : null),
      });
      setCrachas(dados.crachas);
      setErroCarga(null);
      chaveNaTela.current = chave;
      encerrar?.(true);
    } catch (e) {
      if (meu !== serie.current) { encerrar?.(false); return; }
      setErroCarga(e instanceof Error ? e.message : 'Não foi possível carregar as premiações.');
      encerrar?.(false);
    } finally {
      if (meu === serie.current) {
        setCarregando(false);
        setAtualizando(false);
      }
    }
  }, [ativo, empresaId, mes, mesNum, ano]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Reimportação do Analítico e ajuste manual: relê em silêncio, como o Fechamento.
  useEffect(() => {
    if (!ativo || !empresaId) return;
    const agrupador = criarAgrupador(() => { void carregar(); }, { esperaMs: 1_500, tetoMs: 6_000 });
    const reler = () => { void carregar(); };
    const cancelarAnalitico = assinarSinal('analitico', empresaId, {
      onMudou: agrupador.avisar, onReconectado: reler,
    });
    const cancelarAjustes = assinarTabela(
      { topico: `rt-ajustes-${empresaId}`, escutas: [{ tabela: 'analitico_ajustes_manuais' }] },
      {
        onEvento: () => { invalidarSomasDeAjuste(); agrupador.avisar(); },
        onReconectado: () => { invalidarSomasDeAjuste(); reler(); },
      },
    );
    return () => { agrupador.cancelar(); cancelarAnalitico(); cancelarAjustes(); };
  }, [ativo, empresaId, carregar]);

  const baseDoMes = base && base.chave === `${empresaId}:${mes}` ? base : null;
  const configsProntas = configs.carregado;
  const parcial = ehMesAtual(mes);

  const linhas = useMemo<LinhaPremiacao[]>(() => {
    if (!baseDoMes || !configsProntas) return [];
    const { composicao } = baseDoMes;
    const setorDaEquipe = mapaSetorDaEquipe(composicao.equipes);
    const nomeDaEquipe = new Map(composicao.equipes.map(e => [e.id, e.nome]));

    const montadas = baseDoMes.perfis
      .filter(p => {
        if (!setorId) return true;
        const setores = setoresDoOperador(
          p.id, composicao.operadorEquipeMap, composicao.equipesExtrasPorOperador, setorDaEquipe,
        );
        // Sem equipe no mês (a liderança, em geral), o setor do cadastro.
        if (setores.size === 0 && p.setor_id) setores.add(p.setor_id);
        return setores.has(setorId);
      })
      .map(p => {
        const info = composicao.operadorEquipeMap[p.id];
        const setorOrigem = info?.setor_id ?? p.setor_id;
        const equipeOrigem = info?.equipe_id ?? p.equipe_id;
        const recebido = baseDoMes.recebido.get(p.id) ?? 0;
        const vinculo = setorOrigem ? baseDoMes.vinculos.get(setorOrigem) ?? null : null;

        const resultado = configs.dbAtiva
          ? calcularComissao(montarEntradaComissao({
              meta: baseDoMes.metas.get(p.id) ?? null,
              recebidoBruto: recebido,
              recebidoHO: 0,
              recebidoIndiretoBruto: baseDoMes.indiretos[p.id]?.bruto ?? 0,
              isPaguePlay,
              configs: configs.configs,
              setorOrigemId: setorOrigem,
              equipeOrigemId: equipeOrigem,
              // A exceção por usuário vale; o bônus fica de fora, como no RH.
              operadorId: p.id,
            }))
          : null;

        return montarLinhaPremiacao({
          operadorId: p.id,
          nome: p.nome,
          equipeNome: info?.equipe_nome
            ?? (p.equipe_id ? nomeDaEquipe.get(p.equipe_id) ?? null : null),
          setorId: setorOrigem,
          setorNome: (setorOrigem && nomesDosSetores.get(setorOrigem)) || 'Sem setor',
          vinculo,
          cracha: crachas.get(p.id) ?? null,
          resultado,
          situacao: baseDoMes.situacoes.get(p.id) ?? null,
          parcial,
        });
      });
    return ordenarLinhasPremiacao(montadas);
  }, [baseDoMes, configsProntas, configs.dbAtiva, configs.configs, setorId, crachas,
      isPaguePlay, nomesDosSetores, parcial]);

  const resumo = useMemo(() => resumirPremiacoes(linhas), [linhas]);

  const salvarCracha = useCallback(async (operadorId: string, cracha: string | null) => {
    if (!empresaId) return { ok: false, erro: 'Empresa não carregada.' };
    const anterior = crachas.get(operadorId) ?? null;
    const aplicar = (valor: string | null) => setCrachas(m => {
      const n = new Map(m);
      if (valor) n.set(operadorId, valor); else n.delete(operadorId);
      return n;
    });

    // Otimista: a linha muda na hora. Recusou, volta.
    aplicar(cracha);
    setSalvandoId(operadorId);
    try {
      const r = await salvarCrachaNoBanco({ empresaId, operadorId, ano, mes: mesNum, cracha });
      if (!r.ok) aplicar(anterior);
      return r;
    } finally {
      setSalvandoId(atual => (atual === operadorId ? null : atual));
    }
  }, [empresaId, crachas, ano, mesNum]);

  return {
    linhas,
    resumo,
    carregando: carregando || (!!baseDoMes && !configsProntas),
    atualizando,
    erro: erroCarga ?? baseDoMes?.erro ?? null,
    disponivel: baseDoMes?.disponivel ?? true,
    comissaoAtiva: configs.dbAtiva,
    salvandoId,
    salvarCracha,
    recarregar: carregar,
  };
}
