/**
 * useAnalytics.ts — as métricas do Dashboard.
 *
 * Adicionado: `acordosMes: Acordo[]` no retorno para o AnalyticsPanel calcular % por tipo.
 *
 * ## O esqueleto que sumiu (2026-08-23)
 *
 * Este hook era a maior fonte do piscar do Dashboard. Cada evento de tempo real
 * de `acordos` chamava `fetchAll()`, que começava com `setLoading(true)` — e o
 * `AnalyticsPanel` troca o painel INTEIRO por seis cartões de esqueleto enquanto
 * `loading` for verdadeiro. Uma importação de 300 acordos fazia isso 300 vezes.
 *
 * Três mudanças desfizeram aquilo, e nenhuma delas mexe num número:
 *
 *   1. `loading` vale para a PRIMEIRA carga e para troca de recorte (mês,
 *      filtro, empresa) — o conteúdo em tela é resposta de outra pergunta.
 *      Tempo real e reconexão relêem em silêncio, sob `atualizando`.
 *   2. Os eventos passam por um agrupador: a rajada da importação vira uma
 *      releitura por segundo, e uma última no fim.
 *   3. A lista de acordos passa por `reconciliarLista`. Quando a releitura traz
 *      o mesmo conteúdo — que é o caso quase sempre — o array volta com a MESMA
 *      referência, o `useMemo` dos derivados nem recalcula e o painel não
 *      renderiza. Antes, cada releitura revarria 2.400 acordos para chegar aos
 *      mesmos números.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase, Acordo } from '@/lib/supabase';
import { reconciliarLista } from '@/lib/dadosVivos';
import { chaveDeCache, gravarInstantaneo, lerInstantaneo } from '@/lib/cacheInstantaneo';
import { criarAgrupador } from '@/lib/agrupador';
import { comecouAtualizacao } from '@/lib/estadoAtualizacao';
import { useRealtimeAcordos } from '@/providers/RealtimeAcordosProvider';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import type { NivelEscopo } from '@/lib/permissoes-escopo';
import { getTodayISO, PP_HO_PERCENTUAL } from '@/lib/index';
import {
  normalizarMes, partesDoMes, primeiroDiaDoMes, ultimoDiaDoMes, diasNoMes,
} from '@/lib/mesReferencia';
import { useTenant } from '@/lib/tenant-config';
/*
 * A composição sai da MESMA função que o Painel Líder usa.
 *
 * Até 03/09/2026 este hook resolvia sozinho quem estava em qual equipe e setor,
 * com seis consultas soltas a `perfis`, `equipes`, `setores` e
 * `equipe_operadores_clones` — todas ao vivo, nenhuma com filtro de mês. O
 * Painel Líder já fazia a mesma pergunta por `buscarEquipesComOperadores`, que
 * lê o retrato congelado quando o mês está fechado.
 *
 * Duas respostas para a mesma pergunta é o arranjo que produz divergência, e
 * produziu: filtrar agosto no Dashboard somava os acordos de agosto pelas
 * equipes de HOJE, enquanto o Painel Líder, ao lado, mostrava agosto pelas
 * equipes de agosto.
 *
 * O que NÃO foi unificado, de propósito: a MEDIDA. O Painel Líder soma
 * recebimento (`analitico_recebimentos`, `diario_recebimentos`); este hook soma
 * acordos fechados (tabela `acordos`). São perguntas diferentes, e juntá-las
 * mudaria o que o Dashboard responde. O que se compartilha é a composição.
 */
import {
  buscarEquipesComOperadores, buscarSetoresDoRetrato,
  operadoresDaEquipe as operadoresDaEquipeDe,
  type ComposicaoEquipes,
} from '@/services/analitico/analitico.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetaInfo {
  id?: string;
  tipo: 'setor' | 'equipe' | 'operador';
  referencia_id: string;
  meta_valor: number;
  meta_acordos: number;
  mes: number;
  ano: number;
}

export interface AnalyticsData {
  // Valores monetários
  valorRecebidoMes: number;
  valorAgendadoMes: number;
  valorNaoPago: number;
  valorAgendadoHoje: number;

  // "Agendado restante no mês" — acordos PENDENTES (status='verificar_pendente')
  // com vencimento no mês atual e ainda não resolvidos (exclui pago e não pago).
  // Usado apenas em PaguePlay/Bookplay.
  valorAgendadoRestanteMes: number;
  totalAgendadoRestanteMes: number;

  // H.O. — Honorários Operacionais PaguePlay (24,96% do bruto recebido)
  // Disponível para todos, mas só relevante para PaguePlay
  valorHOMes: number;        // H.O. do total recebido no mês
  valorHOAgendado: number;   // H.O. do total agendado no mês
  valorHONaoPago: number;    // H.O. do total não pago

  // Quantidades
  totalAcordosMes: number;
  totalAcordosHoje: number;
  totalPagosMes: number;
  totalNaoPagos: number;
  totalPendentes: number;

  // Meta
  meta: MetaInfo | null;
  percMeta: number;
  percMetaAcordos: number;

  // Por status (para gráfico)
  porStatus: { name: string; value: number; color: string; icon: string }[];

  // Por dia do mês (para gráfico de área)
  porDia: { dia: string; recebido: number; agendado: number; ho: number }[];

  // Por equipe (admin/líder)
  porEquipe?: { nome: string; acordos: number; valor: number; meta: number; perc: number }[];

  // Por operador (admin/líder)
  porOperador?: { id: string; nome: string; acordos: number; valor: number; meta: number; perc: number }[];

  // NOVO: acordos do mês atual (para calcular % por tipo no painel)
  acordosMes: Acordo[];

  // Setores disponíveis para filtro (admin)
  setores: { id: string; nome: string }[];
  setorFiltro: string | null;
  setSetorFiltro: (id: string | null) => void;

  // Filtro por equipe (Líder/Elite: visão de equipe específica)
  equipeFiltro: string | null;
  setEquipeFiltro: (id: string | null) => void;
  // Equipes do setor do lider/elite (carregadas dinamicamente)
  equipesDoSetor: { id: string; nome: string }[];

  // Filtro por operador (Elite em visão individual)
  operadorFiltro: string | null;
  setOperadorFiltro: (id: string | null) => void;

  /** Só a PRIMEIRA carga e a troca de recorte. Nunca uma releitura. */
  loading: boolean;
  /**
   * Releitura silenciosa em andamento (tempo real, reconexão, botão).
   *
   * É sinal discreto — o fio no topo da janela. Quem renderizar esqueleto a
   * partir daqui traz de volta exatamente o piscar que foi retirado.
   */
  atualizando: boolean;
  refetch: () => void;
}

/**
 * O que o instantâneo guarda — tudo que a busca escreve em estado.
 *
 * Guardar só `acordos` faria o painel reabrir com as metas vazias, ou seja,
 * mostrando "0% da meta" por um instante. Um número errado exibido com
 * confiança é pior que o esqueleto que este trabalho está tirando da tela.
 */
interface InstantaneoAnalytics {
  acordos: Acordo[];
  meta: MetaInfo | null;
  metasEquipe: MetaInfo[];
  metasOperador: MetaInfo[];
  operadoresMap: Record<string, string>;
  operadorEquipeMap: Record<string, string | null>;
  equipesMap: Record<string, string>;
  setores: { id: string; nome: string }[];
  equipesDoSetor: { id: string; nome: string }[];
}

function calcPerc(realizado: number, meta: number): number {
  if (!meta || meta <= 0) return 0;
  return Math.min(Math.round((realizado / meta) * 100), 999);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param mesRef mês a analisar (`yyyy-MM`). Omitido = mês corrente, que é como
 *   todos os consumidores antigos continuam se comportando.
 */
/** Ajustes de quem chama. */
export interface OpcoesAnalytics {
  /**
   * Recebe eventos de acordos e refaz as métricas sozinho. Padrão: `true`.
   *
   * O Painel Diretoria passa `false`: é uma tela de leitura, consultada com
   * calma, onde número mudando sob o olho de quem analisa atrapalha mais do
   * que ajuda. Lá os dados chegam ao abrir a página e pelo botão de
   * atualizar. O Dashboard continua em tempo real.
   */
  realtime?: boolean;
  /**
   * Os níveis de escopo da ABA que está chamando — obrigatório.
   *
   * Este hook serve duas telas com alcances diferentes: o Dashboard e o Painel
   * Diretoria. Até a fase 6a ele decidia sozinho, por cargo mais a chave global
   * `ver_todos_setores`, e as duas telas herdavam a mesma resposta — a última
   * pergunta de escopo do sistema que ainda valia para mais de uma aba.
   *
   * Obrigatório, e não opcional com padrão: um terceiro consumidor que
   * esquecesse de passar herdaria silenciosamente o alcance de outra tela, que
   * é exatamente o defeito que esta reestruturação existe para desfazer. Sem
   * valor padrão, o compilador cobra.
   */
  niveis: readonly NivelEscopo[];
  /**
   * O alcance de equipe cobre TODAS as equipes do setor?
   *
   * Só decide alguma coisa quando `equipe` é o teto da aba — quem alcança o
   * setor já alcança todas as equipes dele. Padrão `true`, que é o
   * comportamento de sempre; quem passa `false` é o Dashboard, lendo
   * `dashboard_escopo_equipe_todas`.
   */
  podeTodasEquipes?: boolean;
}

export function useAnalytics(
  mesRef: string | null | undefined,
  opcoes: OpcoesAnalytics,
): AnalyticsData {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { niveis, podeTodasEquipes = true } = opcoes;
  /*
   * `todos_setores` e `setor` são o que decidia, antes, `isAdmin ||
   * isDiretoria || (isLider && ver_todos_setores)` e o ramo de liderança.
   * A equivalência foi verificada cargo a cargo nas duas empresas na migration
   * da fase 6a — nenhuma linha muda de alcance.
   */
  const podeTodosSetores = niveis.includes('todos_setores');
  const podeSetor        = niveis.includes('setor');
  const podeEquipe       = niveis.includes('equipe');
  const tenant = useTenant();
  // `isPP` foi removido: a unica referencia que restava era uma dependencia
  // obsoleta do `useMemo` dos derivados — o corpo nao o consultava.
  const isBookplay = tenant.slug === 'bookplay';
  const { subscribe, unsubscribe } = useRealtimeAcordos();
  // ID estável por instância
  const instanceId = useRef(`useAnalytics-${Math.random().toString(36).slice(2, 10)}`).current;
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [setorFiltro, setSetorFiltro] = useState<string | null>(null);
  const [equipeFiltro, setEquipeFiltro] = useState<string | null>(null);
  const [operadorFiltro, setOperadorFiltro] = useState<string | null>(null);
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [equipesDoSetor, setEquipesDoSetor] = useState<{ id: string; nome: string }[]>([]);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [metasEquipe, setMetasEquipe] = useState<MetaInfo[]>([]);
  const [metasOperador, setMetasOperador] = useState<MetaInfo[]>([]);
  const [operadoresMap, setOperadoresMap] = useState<Record<string, string>>({});
  const [equipesMap, setEquipesMap] = useState<Record<string, string>>({});
  // BUG FIX Painel Diretoria / Performance por equipe:
  // A tabela `acordos` NÃO tem coluna `equipe_id` — a equipe é uma propriedade do
  // perfil (operador). Para agrupar corretamente por equipe, precisamos do mapa
  // operador_id → equipe_id. Sem isto, todos os acordos caíam em "Sem equipe".
  const [operadorEquipeMap, setOperadorEquipeMap] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  /**
   * Número de série da carga. Duas releituras sobrepostas terminam fora de
   * ordem, e a mais VELHA chegando por último gravaria dado vencido — o agrupador
   * torna isso raro, e este contador torna impossível.
   */
  const serieCarga = useRef(0);
  const mesAnalise  = normalizarMes(mesRef);
  const { mes, ano } = partesDoMes(mesAnalise);
  const inicio = primeiroDiaDoMes(mesAnalise);
  const fim = ultimoDiaDoMes(mesAnalise);
  const hoje = getTodayISO();

  /**
   * A identidade DESTE recorte.
   *
   * Precisa carregar tudo que muda o resultado — inclusive o cargo e os três
   * níveis de alcance, porque eles decidem quais ramos da busca rodam. Uma parte
   * esquecida não dá erro: dá o painel de outra pergunta pintado por 300 ms,
   * que é pior que um esqueleto.
   */
  const chaveCache = useMemo(() => chaveDeCache(
    'analytics', empresa?.id, perfil?.id, perfil?.perfil, perfil?.setor_id,
    mes, ano, setorFiltro, equipeFiltro, operadorFiltro,
    podeTodosSetores ? 'T' : '-', podeSetor ? 'S' : '-', podeEquipe ? 'E' : '-',
    podeTodasEquipes ? 'Q' : '-',
    isBookplay ? 'bp' : 'pp',
  ), [
    empresa?.id, perfil?.id, perfil?.perfil, perfil?.setor_id, mes, ano,
    setorFiltro, equipeFiltro, operadorFiltro,
    podeTodosSetores, podeSetor, podeEquipe, podeTodasEquipes, isBookplay,
  ]);

  /**
   * @param primeira Carga que MERECE esqueleto: a primeira da tela, ou a troca
   *   de recorte (mês, filtro, empresa). Tudo o mais é releitura silenciosa.
   */
  const carregarTudo = useCallback(async (primeira: boolean) => {
    if (!perfil || !empresa?.id) return;

    const meu = ++serieCarga.current;
    const vencida = () => meu !== serieCarga.current;

    if (primeira) setLoading(true);
    else          setAtualizando(true);

    // O fio de 2 px no topo. A primeira carga fica de fora: ela já tem o
    // esqueleto dela, e dois avisos para a mesma espera é um a mais.
    const encerrar = primeira ? null : comecouAtualizacao();

    /*
     * A hierarquia de metas, traduzida dos níveis da aba.
     *
     * Este bloco era a última ilha de cargo do arquivo: `isPerfilAdmin`,
     * `isPerfilLider` e `isPerfilDiretoria` decidindo QUAL meta é a principal,
     * enquanto todo o resto do hook já lia `podeTodosSetores`/`podeSetor`. As
     * duas autoridades discordavam no caso que interessa: ligar
     * `dashboard_escopo_setor` num operador ampliava a consulta de acordos e
     * deixava a meta dele individual — o painel mostrava o recebimento do setor
     * contra a meta de uma pessoa.
     *
     *   semMetaPrincipal ... quem vê todos os setores não tem UMA meta; tinha
     *                        `isAdmin`, e `dashboard_escopo_todos_setores` nasceu
     *                        com gerência e diretoria, além do acesso total
     *   veDeOutros ......... meta de setor/equipe em vez da individual; era
     *                        `isLider`
     */
    const semMetaPrincipal = podeTodosSetores;
    const veDeOutros       = podeSetor || podeEquipe;

    /*
     * O que vai para o instantâneo.
     *
     * Tudo junto, e não só os acordos: seedar a lista sem as metas faria o
     * painel abrir mostrando "0% da meta" por um instante antes de a meta
     * chegar — um número errado exibido com confiança, que é pior que o
     * esqueleto que estamos tirando.
     *
     * Os campos que este recorte não busca ficam no padrão de propósito: é
     * exatamente o que uma montagem nova produziria para o mesmo escopo.
     */
    const pacote: InstantaneoAnalytics = {
      acordos: [], meta: null, metasEquipe: [], metasOperador: [],
      operadoresMap: {}, operadorEquipeMap: {}, equipesMap: {},
      setores: [], equipesDoSetor: [],
    };

    try {
      /*
       * Quem estava em qual equipe e setor NO MÊS OLHADO — uma pergunta, uma
       * resposta, a mesma do Painel Líder. Ver o comentário do import.
       *
       * Mês fechado devolve o retrato congelado; mês corrente devolve o estado
       * de hoje, que é o que ele é. `doRetrato` diz de qual dos dois veio.
       */
      const composicao: ComposicaoEquipes =
        await buscarEquipesComOperadores(empresa.id, mesRef ?? null);
      const fontes = {
        operadorEquipeMap: composicao.operadorEquipeMap,
        equipesExtrasPorOperador: composicao.equipesExtrasPorOperador,
      };
      // Os RÓTULOS de setor daquele mês. `null` no mês corrente e nos meses sem
      // foto — aí valem os nomes de hoje, que é o comportamento antigo.
      const nomesSetorDoMes = composicao.doRetrato && mesRef
        ? await buscarSetoresDoRetrato(empresa.id, mesRef)
        : null;

      // ── Setores para o filtro ────────────────────────────────────────────────
      // Quem tem `todos_setores` NESTA aba escolhe o setor; quem não tem fica
      // travado no próprio e nem carrega a lista.
      if (podeTodosSetores) {
        const { data: setoresData } = await supabase
          .from('setores')
          .select('id, nome')
          .eq('empresa_id', empresa.id)
          .order('nome');
        const vivos = (setoresData as { id: string; nome: string }[]) ?? [];
        /*
         * Mês fechado: o rótulo é o daquele mês, e o setor APAGADO depois volta
         * para a lista.
         *
         * «Amauri Digital» virou «Marília Digital» em 01/09; sem esta correção
         * agosto aparece com um nome que não existiu no mês inteiro que está
         * sendo mostrado. E um setor extinto some do filtro levando junto os
         * acordos que ele produziu — que continuam na tabela, sem como chegar.
         */
        if (nomesSetorDoMes) {
          const porId = new Map(vivos.map(s => [s.id, s.nome]));
          for (const [id, nome] of Object.entries(nomesSetorDoMes)) porId.set(id, nome);
          pacote.setores = [...porId.entries()]
            .map(([id, nome]) => ({ id, nome }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        } else {
          pacote.setores = vivos;
        }
        setSetores(pacote.setores);
      }

      // ── Equipes do setor, para o Líder/Elite ────────────────────────────────
      // Sai da composição, e não de uma consulta própria: é a mesma lista que o
      // Painel Líder desenha, com os nomes do mês olhado e sem a equipe que
      // nasceu depois dele.
      let equipesDoSetorAtual: { id: string; nome: string }[] = [];
      // `!podeTodosSetores` reproduz o antigo `isLider` LINHA A LINHA: quem
      // enxerga a empresa (cupula) nao carregava esta lista, e continua nao
      // carregando — ela so serve a quem esta preso a um setor.
      if (podeSetor && !podeTodosSetores && perfil.setor_id) {
        equipesDoSetorAtual = composicao.equipes
          .filter(e => e.setor_id === perfil.setor_id)
          .map(e => ({ id: e.id, nome: e.nome }));
        pacote.equipesDoSetor = equipesDoSetorAtual;
        setEquipesDoSetor(equipesDoSetorAtual);
      }

      // ── Resolver operadores da equipe selecionada (se equipeFiltro ativo) ───
      // O campo equipe_id existe em perfis (não em acordos), então precisamos
      // buscar os operador_id dos membros da equipe e filtrar acordos por IN.
      let operadoresDaEquipe: string[] | null = null;
      // `!podeTodosSetores` porque so o ramo de setor consome esta lista: quem
      // enxerga a empresa recorta pelo filtro de SETOR. Sem isso, um admin que
      // escolhesse uma equipe dispararia uma consulta cujo resultado ninguem le.
      if (podeEquipe && !podeTodosSetores && equipeFiltro && !operadorFiltro) {
        /*
         * Da composição do MÊS, não de `perfis.equipe_id` de hoje.
         *
         * Era este `.eq('equipe_id', ...)` que reescrevia o passado: filtrar
         * agosto por uma equipe somava os acordos de quem está nela AGORA, e
         * não de quem estava nela em agosto. Quem mudou de equipe em setembro
         * levava a produção de agosto junto, e quem saiu sumia dela.
         *
         * `operadoresDaEquipeDe` inclui os CLONADOS na equipe, como o Painel
         * Líder — o clone produz para as duas, e ignorá-lo zerava o card de um
         * setor formado só por gente emprestada.
         */
        operadoresDaEquipe = [...operadoresDaEquipeDe(equipeFiltro, fontes)];
      }

      /*
       * Alcance de EQUIPE sem alcance de setor, e sem equipe escolhida.
       *
       * Este ramo não existia: a busca tinha `todos_setores`, `setor` e o
       * individual, e quem tivesse só `equipe` caía no individual. Ou seja,
       * ligar o alcance de equipe num cargo mudava o filtro da tela e não mudava
       * uma linha do que chegava — a queixa de sempre, «eu libero e não
       * acontece nada».
       *
       * O conjunto padrão são as MINHAS equipes (a do cadastro mais aquelas em
       * que fui clonado). Com `dashboard_escopo_equipe_todas` ligada, todas as
       * do meu setor. É a mesma conta que `fn_operador_no_meu_alcance_de_equipe`
       * faz no banco — aqui ela recorta a consulta, lá ela decide as linhas.
       */
      let operadoresDoAlcanceEquipe: string[] | null = null;
      if (podeEquipe && !podeSetor && !podeTodosSetores && !operadorFiltro && !equipeFiltro) {
        const minhaEquipe =
          (perfil as (typeof perfil & { equipe_id?: string | null }))?.equipe_id ?? null;

        let equipesAlvo: string[];
        if (podeTodasEquipes && perfil.setor_id) {
          equipesAlvo = composicao.equipes
            .filter(e => e.setor_id === perfil.setor_id)
            .map(e => e.id);
        } else {
          // A equipe do CADASTRO, e só ela — nem a que a pessoa foi clonada.
          // Clone é empréstimo para outro setor, e contar a equipe emprestada
          // devolveria o alcance que a chave desligada acabou de tirar.
          //
          // No mês fechado, a equipe do cadastro é a DAQUELE mês: quem mudou de
          // equipe depois continua vendo, em agosto, o que agosto era.
          equipesAlvo = (() => {
            const noMes = composicao.operadorEquipeMap[perfil.id]?.equipe_id ?? null;
            const alvo = noMes ?? minhaEquipe;
            return alvo ? [alvo] : [];
          })();
        }

        if (equipesAlvo.length === 0) {
          operadoresDoAlcanceEquipe = [];
        } else {
          const ids = new Set<string>();
          for (const eq of new Set(equipesAlvo)) {
            for (const id of operadoresDaEquipeDe(eq, fontes)) ids.add(id);
          }
          // Eu entro sempre: sem equipe cadastrada eu ainda vejo o meu.
          ids.add(perfil.id);
          operadoresDoAlcanceEquipe = [...ids];
        }
      }

      // BookPlay: operadores CLONADOS em equipes do setor do líder (setor de
      // origem diferente). A visão geral do setor precisa incluí-los, senão um
      // setor formado só por clones (ex.: Digital) fica com o dashboard zerado.
      let cloneIdsSetor: string[] = [];
      if (isBookplay && podeSetor && !podeTodosSetores && perfil.setor_id && !operadorFiltro && !equipeFiltro) {
        // Os clones DAQUELE mês: `equipes_clone` vem no retrato, então em
        // agosto conta quem estava emprestado em agosto — não quem está hoje.
        const eqIds = new Set(
          composicao.equipes.filter(e => e.setor_id === perfil.setor_id).map(e => e.id),
        );
        const ids = new Set<string>();
        for (const [operadorId, extras] of Object.entries(composicao.equipesExtrasPorOperador)) {
          if (extras.some(eq => eqIds.has(eq))) ids.add(operadorId);
        }
        cloneIdsSetor = [...ids];
      }

      // ── Acordos conforme perfil ──────────────────────────────────────────────
      // Reconstruída a cada página: o PostgREST corta em 1000 linhas por query,
      // então uma busca única truncava a visão do admin (empresa toda passa de
      // 1000 acordos/mês) e a série "agendado" do gráfico vinha incompleta.
      // Ordena por id para a paginação por range ser determinística.
      const montarQuery = () => {
        let q = supabase
          .from('acordos')
          .select('*')
          .eq('empresa_id', empresa.id)
          .order('id', { ascending: true });

        /*
         * A ordem dos ramos é a de antes, na letra — e o primeiro deles guarda
         * um defeito que NÃO foi corrigido aqui, de propósito.
         *
         * Quem tem `todos_setores` recorta só por `setorFiltro`: escolher "só
         * os meus" no filtro do Dashboard estreita a TABELA de acordos e não
         * estreita estes KPIs. Vale hoje para administrador, super_admin e
         * diretoria. Corrigir muda número na tela de quem já usa o painel, e o
         * contrato desta reestruturação é que nada muda — fica registrado para
         * ser decidido à parte.
         */
        if (podeTodosSetores) {
          if (setorFiltro) q = q.eq('setor_id', setorFiltro);
        } else if (podeSetor && perfil.setor_id) {
          // 1. visão individual → filtra pelo próprio operador_id
          // 2. visão de equipe  → filtra por operador_id IN (membros da equipe)
          // 3. visão geral      → filtra pelo setor_id
          if (operadorFiltro) {
            q = q.eq('operador_id', operadorFiltro);
          } else if (operadoresDaEquipe !== null) {
            if (operadoresDaEquipe.length === 0) {
              // Equipe sem membros — força retorno vazio.
              // operador_id é UUID: precisa de um UUID válido que nunca casa
              // (o UUID nulo), senão o Postgres rejeita com 22P02.
              q = q.eq('operador_id', '00000000-0000-0000-0000-000000000000');
            } else {
              q = q.in('operador_id', operadoresDaEquipe);
            }
          } else if (cloneIdsSetor.length) {
            // BookPlay: setor do líder + operadores clonados nele (setor de
            // origem diferente). A RLS já autoriza esses acordos ao líder.
            q = q.or(`setor_id.eq.${perfil.setor_id},operador_id.in.(${cloneIdsSetor.join(',')})`);
          } else {
            q = q.eq('setor_id', perfil.setor_id);
          }
        } else if (podeEquipe && operadoresDaEquipe !== null) {
          // Alcance de equipe, com uma equipe escolhida no filtro.
          q = operadoresDaEquipe.length === 0
            ? q.eq('operador_id', '00000000-0000-0000-0000-000000000000')
            : q.in('operador_id', operadoresDaEquipe);
        } else if (podeEquipe && operadorFiltro) {
          q = q.eq('operador_id', operadorFiltro);
        } else if (podeEquipe && operadoresDoAlcanceEquipe !== null) {
          // Alcance de equipe, sem escolha: as equipes que o painel me deu.
          q = operadoresDoAlcanceEquipe.length === 0
            ? q.eq('operador_id', perfil.id)
            : q.in('operador_id', operadoresDoAlcanceEquipe);
        } else {
          q = q.eq('operador_id', perfil.id);
        }
        return q;
      };

      const PAGE = 1000;
      let acordosData: Acordo[] = [];
      let offset = 0;
      while (true) {
        const { data: pagina, error: errPagina } =
          await montarQuery().range(offset, offset + PAGE - 1);
        if (errPagina) break;
        const batch = (pagina as Acordo[]) ?? [];
        acordosData = acordosData.concat(batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
      }
      if (vencida()) { encerrar?.(false); return; }

      /*
       * O ponto da reestruturação.
       *
       * `acordosData` é sempre um array novo, com objetos novos — e é ele que
       * alimenta o `useMemo` dos derivados. Sem reconciliar, toda releitura
       * revarria a empresa inteira e re-renderizaria o painel para chegar aos
       * mesmos números. Com ela, uma releitura sem novidade devolve o array
       * anterior por referência e nada acontece na tela.
       *
       * Comparação RASA porque a linha de `acordos` é `select('*')`: colunas
       * escalares, sem `join` e sem `jsonb`.
       */
      pacote.acordos = acordosData;
      setAcordos(atual => reconciliarLista(atual, acordosData, { chave: a => a.id }));

      // ── Meta: hierarquia dependente do filtro ativo ──────────────────────────
      // Prioridade:
      //   1. Filtro individual (operadorFiltro) → meta do operador
      //   2. Filtro de equipe (equipeFiltro)     → meta da equipe selecionada
      //   3. Padrão Líder/Elite                  → meta do setor
      //   4. Operador comum                      → meta do próprio operador
      //   5. Admin                               → sem meta principal
      let tipoMeta: 'setor' | 'equipe' | 'operador' | null = null;
      let refId: string | null = null;

      if (!semMetaPrincipal) {
        if (operadorFiltro) {
          tipoMeta = 'operador';
          refId    = operadorFiltro;
        } else if (equipeFiltro && veDeOutros) {
          tipoMeta = 'equipe';
          refId    = equipeFiltro;
        } else if (veDeOutros && podeTodosSetores && setorFiltro) {
          // Alcance de empresa com um setor filtrado → meta do setor filtrado
          tipoMeta = 'setor';
          refId    = setorFiltro;
        } else if (podeSetor && perfil.setor_id) {
          tipoMeta = 'setor';
          refId    = perfil.setor_id;
        } else if (podeEquipe) {
          /*
           * Alcance de equipe e nada além dela.
           *
           * Era `veDeOutros && perfil.setor_id → meta do setor`, e `veDeOutros`
           * inclui `equipe`. Ou seja: quem alcança só a equipe recebia o
           * realizado da EQUIPE contra a meta do SETOR — a mesma soma
           * desencontrada que produziu a divergência de agosto/2026, só que um
           * degrau abaixo. A referência certa é a equipe da pessoa; sem equipe
           * cadastrada não há meta principal, e o painel mostra o card sem %.
           */
          const minhaEquipe =
            (perfil as (typeof perfil & { equipe_id?: string | null }))?.equipe_id ?? null;
          if (minhaEquipe) {
            tipoMeta = 'equipe';
            refId    = minhaEquipe;
          }
        } else if (!veDeOutros) {
          tipoMeta = 'operador';
          refId    = perfil.id;
        }
      }

      if (tipoMeta && refId) {
        const { data: metaData } = await supabase
          .from('metas')
          .select('*')
          .eq('tipo', tipoMeta)
          .eq('referencia_id', refId)
          .eq('empresa_id', empresa.id)
          .eq('mes', mes)
          .eq('ano', ano)
          .maybeSingle();
        if (vencida()) { encerrar?.(false); return; }
        pacote.meta = (metaData as MetaInfo | null) ?? null;
        setMeta(pacote.meta);
      } else if (semMetaPrincipal) {
        setMeta(null);
      }

      // ── Metas por equipe / operador: quem enxerga alem de si ───────────────
      if (semMetaPrincipal || veDeOutros) {
        const [{ data: meq }, { data: mop }] = await Promise.all([
          supabase
            .from('metas')
            .select('*')
            .eq('tipo', 'equipe')
            .eq('empresa_id', empresa.id)
            .eq('mes', mes)
            .eq('ano', ano),
          supabase
            .from('metas')
            .select('*')
            .eq('tipo', 'operador')
            .eq('empresa_id', empresa.id)
            .eq('mes', mes)
            .eq('ano', ano),
        ]);
        pacote.metasEquipe   = (meq as MetaInfo[]) || [];
        pacote.metasOperador = (mop as MetaInfo[]) || [];
        setMetasEquipe(pacote.metasEquipe);
        setMetasOperador(pacote.metasOperador);

        /*
         * Mapas de nome e de equipe.
         *
         * O NOME da pessoa continua vindo de `perfis`: o retrato não o guarda, e
         * um nome não viaja no tempo como um vínculo viaja.
         *
         * A EQUIPE de cada operador, essa vem da composição do mês. É ela que
         * decide em qual card cada número cai, e era o segundo lugar onde
         * agosto era desenhado com as equipes de setembro — o primeiro é o
         * recorte da consulta, lá em cima.
         */
        const { data: ops } = await supabase
          .from('perfis')
          .select('id, nome')
          .eq('empresa_id', empresa.id)
          .in('perfil', ['operador', 'elite', 'gerencia']);
        if (vencida()) { encerrar?.(false); return; }

        const opMap: Record<string, string> = {};
        ((ops as { id: string; nome: string }[]) || []).forEach(o => { opMap[o.id] = o.nome; });

        const opEqMap: Record<string, string | null> = {};
        for (const [id, info] of Object.entries(composicao.operadorEquipeMap)) {
          opEqMap[id] = info.equipe_id ?? null;
        }
        pacote.operadoresMap     = opMap;
        pacote.operadorEquipeMap = opEqMap;
        setOperadoresMap(opMap);
        setOperadorEquipeMap(opEqMap);

        // Os nomes de equipe do mês olhado, inclusive os das equipes apagadas
        // depois — «Bryan» existiu agosto inteiro e sumiu em setembro.
        const eqMap: Record<string, string> = {};
        for (const e of composicao.equipes) eqMap[e.id] = e.nome;
        pacote.equipesMap = eqMap;
        setEquipesMap(eqMap);
      }

      // O instantâneo é o que faz a volta ao Dashboard não ter esqueleto.
      gravarInstantaneo(chaveCache, pacote);
      encerrar?.(true);
    } catch (err) {
      encerrar?.(false);
      console.error('[useAnalytics] erro:', err);
      // Numa releitura o dado antigo FICA na tela. Ele é velho, mas é verdade
      // de um minuto atrás — melhor que um painel zerado por falha de rede.
    } finally {
      if (!vencida()) {
        if (primeira) setLoading(false);
        setAtualizando(false);
      }
    }
  }, [perfil, empresa, mes, ano, setorFiltro, equipeFiltro, operadorFiltro,
      podeTodosSetores, podeSetor, podeEquipe, isBookplay, chaveCache]);

  /*
   * Recorte novo — outro mês, outro filtro, outra empresa.
   *
   * Se já houve resposta para ESTE recorte, a tela é pintada com ela AGORA e a
   * busca vira silenciosa: voltar ao Dashboard depois de passar pelos Acordos
   * deixa de custar um esqueleto de 400 ms para mostrar, no fim, os mesmos
   * números. Sem instantâneo é a primeira vez de verdade, e aí o esqueleto é a
   * resposta certa — o que está em tela responde a outra pergunta.
   */
  useEffect(() => {
    const semente = lerInstantaneo<InstantaneoAnalytics>(chaveCache);
    if (semente) {
      const p = semente.valor;
      setAcordos(atual => reconciliarLista(atual, p.acordos, { chave: a => a.id }));
      setMeta(p.meta);
      setMetasEquipe(p.metasEquipe);
      setMetasOperador(p.metasOperador);
      setOperadoresMap(p.operadoresMap);
      setOperadorEquipeMap(p.operadorEquipeMap);
      setEquipesMap(p.equipesMap);
      setSetores(p.setores);
      setEquipesDoSetor(p.equipesDoSetor);
      setLoading(false);
      void carregarTudo(false);
      return;
    }
    void carregarTudo(true);
  }, [carregarTudo, chaveCache]);

  /**
   * Releitura silenciosa, para o botão de atualizar e para o tempo real.
   *
   * Nunca recebe argumento: exposta como `refetch`, ela vira `onClick` em algum
   * lugar mais cedo ou mais tarde, e o `MouseEvent` no primeiro parâmetro faria
   * a tela inteira virar esqueleto num clique de "atualizar".
   */
  const releituraSilenciosa = useCallback(() => { void carregarTudo(false); }, [carregarTudo]);

  // ── Realtime: subscribe no canal central (sem canal próprio) ────────────────
  // Qualquer evento de acordos dispara um refetch completo das métricas analíticas.
  // Quem passa `realtime: false` fica de fora do registry: nem assina, nem paga
  // o refetch. Ver `OpcoesAnalytics`.
  const realtimeLigado = opcoes?.realtime !== false;
  useEffect(() => {
    if (!realtimeLigado) return;

    /*
     * Uma releitura por rajada, não uma por evento.
     *
     * A importação do Excel insere em lote: um evento por acordo. Sem o
     * agrupador, importar 300 acordos disparava 300 varreduras da empresa
     * inteira — a rede engasgava, as respostas voltavam fora de ordem e o
     * painel piscava 300 vezes para terminar onde uma única releitura no fim
     * teria chegado.
     *
     * O teto de 1,2 s mantém a sensação de tempo real: durante a importação o
     * painel se atualiza cerca de uma vez por segundo, e uma última quando ela
     * termina.
     */
    const grupo = criarAgrupador(releituraSilenciosa, { esperaMs: 300, tetoMs: 1_200 });
    subscribe(instanceId, () => grupo.avisar());
    return () => { grupo.cancelar(); unsubscribe(instanceId); };
  }, [realtimeLigado, subscribe, unsubscribe, instanceId, releituraSilenciosa]);

  // ── Derivados computados ─────────────────────────────────────────────────────
  const derived = useMemo(() => {
    /*
     * Visão ampla: exclui acordos Extra para não inflar totais.
     *
     * Escrito como `todos_setores || (setor && sem filtro individual)` e não
     * como `setor && sem filtro individual`: quem enxerga a empresa continua
     * em visão ampla MESMO com filtro individual, que é como se comportava
     * quando a condição era `isAdmin || isDiretoria || ...`. A forma curta
     * teria mudado os valores de admin e diretoria ao escolher "só os meus".
     */
    const isWideView = podeTodosSetores || (podeSetor && !operadorFiltro);

    const acordosMes = acordos.filter(
      a => a.vencimento >= inicio && a.vencimento <= fim,
    );
    const acordosHoje = acordosMes.filter(a => a.vencimento === hoje);

    // Para métricas de valor: exclui extras na visão ampla (evita dupla contagem).
    // Vale para PaguePlay e BookPlay (ambos usam vínculo direto/extra).
    const acordosMesMetricas = isWideView
      ? acordosMes.filter(a => a.tipo_vinculo !== 'extra')
      : acordosMes;

    const pagos       = acordosMesMetricas.filter(a => a.status === 'pago');
    const naoPagos    = acordosMesMetricas.filter(a => a.status === 'nao_pago');
    const pendentes   = acordosMesMetricas.filter(a => a.status === 'verificar_pendente');

    const valorRecebidoMes   = pagos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const valorAgendadoMes   = acordosMesMetricas.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const valorNaoPago       = naoPagos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const valorAgendadoHoje  = acordosHoje.reduce((s, a) => s + (Number(a.valor) || 0), 0);

    // ── "Agendado restante no mês" — pendentes (exclui pago e não pago) ────
    const valorAgendadoRestanteMes = pendentes.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const totalAgendadoRestanteMes = pendentes.length;

    // H.O. — Honorários Operacionais (24,96% do bruto)
    const valorHOMes      = valorRecebidoMes * PP_HO_PERCENTUAL;
    const valorHOAgendado = valorAgendadoMes * PP_HO_PERCENTUAL;
    const valorHONaoPago  = valorNaoPago * PP_HO_PERCENTUAL;

    /**
     * A meta é comparada com o BRUTO recebido — nos dois tenants.
     *
     * A versão anterior usava o H.O. na PaguePlay ("meta é baseada em H.O."),
     * mas `metas.meta_valor` guarda o campo **Meta R$** da aba Metas, que é o
     * total. O campo "Meta H.O. (24,96%)" ao lado é só um conversor de tela:
     * `MetasConfig` o recalcula a partir do total ao carregar e NUNCA o
     * persiste. Dividir o H.O. por uma meta em bruto devolvia ~1/4 do
     * percentual real — a PaguePlay via 20% onde tinha 80%.
     *
     * As outras telas já comparavam bruto com bruto: `percMetaAnalitico` no
     * AnalyticsPanel, `MetaProgressoHeader`, `DesempenhoEquipes` e as metas por
     * equipe/operador logo abaixo. Esta linha era a única fora do compasso.
     */
    const percMeta       = calcPerc(valorRecebidoMes, meta?.meta_valor ?? 0);
    const percMetaAcordos = calcPerc(pagos.length, meta?.meta_acordos ?? 0);

    // Por status
    const porStatus = [
      { name: 'Pago',     value: pagos.length,     color: '#22c55e', icon: 'check' },
      { name: 'Pendente', value: pendentes.length,  color: '#f59e0b', icon: 'clock' },
      { name: 'Não Pago', value: naoPagos.length,   color: '#ef4444', icon: 'x'    },
    ].filter(s => s.value > 0);

    // Por dia do mês
    const porDia = Array.from({ length: diasNoMes(mesAnalise) }, (_, i) => {
      const d = String(i + 1).padStart(2, '0');
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${d}`;
      const doDia = acordosMesMetricas.filter(a => a.vencimento === iso);
      const recDia = doDia.filter(a => a.status === 'pago').reduce((s, a) => s + (Number(a.valor) || 0), 0);
      return {
        dia: String(i + 1),
        recebido: recDia,
        agendado: doDia.reduce((s, a) => s + (Number(a.valor) || 0), 0),
        ho:       recDia * PP_HO_PERCENTUAL,
      };
    });

    // Por equipe
    // BUG FIX: a equipe é derivada do OPERADOR (perfis.equipe_id), pois a
    // tabela `acordos` não possui esse campo. O código anterior usava
    // `(a as any).equipe_id` e caía sempre no fallback 'sem_equipe' — todo
    // operador aparecia sem equipe (ex: Jose_Victor com equipe Luciana
    // saía listado como "Sem equipe").
    const porEquipe = Object.entries(
      acordosMesMetricas.reduce<Record<string, { acordos: number; valor: number }>>(
        (acc, a) => {
          const oid = a.operador_id ?? null;
          const eid = (oid && operadorEquipeMap[oid]) || 'sem_equipe';
          if (!acc[eid]) acc[eid] = { acordos: 0, valor: 0 };
          if (a.status === 'pago') { acc[eid].acordos++; acc[eid].valor += Number(a.valor) || 0; }
          return acc;
        }, {}
      )
    ).map(([eid, d]) => {
      const metaEq = metasEquipe.find(m => m.referencia_id === eid);
      return {
        nome: equipesMap[eid] ?? 'Sem equipe',
        acordos: d.acordos,
        valor: d.valor,
        meta: metaEq?.meta_valor ?? 0,
        perc: calcPerc(d.valor, metaEq?.meta_valor ?? 0),
      };
    }).sort((a, b) => b.valor - a.valor);

    // Por operador
    const porOperador = Object.entries(
      acordosMesMetricas.reduce<Record<string, { acordos: number; valor: number }>>(
        (acc, a) => {
          const oid = (a as any).operador_id ?? 'desconhecido';
          if (!acc[oid]) acc[oid] = { acordos: 0, valor: 0 };
          if (a.status === 'pago') { acc[oid].acordos++; acc[oid].valor += Number(a.valor) || 0; }
          return acc;
        }, {}
      )
    ).map(([oid, d]) => {
      const metaOp = metasOperador.find(m => m.referencia_id === oid);
      return {
        id: oid,
        nome: operadoresMap[oid] ?? 'Operador',
        acordos: d.acordos,
        valor: d.valor,
        meta: metaOp?.meta_valor ?? 0,
        perc: calcPerc(d.valor, metaOp?.meta_valor ?? 0),
      };
    }).sort((a, b) => b.valor - a.valor);

    return {
      valorRecebidoMes,
      valorAgendadoMes,
      valorNaoPago,
      valorAgendadoHoje,
      valorAgendadoRestanteMes,
      totalAgendadoRestanteMes,
      valorHOMes,
      valorHOAgendado,
      valorHONaoPago,
      totalAcordosMes: acordosMesMetricas.length,
      totalAcordosHoje: acordosHoje.length,
      totalPagosMes: pagos.length,
      totalNaoPagos: naoPagos.length,
      totalPendentes: pendentes.length,
      percMeta,
      percMetaAcordos,
      porStatus,
      porDia,
      porEquipe,
      porOperador,
      acordosMes, // NOVO: exportado para cálculo de tipo no painel
    };
  // `isPP` e `perfil.perfil` sairam daqui junto com os testes de cargo: quem
  // decide a visao ampla agora sao os niveis da aba.
  }, [acordos, meta, metasEquipe, metasOperador, operadoresMap, operadorEquipeMap, equipesMap, inicio, fim, hoje, mesAnalise, mes, ano, operadorFiltro, podeTodosSetores, podeSetor]);

  return {
    ...derived,
    meta,
    loading,
    atualizando,
    refetch: releituraSilenciosa,
    setores,
    setorFiltro,
    setSetorFiltro,
    equipeFiltro,
    setEquipeFiltro,
    equipesDoSetor,
    operadorFiltro,
    setOperadorFiltro,
  };
}