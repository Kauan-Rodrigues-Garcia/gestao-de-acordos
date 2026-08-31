/**
 * PainelLider.tsx — painel analítico da liderança (líder/elite/gerência/admin)
 *
 * Seletor de mês no topo (vale para todo o painel) e quatro abas: Desempenho
 * Equipes, Quartis, Gráfico de recebimento e Ajuste de recebimento. Um único
 * recorte de setor/equipe serve as quatro — trocar de aba não troca o recorte.
 *
 * A aba "Acompanhamento" foi REMOVIDA em 31/08/2026. Ela trazia todo acordo do
 * mês de todos os operadores no alcance para montar KPIs e uma lista ordenável,
 * e não era mais usada — as mesmas perguntas passaram a ser respondidas pelas
 * abas analíticas, que leem agregados. Com ela saiu a carga da tabela `acordos`
 * e o realtime que a mantinha viva. A lista de operadores continua sendo carregada:
 * o seletor do Ajuste de recebimento depende dela.
 *
 * Métricas são SEMPRE do mês selecionado (por vencimento), refletindo a
 * atribuição de recebimento por vencimento usada no resto do sistema.
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Users, Calendar, ChevronRight, ChevronLeft, RefreshCw, Loader2,
  TrendingUp, Radio, BarChart3, LineChart, SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, Perfil } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { PERFIS_QUE_CONTAM_NO_RECEBIMENTO } from '@/lib/index';
import { useTenant } from '@/lib/tenant-config';
import { cn } from '@/lib/utils';
import {
  buscarEquipesComOperadores, buscarResumoOperadoresAnalitico,
  buscarTotalOrfaosPorSetor, buscarTotalPorSetor,
  mapaSetorDaEquipe, operadoresDoSetor, operadoresDaEquipe,
  type EquipeAnalitico, type OperadorEquipeInfo, type ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { buscarExclusoesSetor } from '@/services/analitico/exclusoesSetor.service';
import type { OrigemKey } from '@/services/analitico/composicaoAcumulado';
import {
  escopoDeSetor, setorSomaPorUsuarios, ESCOPO_EMPRESA,
} from '@/services/analitico/escopoAnalitico';
import {
  buscarResumoMensalDiario, type ResumoMensalDiario,
} from '@/services/diario/diario.service';
import { DesempenhoEquipes } from '@/pages/Dashboard/Analitico/DesempenhoEquipes';
import { QuartisOperadores } from '@/pages/Dashboard/Analitico/QuartisOperadores';
import { GraficoRecebimento } from '@/pages/Dashboard/Analitico/GraficoRecebimento';
import AjusteRecebimento from '@/pages/Dashboard/Analitico/AjusteRecebimento';
import { FiltrosEscopo } from '@/pages/Dashboard/Analitico/FiltrosEscopo';
import { resolverEscopoPainel } from '@/pages/Dashboard/Analitico/escopoDoPainel';
import { escopoEfetivo, niveisLiberados } from '@/lib/permissoes-escopo';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';

// ─── Tipos ────────────────────────────────────────────────────────────────

interface MesRef { ano: number; mes: number }   // mes: 0-11



/** Abas do painel. A aba Acompanhamento saiu em 31/08/2026; as demais são
 *  as antigas abas do Analítico, agora alimentadas pelo recebimento diário. */
type AbaPainel = 'desempenho' | 'quartis' | 'grafico' | 'ajuste';

// ─── Helpers de período ─────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

function periodoDoMes(m: MesRef) {
  const inicio = `${m.ano}-${pad(m.mes + 1)}-01`;
  const ultimoDia = new Date(m.ano, m.mes + 1, 0).getDate();
  const fim = `${m.ano}-${pad(m.mes + 1)}-${pad(ultimoDia)}`;
  const d = new Date(m.ano, m.mes, 1);
  const nome = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return { inicio, fim, label: nome.charAt(0).toUpperCase() + nome.slice(1) };
}



// ─── Componente principal ─────────────────────────────────────────────────

export default function PainelLider() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  /*
   * Segunda ponta solta da fase 2: esta linha ainda lia a chave GLOBAL
   * `ver_todos_setores` para recortar a consulta do Acompanhamento, enquanto a
   * régua de filtros da mesma tela já usava `painel_lider_escopo_*`. Uma aba
   * com duas fontes de alcance é exatamente o que o §2 do pedido proíbe.
   *
   * A troca é comprovadamente inerte: nas duas empresas,
   * `painel_lider_escopo_todos_setores` e `ver_todos_setores` valem o mesmo em
   * todos os dezesseis cargos — a derivação da fase 2 saiu dessa chave.
   */
  const verTodosSetores = escopoEfetivo('painel_lider', temPermissao) === 'todos_setores';
  const tenant = useTenant();
  const isPP = tenant.isPaguePlay;
  // Item 4 (BookPlay): a coluna "Recebido" do painel passa a espelhar o valor do
  // relatório analítico (o mesmo que aparece na lista de operadores do Analítico),
  // não a soma dos acordos pagos tabulados.
  const isBookplay = tenant.slug === 'bookplay';
  // As abas Desempenho Equipes / Quartis / Gráfico moram no Painel Líder nos dois
  // tenants. Fonte: PaguePlay = analítico (Gráfico = diário); BookPlay = analítico.
  const mostrarAbasAnaliticas = isPP || isBookplay;

  /*
   * As quatro abas internas, cada uma com permissão própria.
   *
   * Nenhuma era escondida antes, então todas nasceram ligadas para quem tem o
   * Painel Líder — ninguém perdeu conteúdo nesta entrega. A partir daqui dá
   * para desligar uma sem mexer nas outras, que era o pedido.
   */
  const abasInternas = useMemo(() => ([
    { key: 'desempenho', label: 'Desempenho Equipes',  Icon: BarChart3,   permissao: 'painel_lider_sub_desempenho_equipes' },
    { key: 'quartis',    label: 'Quartis',             Icon: TrendingUp,  permissao: 'painel_lider_sub_quartis' },
    { key: 'grafico',    label: 'Gráfico recebimento', Icon: LineChart,   permissao: 'painel_lider_sub_grafico_recebimento' },
    // Correção TEMPORÁRIA do relatório do ERP. Fica por último de propósito:
    // é conserto, não rotina, e não devia disputar a atenção com as quatro
    // abas que a liderança abre todo dia.
    { key: 'ajuste',     label: 'Ajuste de recebimento', Icon: SlidersHorizontal, permissao: 'painel_lider_sub_ajuste_recebimento' },
  ] as const).filter(a => temPermissao(a.permissao)), [temPermissao]);

  /*
   * «Fico preso ao meu setor nesta aba?»
   *
   * O Painel Líder tem dois níveis e só dois: `setor` e `todos_setores`. Estar
   * preso ao próprio setor é ter o primeiro sem o segundo — e é a única coisa
   * que `isAdmin`/`isLiderOuSimilar` decidiam aqui.
   *
   * Eram `isPerfilAdmin(cargo) || cargo === 'diretoria'` e `isPerfilLider(cargo)
   * && !isAdmin`, ao lado de `verTodosSetores`, que já vinha do painel. Duas
   * autoridades no mesmo arquivo: dar `painel_lider_escopo_todos_setores` a um
   * líder ampliava metade da tela e a outra metade continuava travada no setor
   * dele.
   */
  const soMeuSetor = niveisLiberados('painel_lider', temPermissao).includes('setor')
    && !verTodosSetores;

  const [mesRef, setMesRef] = useState<MesRef>(() => {
    const d = new Date();
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });
  const periodo = useMemo(() => periodoDoMes(mesRef), [mesRef]);
  const ehMesAtual = useMemo(() => {
    const d = new Date();
    return mesRef.ano === d.getFullYear() && mesRef.mes === d.getMonth();
  }, [mesRef]);

  const [operadores, setOperadores] = useState<Perfil[]>([]);
  const [loading, setLoading]       = useState(true);
  const [erro, setErro]             = useState<string | null>(null);

  // ── Abas do painel (PP): Desempenho Equipes / Quartis / Gráfico ───────────
  // Alimentadas pelo relatório de RECEBIMENTO DIÁRIO (diario_recebimentos):
  // soma-se o mês inteiro (dia_referencia). Antes moravam no Analítico e
  // liam o relatório analítico — na PaguePlay a fonte agora é o diário.
  const [abaAtiva, setAbaAtiva] = useState<AbaPainel>('desempenho');
  // Abas já visitadas ficam MONTADAS (escondidas com CSS): trocar de aba não
  // remonta o componente nem refaz os fetches internos (metas, líderes, etc.)
  const [abasVisitadas, setAbasVisitadas] = useState<Set<AbaPainel>>(() => new Set(['desempenho']));
  const mudarAba = useCallback((k: AbaPainel) => {
    setAbaAtiva(k);
    setAbasVisitadas(prev => (prev.has(k) ? prev : new Set(prev).add(k)));
  }, []);

  /*
   * A aba que a tela realmente mostra.
   *
   * `abaAtiva` nasce numa aba fixa, e desligar a permissão dela pela régua
   * deixaria essa aba no ar como tela de entrada — permissão que esconde o
   * caminho e serve o destino não é permissão. Por isso o conteúdo pergunta
   * por `abaVisivel`, que cai na primeira aba LIBERADA.
   */
  const abaVisivel = abasInternas.some(a => a.key === abaAtiva)
    ? abaAtiva
    : (abasInternas[0]?.key ?? null);

  // Monitoramento de uso: a URL não muda ao trocar de aba aqui, então sem isto
  // "quais líderes abrem o Desempenho Equipes" ficaria sem resposta — as quatro
  // abas apareceriam somadas como um único `/lider`.
  // Aceita `null` — nenhuma aba liberada é um fato a registrar, e não uma aba
  // inventada que sujaria a contagem.
  useSubAbaUso(abaVisivel);
  const mesStr = `${mesRef.ano}-${pad(mesRef.mes + 1)}`;

  // ── Recorte das abas analíticas: setor + equipe, um só para as três ────────
  //
  // Antes cada aba resolvia sozinha, e as três discordavam: Quartis tinha
  // seletor próprio com lista de cargo escrita à mão (e a opção "Todos os
  // setores" voltava para um setor só), Desempenho e Gráfico não tinham nenhum, e
  // este arquivo passava `null` que os filhos completavam com `perfil.setor_id`.
  // Agora quem decide é `resolverEscopoPainel`, e o valor desce pronto.
  const [filtroSetorId, setFiltroSetorId]   = useState<string | null>(null);
  const [filtroEquipeId, setFiltroEquipeId] = useState<string | null>(null);
  const [setoresLista, setSetoresLista]     = useState<{ id: string; nome: string }[]>([]);

  // Trocar o setor descarta a equipe escolhida antes: ela pode ser de outro
  // setor, e o cruzamento devolveria lista vazia parecendo "não há ninguém".
  // `resolverEscopoPainel` já ignora a equipe órfã; limpar o estado evita que o
  // seletor continue exibindo um nome que não está mais valendo.
  const mudarFiltroSetor = useCallback((sid: string | null) => {
    setFiltroSetorId(sid);
    setFiltroEquipeId(null);
  }, []);

  const [equipesInfo, setEquipesInfo] = useState<{
    equipes: EquipeAnalitico[];
    operadorEquipeMap: Record<string, OperadorEquipeInfo>;
    equipesExtrasPorOperador: Record<string, string[]>;
  } | null>(null);

  const escopoAbas = useMemo(() => resolverEscopoPainel({
    cargo:           perfil?.perfil,
    temPermissao,
    setorDoPerfil:   perfil?.setor_id ?? null,
    setorEscolhido:  filtroSetorId,
    equipeEscolhida: filtroEquipeId,
    equipes:         equipesInfo?.equipes ?? [],
  }), [perfil?.perfil, perfil?.setor_id, temPermissao, filtroSetorId, filtroEquipeId, equipesInfo?.equipes]);

  /** Setor em foco. `null` = todos. É este valor que as três abas recebem. */
  const setorAbas = escopoAbas.setorId;

  /**
   * As pessoas que o seletor do Ajuste de recebimento oferece.
   *
   * Sai da MESMA lista de operadores que o Acompanhamento já carregou — a RLS
   * define quem cabe ali, e reaproveitá-la evita uma consulta a mais e evita
   * que a aba de ajuste enxergue alguém que o resto do painel não enxerga.
   *
   * Setor e equipe vêm do mapa de equipes quando ele já chegou, com o cadastro
   * do perfil como reserva: o ajuste carimba os dois na linha, e um carimbo
   * vazio tiraria o valor da soma do setor.
   */
  const operadoresParaAjuste = useMemo(
    () => operadores
      .map(o => ({
        id: o.id,
        nome: o.nome ?? o.email ?? 'Sem nome',
        setorId:  equipesInfo?.operadorEquipeMap[o.id]?.setor_id ?? o.setor_id ?? null,
        equipeId: equipesInfo?.operadorEquipeMap[o.id]?.equipe_id ?? null,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    [operadores, equipesInfo],
  );
  const nomeSetorTravado = useMemo(
    () => (escopoAbas.podeFiltrarSetor || !setorAbas
      ? null
      : setoresLista.find(s => s.id === setorAbas)?.nome ?? null),
    [escopoAbas.podeFiltrarSetor, setorAbas, setoresLista],
  );

  /**
   * O recorte em palavras, para o cabeçalho do gráfico.
   *
   * O gráfico buscava o nome do setor sozinho e dizia "Todos os setores" quando
   * não havia setor — o que passou a mentir com filtro só de equipe, caso de quem
   * enxerga a empresa toda.
   */
  const rotuloDoEscopo = useMemo(() => {
    const nomeSetor = setorAbas
      ? setoresLista.find(s => s.id === setorAbas)?.nome ?? null
      : null;
    const nomeEquipe = escopoAbas.equipeId
      ? escopoAbas.equipesDisponiveis.find(e => e.id === escopoAbas.equipeId)?.nome ?? null
      : null;
    const partes = [nomeSetor, nomeEquipe && `Equipe ${nomeEquipe}`].filter(Boolean);
    return partes.length ? partes.join(' · ') : null;
  }, [setorAbas, setoresLista, escopoAbas.equipeId, escopoAbas.equipesDisponiveis]);
  // Abas Desempenho Equipes / Quartis (e Gráfico na BookPlay) são alimentadas
  // pelo relatório ANALÍTICO nos dois tenants: resumos por operador + órfãos +
  // total do relatório por setor + setores alternativos. (PP: Gráfico = diário.)
  const [analiticoResumos, setAnaliticoResumos] = useState<ResumoOperadorAnalitico[]>([]);
  const [analiticoOrfaos,  setAnaliticoOrfaos]  = useState<Record<string, { total: number; qtd: number }>>({});
  const [analiticoTotalPorSetor, setAnaliticoTotalPorSetor] = useState<Record<string, { total: number; ho: number; qtd: number }>>({});
  const [analiticoSetoresAlt, setAnaliticoSetoresAlt] = useState<Set<string>>(new Set());
  // Origens fora do acumulado (migration 20260812e). Guardadas em estado porque
  // o GRÁFICO também precisa delas — ele mostra o mesmo dinheiro do card, por dia.
  const [analiticoExclusoes, setAnaliticoExclusoes] = useState<Record<string, Set<OrigemKey>>>({});
  const [loadingAnalitico, setLoadingAnalitico] = useState(false);
  const [resumoDiario, setResumoDiario]   = useState<ResumoMensalDiario | null>(null);
  const [loadingDiario, setLoadingDiario] = useState(false);
  // Incrementado pelo botão de recarregar do cabeçalho — força nova busca
  const [diarioReloadKey, setDiarioReloadKey] = useState(0);

  // A composição DEPENDE do mês, e recarrega ao trocá-lo.
  //
  // Antes carregava uma vez só, lendo as equipes de hoje: ao filtrar o mês
  // passado, o operador aparecia na equipe para a qual foi movido depois, e
  // quem entrou de férias esta semana sumia do ranking de um mês que trabalhou
  // inteiro. Agora mês fechado lê o retrato congelado (migration 20260803c).
  useEffect(() => {
    if (!mostrarAbasAnaliticas || !empresa?.id) return;
    let cancel = false;
    void buscarEquipesComOperadores(empresa.id, mesStr).then(eqs => {
      if (!cancel) setEquipesInfo(eqs);
    });
    return () => { cancel = true; };
  }, [mostrarAbasAnaliticas, empresa?.id, mesStr]);

  // Resumo mensal do diário: pré-carrega no mount (e ao trocar o mês) — quando
  // o usuário clica numa das abas, os dados já estão prontos. Antes a busca só
  // começava no clique e refazia tudo a cada visita.
  useEffect(() => {
    if (!isPP || !empresa?.id) return;
    let cancel = false;
    setLoadingDiario(true);
    void buscarResumoMensalDiario(empresa.id, mesStr).then(res => {
      if (cancel) return;
      setResumoDiario(res);
      setLoadingDiario(false);
    });
    return () => { cancel = true; };
  }, [isPP, empresa?.id, mesStr, diarioReloadKey]);

  // Resumos do analítico (Desempenho / Quartis / Gráfico-BookPlay / coluna
  // "Recebido" da BookPlay) + órfãos + total do relatório por setor + setores
  // alternativos. Roda nos dois tenants.
  useEffect(() => {
    if (!mostrarAbasAnaliticas || !empresa?.id) {
      setAnaliticoResumos([]); setAnaliticoOrfaos({});
      setAnaliticoTotalPorSetor({}); setAnaliticoSetoresAlt(new Set());
      return;
    }
    let cancel = false;
    setLoadingAnalitico(true);
    // As exclusões entram no `buscarTotalPorSetor`, senão este painel mostraria
    // o setor com as origens que a aba Analítico já tirou do acumulado.
    void buscarExclusoesSetor(empresa.id, mesStr).then(({ porSetor: exclusoes }) => {
      if (!cancel) setAnaliticoExclusoes(exclusoes);
      return Promise.all([
        buscarResumoOperadoresAnalitico(empresa.id, mesStr),
        buscarTotalOrfaosPorSetor(empresa.id, mesStr),
        buscarTotalPorSetor(empresa.id, mesStr, exclusoes),
        // `nome` entrou junto: o seletor de setor do cabeçalho precisa dele, e
        // uma segunda query para a mesma tabela no mesmo efeito seria desperdício.
        supabase.from('setores').select('id, nome, alternativo').eq('empresa_id', empresa.id),
      ]);
    }).then(([{ data }, orfaos, totSetor, setoresRes]) => {
      if (cancel) return;
      setAnaliticoResumos(data);
      setAnaliticoOrfaos(orfaos);
      setAnaliticoTotalPorSetor(totSetor);
      const alt = new Set<string>();
      const lista: { id: string; nome: string }[] = [];
      if (!setoresRes.error) {
        for (const s of (setoresRes.data as { id: string; nome: string; alternativo: boolean | null }[]) ?? []) {
          if (s.alternativo) alt.add(s.id);
          lista.push({ id: s.id, nome: s.nome });
        }
      }
      // Mesma ordem que o admin arrastou na aba Setores — o seletor e os grupos
      // de cards precisam concordar, senão o filtro lista numa ordem e a tela
      // renderiza em outra.
      setSetoresLista(aplicarOrdemSetores(lista, empresa.id));
      setAnaliticoSetoresAlt(alt);
      setLoadingAnalitico(false);
    });
    return () => { cancel = true; };
  }, [mostrarAbasAnaliticas, empresa?.id, mesStr, diarioReloadKey]);

  /**
   * A regra do gráfico é a MESMA do card Total recebido.
   *
   * O gráfico tinha regra própria — somava sempre por operador/clone, mesmo em
   * setor normal, que soma pelo carimbo do relatório. Em agosto/2026 isso dava
   * R$ 144.380,95 no card do Play 5 e R$ 142.447,74 no gráfico, sem nada na
   * tela explicando a diferença. Agora os dois passam por `linhaNoEscopo`, e a
   * origem desmarcada some dos dois juntos.
   */
  const escopoDoGrafico = useMemo(() => {
    if (!equipesInfo) return null;
    const fontes = {
      setoresAlternativos:      analiticoSetoresAlt,
      operadorEquipeMap:        equipesInfo.operadorEquipeMap,
      equipesExtrasPorOperador: equipesInfo.equipesExtrasPorOperador,
      setorDaEquipe:            mapaSetorDaEquipe(equipesInfo.equipes),
    };

    // Filtro de EQUIPE manda sobre o de setor: é o recorte mais estreito, e a
    // equipe já pertence a um setor. `linhaNoEscopo` no ramo 'equipe' deixa a
    // linha órfã de fora de propósito — ela tem setor, não tem equipe.
    if (escopoAbas.equipeId) {
      return {
        tipo: 'equipe' as const,
        operadores: operadoresDaEquipe(escopoAbas.equipeId, fontes),
      };
    }

    // Sem setor em foco o gráfico soma a empresa: é o mesmo total do relatório,
    // e `linhaNoEscopo` no ramo 'empresa' aceita tudo, inclusive as órfãs.
    // Antes esta função devolvia `null` aqui, e o gráfico caía numa regra
    // própria — a que divergia do card em R$ 1.933,21.
    if (!setorAbas) return ESCOPO_EMPRESA;

    return escopoDeSetor({
      setorId:     setorAbas,
      alternativo: setorSomaPorUsuarios({
        isPaguePlay: isPP,
        alternativo: analiticoSetoresAlt.has(setorAbas),
      }),
      operadores:  operadoresDoSetor(setorAbas, fontes),
      // As linhas do analítico sempre trazem o carimbo desde a 20260802a; na
      // PaguePlay ele nem é usado (cai no ramo alternativo acima).
      temCarimbo:  true,
      origensExcluidas: analiticoExclusoes[setorAbas],
      setorDoOperador:  id => equipesInfo.operadorEquipeMap[id]?.setor_id ?? null,
    });
  }, [setorAbas, escopoAbas.equipeId, equipesInfo, analiticoSetoresAlt, analiticoExclusoes, isPP]);

  // ── Carregar operadores (não depende do mês) ──────────────────────────────
  const carregarOperadores = useCallback(async (): Promise<Perfil[]> => {
    if (!perfil || !empresa?.id) return [];
    const escopoSetor = soMeuSetor && !!perfil.setor_id;

    // BookPlay: um setor pode ser formado SÓ por operadores CLONADOS (setor de
    // origem diferente). O filtro por setor_id os deixaria de fora e o painel
    // ficaria zerado. Inclui também os clonados em equipes do setor do líder.
    let cloneIds: string[] = [];
    if (escopoSetor && isBookplay) {
      const { data: eqs } = await supabase
        .from('equipes').select('id').eq('empresa_id', empresa.id).eq('setor_id', perfil.setor_id);
      const eqIds = ((eqs as { id: string }[]) ?? []).map(e => e.id);
      if (eqIds.length) {
        const { data: cl } = await supabase
          .from('equipe_operadores_clones').select('operador_id')
          .eq('empresa_id', empresa.id).in('equipe_id', eqIds);
        cloneIds = [...new Set(((cl as { operador_id: string }[]) ?? []).map(c => c.operador_id))];
      }
    }

    let q = supabase
      .from('perfis')
      .select('*, setores(id, nome)')
      .eq('empresa_id', empresa.id)
      // Mesma lista do Pix, dos quartis e do ranking — ver
      // `PERFIS_QUE_CONTAM_NO_RECEBIMENTO`.
      .in('perfil', [...PERFIS_QUE_CONTAM_NO_RECEBIMENTO])
      .eq('ativo', true);
    if (escopoSetor) {
      q = cloneIds.length
        ? q.or(`setor_id.eq.${perfil.setor_id},id.in.(${cloneIds.join(',')})`)
        : q.eq('setor_id', perfil.setor_id);
    }
    const { data, error } = await q.order('nome');
    if (error) throw new Error(`Operadores: ${error.message}`);
    return (data as Perfil[]) ?? [];
  }, [perfil?.id, perfil?.perfil, perfil?.setor_id, empresa?.id, isBookplay, soMeuSetor]);

  // ── Carregar acordos do mês para os operadores ────────────────────────────
  // ── Orquestra a carga (operadores) ────────────────────────────────────────
  const carregarTudo = useCallback(async () => {
    if (!perfil || !empresa?.id) return;
    setLoading(true);
    setErro(null);
    try {
      setOperadores(await carregarOperadores());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [perfil?.id, empresa?.id, carregarOperadores]);

  useEffect(() => { void carregarTudo(); }, [carregarTudo]);

  function irMes(delta: number) {
    setMesRef(m => {
      const d = new Date(m.ano, m.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  }

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!perfil || !empresa?.id) return null;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">

      {/* ── Cabeçalho + navegador de mês ─────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              Painel do Líder
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
                <Radio className="w-3 h-3" /> ao vivo
              </span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {operadores.length} operador{operadores.length !== 1 ? 'es' : ''} no alcance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-2 py-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => irMes(-1)} title="Mês anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="flex items-center gap-1.5 text-sm font-semibold min-w-[130px] justify-center">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            {periodo.label}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => irMes(1)} title="Próximo mês">
            <ChevronRight className="w-4 h-4" />
          </Button>
          {!ehMesAtual && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-primary"
              onClick={() => { const d = new Date(); setMesRef({ ano: d.getFullYear(), mes: d.getMonth() }); }}>
              Hoje
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => { void carregarTudo(); if (mostrarAbasAnaliticas) setDiarioReloadKey(k => k + 1); }}
            disabled={loading} title="Recarregar">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* ── Abas: acompanhamento × desempenho × quartis × gráfico ───────── */}
      {mostrarAbasAnaliticas && (
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {abasInternas.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => mudarAba(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
                abaVisivel === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      )}

      {/* Recorte de setor/equipe: um só, valendo para as três abas analíticas.
          Fica fora do conteúdo das abas de propósito — trocar de aba não deve
          trocar o recorte, que era o efeito de cada aba ter o seu. */}
      {mostrarAbasAnaliticas && (
        <FiltrosEscopo
          escopo={escopoAbas}
          setores={setoresLista}
          onSetor={mudarFiltroSetor}
          onEquipe={setFiltroEquipeId}
          nomeSetorTravado={nomeSetorTravado}
        />
      )}

      {erro && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center justify-between">
          <span>{erro}</span>
          <Button size="sm" variant="link" className="text-destructive h-auto p-0" onClick={() => void carregarTudo()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Abas do diário ficam montadas após a 1ª visita (hidden via CSS):
          trocar de aba é instantâneo — nada é refeito, só reexibido. */}

      {/* ── Aba: Desempenho Equipes (relatório analítico, os dois tenants) ── */}
      {/* PaguePlay: card do setor = soma dos operadores (setorSomaMembros).    */}
      {/* BookPlay: card do setor = total do relatório carimbado por setor_id.  */}
      {mostrarAbasAnaliticas && (abasVisitadas.has('desempenho') || abaVisivel === 'desempenho') && (
        <div className={cn(abaVisivel !== 'desempenho' && 'hidden')}>
          <DesempenhoEquipes
            empresaId={empresa.id}
            mes={mesStr}
            setorId={setorAbas}
            equipeId={escopoAbas.equipeId}
            equipes={equipesInfo?.equipes ?? []}
            resumos={analiticoResumos}
            operadorEquipeMap={equipesInfo?.operadorEquipeMap ?? {}}
            equipesExtrasPorOperador={equipesInfo?.equipesExtrasPorOperador ?? {}}
            orfaosPorSetor={analiticoOrfaos}
            totalPorSetor={isPP ? undefined : analiticoTotalPorSetor}
            setoresAlternativos={isPP ? undefined : analiticoSetoresAlt}
            setorSomaMembros={isPP}
            loading={loadingAnalitico}
            fonteLabel="relatório analítico"
          />
        </div>
      )}

      {/* ── Aba: Quartis (relatório analítico, os dois tenants) ───────────── */}
      {mostrarAbasAnaliticas && (abasVisitadas.has('quartis') || abaVisivel === 'quartis') && (
        <div className={cn(abaVisivel !== 'quartis' && 'hidden')}>
          <QuartisOperadores
            empresaId={empresa.id}
            mes={mesStr}
            setorId={setorAbas}
            equipeId={escopoAbas.equipeId}
            equipes={equipesInfo?.equipes ?? []}
            resumos={analiticoResumos}
            operadorEquipeMap={equipesInfo?.operadorEquipeMap ?? {}}
            equipesExtrasPorOperador={equipesInfo?.equipesExtrasPorOperador ?? {}}
            loading={loadingAnalitico}
          />
        </div>
      )}

      {/* ── Aba: Gráfico recebimento ──────────────────────────────────────── */}
      {/* PaguePlay: recebimento diário (linhasExternas). BookPlay: analítico    */}
      {/* (o componente busca por dia internamente, sem linhasExternas).         */}
      {mostrarAbasAnaliticas && (abasVisitadas.has('grafico') || abaVisivel === 'grafico') && (
        <div className={cn(abaVisivel !== 'grafico' && 'hidden')}>
          {isPP && loadingDiario ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando recebimentos do mês…
            </div>
          ) : (
            <GraficoRecebimento
              empresaId={empresa.id}
              mes={mesStr}
              setorId={setorAbas}
              equipes={equipesInfo?.equipes ?? []}
              operadorEquipeMap={equipesInfo?.operadorEquipeMap ?? {}}
              equipesExtrasPorOperador={equipesInfo?.equipesExtrasPorOperador ?? {}}
              linhasExternas={isPP ? (resumoDiario?.linhasDia ?? []) : undefined}
              fonteLabel={isPP ? 'relatório de recebimento diário' : 'relatório analítico'}
              escopo={escopoDoGrafico}
              rotuloEscopo={rotuloDoEscopo}
            />
          )}
        </div>
      )}

      {/* ── Aba: Ajuste de recebimento (correção temporária) ──────────────── */}
      {(abasVisitadas.has('ajuste') || abaVisivel === 'ajuste') && (
        <div className={cn(abaVisivel !== 'ajuste' && 'hidden')}>
          <AjusteRecebimento mes={mesStr} operadores={operadoresParaAjuste} />
        </div>
      )}

    </div>
  );
}
