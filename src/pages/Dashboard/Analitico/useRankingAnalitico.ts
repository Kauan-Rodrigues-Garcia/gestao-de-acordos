/**
 * useRankingAnalitico — junta tudo que o ranking configurável precisa saber.
 *
 * O ranking passou a depender de quatro coisas que moravam em lugares
 * diferentes: o recebimento (que a aba já tinha), a meta de cada pessoa, o
 * subgrupo de cada pessoa, e a regra que a gerência do setor escreveu. Este
 * hook é onde elas se encontram — o componente da aba recebe listas prontas.
 *
 * ## Por que a meta é lida aqui e não numa RPC
 *
 * A conta do percentual é `calcularProjecao`, a MESMA de Quartis e do Painel de
 * Metas, e ela vive em TypeScript. Uma RPC que ordenasse por percentual teria
 * que reescrever essa conta em SQL, e as duas divergiriam no primeiro feriado
 * que alguém cadastrasse — que é exatamente o defeito que já aconteceu entre o
 * total do setor e Desempenho Equipes.
 *
 * ## Tudo aqui tolera migration pendente
 *
 * Sem a tabela de subgrupos, todo mundo fica no grupo da própria equipe. Sem a
 * tabela de configuração, o critério é `recebimento` com todos dentro. Nos dois
 * casos o ranking desenha como sempre desenhou, e o botão de configurar
 * simplesmente não aparece.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { QuartilConfig } from '@/lib/supabase';
import { diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO } from '@/lib/diasUteis';
import { calcularProjecao } from '@/lib/projecaoMetas';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { getTodayISO } from '@/lib/index';
import type {
  ResumoOperadorAnalitico, EquipeAnalitico,
} from '@/services/analitico/analitico.service';
import {
  listarSubgrupos, type SubgrupoEquipe,
} from '@/services/equipes/equipesSubgrupos.service';
import {
  buscarRankingConfig, salvarRankingConfig,
  CONFIG_RANKING_PADRAO, type RankingConfig,
} from '@/services/analitico/rankingConfig.service';
import {
  filtrarParticipantes, ordenarLinhas, agregarGrupos,
  type LinhaRanking, type LinhaGrupoRanking,
} from './rankingCriterio';
import type { GrupoConfiguravel, PessoaConfiguravel } from './ConfigurarRankingDialog';

/** Uma pessoa do setor, com o que decide grupo e dias úteis. */
interface PerfilRanking {
  id: string;
  equipe_id: string | null;
  subgrupo_id: string | null;
}

interface Params {
  empresaId: string;
  /** 'yyyy-MM' */
  mes: string;
  setorId: string | null;
  /** Resumos JÁ filtrados pelo setor/equipe em foco da aba. */
  resumos: ResumoOperadorAnalitico[];
  /** Equipes do setor em foco. */
  equipes: EquipeAnalitico[];
  /** Quem está de férias/desligado e some do placar. */
  operadoresOcultos: Set<string>;
}

export interface RankingAnalitico {
  /** Participantes, já filtrados e ordenados pelo critério. */
  linhas: LinhaRanking[];
  /** Pódio de equipes/subgrupos — só usado quando o critério é `equipes`. */
  grupos: LinhaGrupoRanking[];
  config: RankingConfig;
  /** `false` = tabela de configuração ausente; a tela esconde o botão. */
  configDisponivel: boolean;
  carregando: boolean;
  salvando: boolean;
  /** Equipes e subgrupos elegíveis, para o diálogo de configuração. */
  gruposConfiguraveis: GrupoConfiguravel[];
  /** Pessoas do setor, para a exclusão nominal. */
  pessoasConfiguraveis: PessoaConfiguravel[];
  salvar: (nova: RankingConfig, autorId?: string | null) => Promise<boolean>;
}

export function useRankingAnalitico({
  empresaId, mes, setorId, resumos, equipes, operadoresOcultos,
}: Params): RankingAnalitico {
  const [subgrupos, setSubgrupos] = useState<SubgrupoEquipe[]>([]);
  const [perfis,    setPerfis]    = useState<PerfilRanking[]>([]);
  const [metas,     setMetas]     = useState<Record<string, number>>({});
  const [feriados,  setFeriados]  = useState<string[]>([]);
  const [quartis,   setQuartis]   = useState<QuartilConfig[]>(QUARTIS_PADRAO);
  const [contarHoje, setContarHoje] = useState(false);
  const [treinoMap, setTreinoMap] = useState<Record<string, string | null>>({});

  const [config, setConfig] = useState<RankingConfig>(CONFIG_RANKING_PADRAO);
  const [configDisponivel, setConfigDisponivel] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando,   setSalvando]   = useState(false);

  const [mesAnoStr, mesNumStr] = mes.split('-');
  const anoNum = Number(mesAnoStr);
  const mesNum = Number(mesNumStr);

  useEffect(() => {
    if (!empresaId) return;
    let cancelado = false;
    setCarregando(true);

    async function carregar() {
      /*
       * `subgrupo_id` é coluna nova. Nomear uma coluna que não existe derruba a
       * consulta INTEIRA no PostgREST — o setor todo ficaria sem grupo. Por
       * isso a leitura dos perfis é feita em duas tentativas: com a coluna e,
       * se ela recusar, sem.
       */
      const comSubgrupo = await supabase
        .from('perfis')
        .select('id, equipe_id, subgrupo_id')
        .eq('empresa_id', empresaId);

      const perfisLidos: PerfilRanking[] = comSubgrupo.error
        ? ((await supabase.from('perfis').select('id, equipe_id').eq('empresa_id', empresaId))
            .data as { id: string; equipe_id: string | null }[] ?? [])
            .map((p): PerfilRanking => ({ ...p, subgrupo_id: null }))
        : (comSubgrupo.data as PerfilRanking[] ?? []);

      const [sgs, cfgMetas, equipesTreino] = await Promise.all([
        listarSubgrupos(empresaId),
        getMetasConfig(empresaId, mesNum, anoNum),
        supabase.from('equipes').select('id, treinamento, treinamento_inicio')
          .eq('empresa_id', empresaId),
      ]);

      // `select('*')` pelo mesmo motivo de QuartisOperadores: colunas da meta
      // indireta só existem depois de uma migration aplicada à mão.
      const metasRows = await supabase.from('metas').select('*')
        .eq('empresa_id', empresaId).eq('tipo', 'operador')
        .eq('mes', mesNum).eq('ano', anoNum);

      if (cancelado) return;

      setPerfis(perfisLidos);
      setSubgrupos(sgs ?? []);

      const mapaMetas: Record<string, number> = {};
      for (const m of (metasRows.data as { referencia_id: string; meta_valor: number }[]) ?? []) {
        const v = Number(m.meta_valor) || 0;
        if (v > 0) mapaMetas[m.referencia_id] = v;
      }
      setMetas(mapaMetas);

      setFeriados(cfgMetas.data?.feriados ?? []);
      setQuartis(cfgMetas.data?.quartis ?? QUARTIS_PADRAO);
      setContarHoje(cfgMetas.data?.contar_dia_atual === true);

      const treinos: Record<string, string | null> = {};
      for (const e of (equipesTreino.data as
        { id: string; treinamento: boolean | null; treinamento_inicio: string | null }[]) ?? []) {
        if (e.treinamento) treinos[e.id] = e.treinamento_inicio ?? null;
      }
      setTreinoMap(treinos);
      setCarregando(false);
    }

    void carregar();
    return () => { cancelado = true; };
  }, [empresaId, mesNum, anoNum]);

  // A configuração é do SETOR, e muda quando o foco da tela muda de setor.
  useEffect(() => {
    if (!empresaId || !setorId) {
      setConfig(CONFIG_RANKING_PADRAO);
      setConfigDisponivel(false);
      return;
    }
    let cancelado = false;
    void buscarRankingConfig(empresaId, setorId).then(c => {
      if (cancelado) return;
      setConfig(c ?? CONFIG_RANKING_PADRAO);
      setConfigDisponivel(c !== null);
    });
    return () => { cancelado = true; };
  }, [empresaId, setorId]);

  const salvar = useCallback(async (nova: RankingConfig, autorId?: string | null) => {
    if (!empresaId || !setorId) return false;
    setSalvando(true);
    const { ok } = await salvarRankingConfig(empresaId, setorId, nova, autorId);
    if (ok) setConfig(nova);
    setSalvando(false);
    return ok;
  }, [empresaId, setorId]);

  const subgruposPorId = useMemo(() => {
    const m = new Map<string, SubgrupoEquipe>();
    for (const s of subgrupos) m.set(s.id, s);
    return m;
  }, [subgrupos]);

  const perfilPorId = useMemo(() => {
    const m = new Map<string, PerfilRanking>();
    for (const p of perfis) m.set(p.id, p);
    return m;
  }, [perfis]);

  const nomeDaEquipe = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of equipes) m.set(e.id, e.nome);
    return m;
  }, [equipes]);

  /**
   * Grupo de leitura de uma pessoa: o subgrupo dela, ou a equipe.
   *
   * Espelha `fn_analitico_destaques_dia_por_grupo` e `grupoDaPessoa` — inclusive
   * na condição de o subgrupo ser da mesma equipe, que é o que impede um
   * subgrupo órfão (equipe trocada antes do trigger existir) de criar um grupo
   * fantasma no pódio.
   */
  const grupoDe = useCallback((operadorId: string): { id: string | null; nome: string | null } => {
    const p = perfilPorId.get(operadorId);
    if (!p) return { id: null, nome: null };
    const sg = p.subgrupo_id ? subgruposPorId.get(p.subgrupo_id) : undefined;
    if (sg && sg.equipe_id === p.equipe_id) {
      const equipe = p.equipe_id ? nomeDaEquipe.get(p.equipe_id) : null;
      return { id: sg.id, nome: equipe ? `${equipe} · ${sg.nome}` : sg.nome };
    }
    if (!p.equipe_id) return { id: null, nome: null };
    return { id: p.equipe_id, nome: nomeDaEquipe.get(p.equipe_id) ?? null };
  }, [perfilPorId, subgruposPorId, nomeDaEquipe]);

  /** Dias úteis desta pessoa — reduzidos quando a equipe dela é de treinamento. */
  const diasDaPessoa = useCallback((operadorId: string) => {
    const totalUteis = diasUteisDoMes(anoNum, mesNum, feriados);
    const decorridos = Math.max(
      diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO(), undefined, contarHoje), 1,
    );
    const equipeId = perfilPorId.get(operadorId)?.equipe_id ?? null;
    const inicio   = equipeId ? treinoMap[equipeId] : null;
    if (!inicio) return { totalUteis, decorridos };
    return {
      totalUteis: diasUteisDoMes(anoNum, mesNum, feriados, inicio),
      decorridos: Math.max(
        diasUteisDecorridos(anoNum, mesNum, feriados, getTodayISO(), inicio, contarHoje), 1,
      ),
    };
  }, [anoNum, mesNum, feriados, contarHoje, perfilPorId, treinoMap]);

  /** Os resumos virados em linhas de ranking, com grupo e percentual. */
  const linhasBrutas = useMemo<LinhaRanking[]>(() => resumos
    .filter(r => !operadoresOcultos.has(r.operador_id))
    .map(r => {
      const grupo = grupoDe(r.operador_id);
      const { totalUteis, decorridos } = diasDaPessoa(r.operador_id);
      const proj = calcularProjecao({
        meta: metas[r.operador_id], recebido: r.total_recebido,
        totalUteis, decorridos, quartis, limitePct: 999,
      });
      return {
        ...r,
        grupoId:   grupo.id,
        grupoNome: grupo.nome,
        pct:       proj?.projecaoPct ?? null,
        esperado:  proj?.esperado ?? null,
      };
    }),
  [resumos, operadoresOcultos, grupoDe, diasDaPessoa, metas, quartis]);

  const linhas = useMemo(
    () => ordenarLinhas(filtrarParticipantes(linhasBrutas, config), config.criterio),
    [linhasBrutas, config],
  );

  const grupos = useMemo(
    () => agregarGrupos(linhas, config.criterio),
    [linhas, config.criterio],
  );

  /**
   * O que o diálogo oferece para marcar.
   *
   * A equipe só entra quando NÃO tem subgrupo: com subgrupos, ninguém é contado
   * na equipe direto, e oferecer as duas coisas faria a pessoa marcar a equipe
   * achando que marcou os subgrupos dela.
   */
  const gruposConfiguraveis = useMemo<GrupoConfiguravel[]>(() => {
    const lista: GrupoConfiguravel[] = [];
    for (const eq of equipes) {
      const filhos = subgrupos.filter(s => s.equipe_id === eq.id);
      if (filhos.length === 0) {
        lista.push({ id: eq.id, nome: eq.nome });
        continue;
      }
      for (const f of filhos) lista.push({ id: f.id, nome: f.nome, equipeNome: eq.nome });
    }
    return lista;
  }, [equipes, subgrupos]);

  const pessoasConfiguraveis = useMemo<PessoaConfiguravel[]>(() =>
    linhasBrutas
      .map(l => ({
        id:        l.operador_id,
        nome:      l.operador_nome ?? l.operador_usuario,
        grupoNome: l.grupoNome,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  [linhasBrutas]);

  return {
    linhas, grupos, config, configDisponivel, carregando, salvando,
    gruposConfiguraveis, pessoasConfiguraveis, salvar,
  };
}
