/**
 * usePainelMetas — tudo o que o painel de metas do Dashboard precisa, resolvido.
 *
 * O componente que consome isto só desenha. A decisão de "quem conta" NÃO mora
 * aqui: ela vem de `useEscopoAnalitico`, o mesmo hook que o `AnalyticsPanel` e o
 * Painel Diretoria usam. É essa partilha que impede o painel de metas de mostrar
 * um total diferente do painel "Dados Analíticos" logo acima — o defeito que
 * `escopoAnalitico.ts` documenta em comentário.
 *
 * A matemática também não mora aqui: é `lib/projecaoMetas.ts`, a mesma que o
 * `MetaProgressoHeader` e a tabela `QuartisOperadores` usam.
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { MetasConfigMes, QuartilConfig } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useTenant } from '@/lib/tenant-config';
import { useAnaliticoDashboard, agregarAnalitico } from '@/hooks/useAnaliticoDashboard';
import { useEscopoAnalitico } from '@/hooks/useEscopoAnalitico';
import { ESCOPO_EMPRESA } from '@/services/analitico/escopoAnalitico';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  buscarDiretoExtraDoMes, buscarAgendadoPorDia,
  type TotaisDiretoExtra, type PontoAgendadoDia,
} from '@/services/analitico/diretoExtra.service';
import { getTodayISO, isPerfilAdminOuLider, isPerfilDiretoria } from '@/lib/index';
import {
  diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO,
} from '@/lib/diasUteis';
import {
  calcularProjecao, ultimoDiaComRecebimento,
  type ResultadoProjecao, type DiaComRecebimento,
} from '@/lib/projecaoMetas';
import {
  normalizarMes, partesDoMes, diasNoMes, ehMesAtual,
} from '@/lib/mesReferencia';
import {
  metaNaUnidade, UNIDADE_PADRAO, type UnidadeValor,
} from '@/lib/unidadeValor';

export interface ParametrosPainelMetas {
  /** Mês em análise ('yyyy-MM'). */
  mes: string;
  /**
   * Filtros já resolvidos pelo Dashboard — os MESMOS que o AnalyticsPanel usa.
   *
   * O painel NÃO tem alternador próprio. Ele tinha, e o resultado era duas
   * barras "Visualizar:" na mesma tela fazendo quase a mesma coisa: a de cima
   * (Setor geral / Bryan / Luciana / Matheus / Individual) recorta a tabela de
   * acordos E o painel de métricas; a de baixo recortava só o painel. Duas
   * verdades possíveis ao mesmo tempo.
   */
  setorId?: string | null;
  equipeId?: string | null;
  operadorId?: string | null;
  /** O setor do usuário tem a lógica Direto/Extra ativa? */
  temLogicaDiretoExtra?: boolean;
  /**
   * PaguePlay: qual lado do recebimento a tela exibe — H.O. (o que fica) ou
   * bruto (o que entrou). Ignorado na BookPlay, que tem `total_ho` zerado.
   *
   * NÃO é uma segunda conta: o hook escolhe qual campo JÁ AGREGADO lê. A meta,
   * essa sim, é convertida — ela é gravada em bruto e o `metaNaUnidade` a
   * traduz. Ver `lib/unidadeValor.ts` para o porquê.
   */
  unidade?: UnidadeValor;
}

export interface DadosPainelMetas {
  /** true enquanto QUALQUER peça faltar — o painel não mostra valor parcial. */
  carregando: boolean;
  /** false = o tenant/banco não tem analítico; o painel inteiro some. */
  dbAtiva: boolean;
  /** Nenhuma linha de analítico no mês — mostra aviso em vez de zeros. */
  semRelatorio: boolean;

  diasUteisTotal: number;
  diasUteisPassados: number;
  diasUteisRestantes: number;

  /** A unidade em que os valores abaixo estão expressos. */
  unidade: UnidadeValor;
  /** Recebido no mês, na unidade ativa. */
  totalRecebido: number;
  /** O mesmo recebido na unidade OPOSTA — a linha secundária do card. */
  totalRecebidoOposto: number;
  /** `null` quando o setor não tem a lógica Direto/Extra — o card some. */
  diretoExtra: TotaisDiretoExtra | null;
  /** Recebido do analítico ainda sem acordo tabulado (base do aviso). */
  naoTabulado: number;
  naoTabuladoQtd: number;
  /** Rótulo da forma (Pix, Boleto, Cartão…) → valor na unidade ativa e qtd. */
  porForma: Record<string, { valor: number; qtd: number }>;

  /** Meta na unidade ativa (a gravada é sempre bruta — ver `unidadeValor`). */
  meta: number | null;
  /** A mesma meta na unidade oposta, para a linha secundária. */
  metaOposta: number | null;
  quartis: QuartilConfig[];
  projecao: ResultadoProjecao | null;

  porDia: Record<number, { bruto: number; ho: number; qtd: number }>;
  /** Agendado por dia, NO MESMO ESCOPO do recebimento — ver o serviço. */
  agendadoPorDia: PontoAgendadoDia[];
  baixaAnterior: DiaComRecebimento | null;

  /** Rótulo do escopo em exibição: "individual", "da equipe Matheus", "do setor". */
  escopoRotulo: string;
  /** true quando o escopo soma mais de uma pessoa (setor ou equipe). */
  modoAgregado: boolean;
  noMesAtual: boolean;
}

export interface EquipeInfo {
  id: string;
  nome: string;
  treinamentoInicio: string | null;
}

interface LinhaEquipe {
  id: string;
  nome: string;
  setor_id: string | null;
  treinamento: boolean | null;
  treinamento_inicio: string | null;
}

/**
 * As equipes que o alternador pode oferecer.
 *
 * Antes daqui saía UMA equipe — a primeira que o usuário liderava — e o painel
 * de um setor com três equipes (Receptivo: Bryan, Luciana, Matheus) só sabia
 * falar de uma delas.
 *
 * Agora são todas as equipes do SETOR EM FOCO. Quem enxerga só a si mesmo
 * recebe lista vazia: a RLS já limitaria o retorno, mas oferecer o botão para
 * depois mostrar zero seria pior que não oferecer.
 */
function useEquipesDisponiveis(
  empresaId: string | null | undefined,
  setorId: string | null | undefined,
  podeVerOutros: boolean,
): { equipes: EquipeInfo[]; carregado: boolean } {
  const [equipes, setEquipes] = useState<EquipeInfo[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!empresaId || !podeVerOutros) {
        if (!cancelado) { setEquipes([]); setCarregado(true); }
        return;
      }
      try {
        let q = supabase
          .from('equipes')
          .select('id, nome, setor_id, treinamento, treinamento_inicio')
          .eq('empresa_id', empresaId)
          .order('nome');
        if (setorId) q = q.eq('setor_id', setorId);

        const { data, error } = await q;
        if (cancelado) return;
        if (error) { setEquipes([]); return; }
        setEquipes(((data as LinhaEquipe[]) ?? []).map(e => ({
          id: e.id,
          nome: e.nome,
          treinamentoInicio: e.treinamento ? (e.treinamento_inicio ?? null) : null,
        })));
      } catch {
        if (!cancelado) setEquipes([]);
      } finally {
        if (!cancelado) setCarregado(true);
      }
    }
    setCarregado(false);
    void carregar();
    return () => { cancelado = true; };
  }, [empresaId, setorId, podeVerOutros]);

  return { equipes, carregado };
}

export function usePainelMetas(params: ParametrosPainelMetas): DadosPainelMetas {
  const { setorId, equipeId, operadorId, temLogicaDiretoExtra } = params;
  const mes = normalizarMes(params.mes);
  const { ano, mes: mesNum } = partesDoMes(mes);

  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const tenant = useTenant();
  const ativo = tenant.isPaguePlay || tenant.slug === 'bookplay';

  /**
   * H.O. só existe na PaguePlay: na BookPlay `total_ho` é 0,00 em toda linha.
   * Forçar 'bruto' lá impede que um parâmetro errado transforme o painel numa
   * parede de zeros.
   */
  const unidade: UnidadeValor = tenant.isPaguePlay
    ? (params.unidade ?? UNIDADE_PADRAO)
    : 'bruto';

  const perfilEquipeId = (perfil as { equipe_id?: string | null } | null)?.equipe_id ?? null;

  /**
   * O usuário enxerga gente além dele mesmo?
   *
   * Decide pelo CARGO, e não pelo `setorId` recebido: o Dashboard trava o setor
   * do próprio operador em `setorFiltro`, então um setor não-nulo não significa
   * "posso ver o setor".
   */
  const podeVerOutros = isPerfilAdminOuLider(perfil?.perfil ?? '')
    || isPerfilDiretoria(perfil?.perfil ?? '');

  const { equipes: equipesConhecidas, carregado: equipesCarregadas } =
    useEquipesDisponiveis(empresa?.id, setorId, podeVerOutros);

  /**
   * O escopo sai dos filtros do DASHBOARD, na mesma ordem que
   * `useEscopoAnalitico` aplica: operador vence equipe, que vence setor.
   *
   * Quem não enxerga outros é forçado ao próprio id. O Dashboard trava
   * `setorFiltro` no setor do operador, e sem esta linha ele cairia no escopo
   * de setor — veria a meta do setor no lugar da dele.
   */
  const operadorEfetivo = podeVerOutros
    ? (operadorId ?? null)
    : (perfil?.id ?? null);
  const equipeSelecionadaId = podeVerOutros ? (equipeId ?? null) : null;
  const modo: 'eu' | 'equipe' | 'setor' =
    operadorEfetivo ? 'eu'
    : equipeSelecionadaId ? 'equipe'
    : (podeVerOutros && setorId) ? 'setor'
    : 'eu';

  const equipeSelecionada = equipesConhecidas.find(e => e.id === equipeSelecionadaId) ?? null;
  /** A equipe do próprio usuário — dá o início de treinamento no escopo pessoal. */
  const minhaEquipe = equipesConhecidas.find(e => e.id === perfilEquipeId) ?? null;

  // ── Analítico + escopo — a MESMA base do AnalyticsPanel ────────────────────
  const analitico = useAnaliticoDashboard(ativo, mes);

  const { escopo, pendente: escopoPendente } = useEscopoAnalitico({
    ativo,
    empresaId:   empresa?.id,
    isPaguePlay: tenant.isPaguePlay,
    // 'setor' deixa só o setor em pé: `escopoDeSetor` soma as equipes pela
    // regra do projeto (carimbo do relatório, ou soma dos usuários quando o
    // setor é alternativo). Não é preciso somar equipe a equipe aqui.
    setorId,
    equipeId:    equipeSelecionadaId,
    operadorId:  operadorEfetivo,
    mes,
    linhas:      analitico.linhas,
  });

  const agregado = useMemo(
    () => agregarAnalitico(analitico.linhas, escopo ?? ESCOPO_EMPRESA),
    [analitico.linhas, escopo],
  );

  /** Os operadores que o escopo abrange — para recortar a busca de Direto/Extra. */
  const operadoresDoEscopo = useMemo<string[] | null>(() => {
    if (!escopo) return null;
    switch (escopo.tipo) {
      case 'operador': return [escopo.operadorId];
      case 'equipe':   return [...escopo.operadores];
      case 'setor':    return [...escopo.operadores];
      case 'empresa':  return null;
    }
  }, [escopo]);

  // ── Config do mês (feriados, quartis, contar_dia_atual) ────────────────────
  const [config, setConfig] = useState<MetasConfigMes | null>(null);
  const [configCarregada, setConfigCarregada] = useState(false);
  useEffect(() => {
    let cancelado = false;
    if (!empresa?.id) { setConfigCarregada(true); return; }
    setConfigCarregada(false);
    void getMetasConfig(empresa.id, mesNum, ano).then(({ data }) => {
      if (cancelado) return;
      setConfig(data);
      setConfigCarregada(true);
    });
    return () => { cancelado = true; };
  }, [empresa?.id, mesNum, ano]);

  // ── Meta do escopo ─────────────────────────────────────────────────────────
  // "Eu"     → meta do tipo `operador`.
  // "equipe" → meta do tipo `equipe` quando existir; senão a soma das metas
  //            individuais dos membros. Mesma precedência de `useAnalytics`.
  const [meta, setMeta] = useState<number | null>(null);
  const [metaCarregada, setMetaCarregada] = useState(false);
  const membrosChave = operadoresDoEscopo ? operadoresDoEscopo.join(',') : '';

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      if (!empresa?.id || !perfil?.id) { setMeta(null); setMetaCarregada(true); return; }
      setMetaCarregada(false);
      try {
        if (modo === 'eu') {
          const { data } = await supabase.from('metas')
            .select('meta_valor')
            .eq('empresa_id', empresa.id).eq('tipo', 'operador')
            .eq('referencia_id', operadorEfetivo ?? perfil.id)
            .eq('mes', mesNum).eq('ano', ano)
            .maybeSingle();
          if (!cancelado) setMeta(Number((data as { meta_valor: number } | null)?.meta_valor) || null);
          return;
        }

        // Escopo agregado: a meta própria do grupo manda, quando existir.
        // 'setor' procura meta de setor; equipe procura meta de equipe.
        const alvo = modo === 'setor'
          ? { tipo: 'setor',  id: setorId ?? '' }
          : { tipo: 'equipe', id: equipeSelecionadaId ?? '' };

        if (alvo.id) {
          const { data: doGrupo } = await supabase.from('metas')
            .select('meta_valor')
            .eq('empresa_id', empresa.id).eq('tipo', alvo.tipo)
            .eq('referencia_id', alvo.id)
            .eq('mes', mesNum).eq('ano', ano)
            .maybeSingle();
          const valorGrupo = Number((doGrupo as { meta_valor: number } | null)?.meta_valor) || 0;
          if (valorGrupo > 0) { if (!cancelado) setMeta(valorGrupo); return; }
        }

        // Sem meta do grupo: soma as individuais. Membro sem meta soma zero —
        // o recebimento dele continua contando, só a meta não.
        const ids = membrosChave ? membrosChave.split(',') : [];
        if (!ids.length) { if (!cancelado) setMeta(null); return; }
        const { data: individuais } = await supabase.from('metas')
          .select('meta_valor')
          .eq('empresa_id', empresa.id).eq('tipo', 'operador')
          .in('referencia_id', ids)
          .eq('mes', mesNum).eq('ano', ano);
        const soma = ((individuais as { meta_valor: number }[]) ?? [])
          .reduce((s, m) => s + (Number(m.meta_valor) || 0), 0);
        if (!cancelado) setMeta(soma > 0 ? soma : null);
      } catch {
        if (!cancelado) setMeta(null);
      } finally {
        if (!cancelado) setMetaCarregada(true);
      }
    }
    void carregar();
    return () => { cancelado = true; };
  }, [empresa?.id, perfil?.id, operadorEfetivo, equipeSelecionadaId, setorId, modo,
      mesNum, ano, membrosChave]);

  // ── Direto/Extra (tabulação) ───────────────────────────────────────────────
  // Só busca quando o setor tem a lógica — sem ela os cards nem aparecem, e a
  // query seria trabalho jogado fora a cada troca de mês.
  const [diretoExtra, setDiretoExtra] = useState<TotaisDiretoExtra | null>(null);
  const [dxCarregado, setDxCarregado] = useState(false);
  useEffect(() => {
    let cancelado = false;
    if (!temLogicaDiretoExtra || !empresa?.id || escopoPendente) {
      setDiretoExtra(null);
      setDxCarregado(!temLogicaDiretoExtra);
      return;
    }
    setDxCarregado(false);
    void buscarDiretoExtraDoMes({
      empresaId: empresa.id,
      mes,
      escopo,
    }).then(t => {
      if (cancelado) return;
      setDiretoExtra(t);
      setDxCarregado(true);
    });
    return () => { cancelado = true; };
  }, [temLogicaDiretoExtra, empresa?.id, mes, escopo, escopoPendente]);

  // ── Agendado por dia (mesmo escopo do recebimento) ─────────────────────────
  const [agendadoPorDia, setAgendadoPorDia] = useState<PontoAgendadoDia[]>([]);
  const [agendadoCarregado, setAgendadoCarregado] = useState(false);
  useEffect(() => {
    let cancelado = false;
    if (!empresa?.id || escopoPendente || !escopo) {
      setAgendadoPorDia([]);
      setAgendadoCarregado(false);
      return;
    }
    setAgendadoCarregado(false);
    void buscarAgendadoPorDia({ empresaId: empresa.id, mes, escopo }).then(p => {
      if (cancelado) return;
      setAgendadoPorDia(p);
      setAgendadoCarregado(true);
    });
    return () => { cancelado = true; };
  }, [empresa?.id, mes, escopo, escopoPendente]);

  // Ranking NÃO mora aqui: é o `MetaProgressoHeader`, logo abaixo da saudação.
  // Buscar de novo o mesmo `fn_analitico_resumo_por_operador` seria uma segunda
  // ida ao banco para mostrar o mesmo número duas vezes na mesma tela.

  // ── Dias úteis ─────────────────────────────────────────────────────────────
  // O início de treinamento é o da equipe em foco: no modo "eu", a do próprio
  // usuário — ignorá-lo cobraria dele os dias anteriores à entrada. No modo
  // setor não se aplica: o setor não entra em treinamento, as equipes é que
  // entram, e cada uma na sua data.
  const inicioTreino = (modo === 'eu' ? minhaEquipe : equipeSelecionada)
    ?.treinamentoInicio ?? undefined;
  const feriados = config?.feriados ?? [];

  const diasUteisTotal = useMemo(
    () => diasUteisDoMes(ano, mesNum, feriados, inicioTreino),
    [ano, mesNum, feriados, inicioTreino],
  );
  const diasUteisPassados = useMemo(
    () => diasUteisDecorridos(
      ano, mesNum, feriados, getTodayISO(), inicioTreino, config?.contar_dia_atual === true,
    ),
    [ano, mesNum, feriados, inicioTreino, config?.contar_dia_atual],
  );

  const quartis = config?.quartis?.length ? config.quartis : QUARTIS_PADRAO;

  // ── Unidade ────────────────────────────────────────────────────────────────
  // Recebido: campo já agregado, nunca convertido — `ho` vem do relatório.
  // Meta: convertida, porque só existe gravada em bruto.
  const recebidoNaUnidade = unidade === 'ho' ? agregado.ho : agregado.bruto;
  const recebidoOposto    = unidade === 'ho' ? agregado.bruto : agregado.ho;
  const metaNaUnidadeAtiva = metaNaUnidade(meta, unidade);
  const metaOposta         = metaNaUnidade(meta, unidade === 'ho' ? 'bruto' : 'ho');

  const projecao = useMemo(
    () => calcularProjecao({
      meta: metaNaUnidadeAtiva, recebido: recebidoNaUnidade,
      totalUteis: diasUteisTotal, decorridos: diasUteisPassados, quartis,
    }),
    [metaNaUnidadeAtiva, recebidoNaUnidade, diasUteisTotal, diasUteisPassados, quartis],
  );

  /** Formas na unidade ativa — o donut usa uma unidade só. */
  const porFormaNaUnidade = useMemo(() => {
    const saida: Record<string, { valor: number; qtd: number }> = {};
    for (const [rotulo, f] of Object.entries(agregado.porForma)) {
      saida[rotulo] = { valor: unidade === 'ho' ? f.ho : f.bruto, qtd: f.qtd };
    }
    return saida;
  }, [agregado.porForma, unidade]);

  // ── Baixa anterior ─────────────────────────────────────────────────────────
  // Mês fechado não tem "hoje": todos os dias ficam elegíveis.
  const noMesAtual = ehMesAtual(mes);
  const hojeDia = noMesAtual
    ? Number(getTodayISO().slice(8, 10))
    : diasNoMes(mes) + 1;

  /**
   * QUAL dia é sempre decidido pelo bruto — "houve movimento" é um fato do
   * calendário, não da unidade. Só o VALOR muda com o alternador. Procurar pelo
   * H.O. faria o card apontar um dia diferente do que o gráfico ao lado destaca.
   */
  const baixaAnterior = useMemo(() => {
    const dia = ultimoDiaComRecebimento(agregado.porDia, hojeDia);
    if (!dia || unidade === 'bruto') return dia;
    return { ...dia, bruto: agregado.porDia[dia.dia]?.ho ?? 0 };
  }, [agregado.porDia, hojeDia, unidade]);

  /**
   * Segura a tela enquanto QUALQUER peça do número faltar.
   *
   * ⚠️ NÃO acrescente `fontes === null` aqui. `useEscopoAnalitico` resolve as
   * fontes com `.then()` sem `.catch()`, e `buscarFontesDeEscopo` lê `equipes`
   * e `perfis` — leitura que a RLS nega ao OPERADOR (a policy `perfis_select`
   * só libera perfis de terceiros para lider/administrador/super_admin). Numa
   * rejeição, `fontes` fica `null` para sempre, e esperar por ela deixava o
   * painel do operador no esqueleto eterno enquanto o do líder carregava.
   *
   * `escopoPendente` é o gate certo: ele já é `true` exatamente nos casos que
   * dependem das fontes (equipe e setor) e `false` no escopo de operador, que
   * não depende delas.
   */
  const carregando = !analitico.carregado || escopoPendente || !configCarregada
    || !metaCarregada || !dxCarregado || !equipesCarregadas || !agendadoCarregado;

  // Segue `modo`, e não a mera presença de `equipeSelecionada`: com operador E
  // equipe escolhidos o operador vence (mesma ordem do `useEscopoAnalitico`), e
  // rotular de "da equipe X" contaria uma história diferente da do número.
  const escopoRotulo =
    modo === 'setor'  ? 'do setor'
    : modo === 'equipe' && equipeSelecionada ? `da equipe ${equipeSelecionada.nome}`
    : 'individual';

  return {
    carregando,
    dbAtiva: ativo && analitico.dbAtiva,
    semRelatorio: analitico.carregado && analitico.linhas.length === 0,

    diasUteisTotal,
    diasUteisPassados,
    // Sempre derivado, nunca recalculado por outro caminho: os três números
    // precisam fechar entre si na tela.
    diasUteisRestantes: Math.max(diasUteisTotal - diasUteisPassados, 0),

    unidade,
    totalRecebido: recebidoNaUnidade,
    totalRecebidoOposto: recebidoOposto,
    diretoExtra,
    naoTabulado: unidade === 'ho'
      ? agregado.naoTabuladoHO
      : agregado.naoTabuladoBruto,
    naoTabuladoQtd: agregado.naoTabuladoQtd,
    porForma: porFormaNaUnidade,

    meta: metaNaUnidadeAtiva,
    metaOposta,
    quartis,
    projecao,

    porDia: agregado.porDia,
    agendadoPorDia,
    baixaAnterior,

    escopoRotulo,
    modoAgregado: modo !== 'eu',
    noMesAtual,
  };
}
