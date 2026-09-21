/**
 * PainelLiderComercial — o Painel do Líder, no desenho da BookPlay.
 *
 * ## O pedido de 16/09/2026
 *
 * «Quero que o painel líder seja inspirado no painel líder da BookPlay, só que
 * com as métricas de vendas.» A primeira versão (Fase 9) tinha as perguntas
 * certas numa tela de blocos chapados, empilhados — nada nela lembrava a tela
 * que a liderança já sabe ler na cobrança.
 *
 * Agora é o mesmo esqueleto de `pages/PainelLider.tsx`: cabeçalho com o
 * navegador de mês, abas sublinhadas, um recorte só valendo para todas, e o
 * `CardEquipe` da cobrança — o mesmo componente, não uma cópia — com a barra
 * que põe acumulado, esperado até hoje e meta no mesmo eixo.
 *
 * ## As abas, e o que cada uma é na cobrança
 *
 *   Desempenho Equipes .. o mesmo nome e o mesmo card. Acumulado = vendas
 *                         confirmadas E assinadas, na régua da meta.
 *   Quartis ............. o mesmo nome e a mesma leitura da cobrança, com a
 *                         fonte trocada. Entrou em 21/09/2026 («do lado do
 *                         Desempenho Equipes ele fez a aba Pessoas, e eu quero
 *                         uma aba de Quartis»). Ver `painel/QuartisComercial`.
 *   Pessoas ............. a tabela por pessoa, com a fila de assinatura no
 *                         alto. Responde QUANTO cada um fez; Quartis responde
 *                         se esse quanto está no ritmo.
 *   Gráfico de vendas ... o lugar do Gráfico de recebimento.
 *   Desafios ............ era item de menu; na cobrança mora numa tela maior,
 *                         e aqui passou a morar nesta.
 *
 * ## O recorte tem setor desde 21/09/2026
 *
 * A tela dizia `podeFiltrarSetor: false` escrito no código, e quem enxergava a
 * empresa inteira via os setores somados sem como olhar um. Agora quem decide é
 * `resolverEscopoPainel`, o mesmo do Painel Líder da cobrança, lendo as chaves
 * `painel_lider_escopo_*` — as duas telas passam a responder à mesma
 * configuração, que era o ponto de compartilharem a chave.
 *
 * ## A régua manda na unidade
 *
 * A meta do Comercial é em valor OU em quantidade (`metas.regua`), e o card
 * escreve na unidade dela — «12 vendas», não «R$ 12,00». Sem meta de setor
 * configurada, valor, que é a leitura que a operação faz primeiro.
 *
 * ## O que não mudou de regra
 *
 * - O eixo é a CONFIRMAÇÃO, fixo: é por ele que a meta conta.
 * - A meta desconta ausência (`fatorDePresenca`), e o card diz quanto.
 * - Quem não vendeu aparece, com a ausência ao lado — a lista vem do cadastro.
 * - O desligado que vendeu continua na lista: a venda dele soma no total.
 * - O robô soma no setor e não disputa lugar entre as pessoas.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Users, Calendar, ChevronRight, ChevronLeft, RefreshCw, Radio, BarChart3,
  LineChart, Trophy, Building2, TriangleAlert, ChevronDown, UserMinus, Bot, Loader2,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PontoDaLegenda } from '@/components/PainelMetas/PontoDaLegenda';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';
import { useVendas } from '@/hooks/useVendas';
import { useVendasPlacar } from '@/hooks/useVendasPlacar';
import { formatBRL } from '@/lib/money';
import { ROUTE_PATHS, getTodayISO } from '@/lib/index';
import {
  deslocarMes, ehMesAtual, mesAtual, partesDoMes, rotuloDoMes,
} from '@/lib/mesReferencia';
import { diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import {
  GAVETA_LABELS, GAVETAS_EM_ORDEM, resumirVendas, type ResumoVendas,
} from '@/lib/vendas';
import {
  equipeDaVenda, placarPorOperador, separarAutomacao, serieDiaria, totalDoRecorte,
  type LinhaDoPlacar,
} from '@/lib/vendasPlacar';
import {
  ajustarMetaPorPresenca, ehRegua, fatorDePresenca, progressoDaMeta,
  rotuloDaPresenca, REGUA_LABEL, type ReguaMeta,
} from '@/lib/vendasMeta';
import { COR_DA_GAVETA, serieDoMes, ticketMedio } from '@/lib/vendasDashboard';
import { buscarMetasDoMes, type MetaDeRecorte } from '@/services/vendas/metasVendas.service';
import type { PessoaComAusencia } from '@/services/vendas/placar.service';
import type { EquipeAnalitico } from '@/services/analitico/analitico.service';
import { CardEquipe } from '@/pages/Dashboard/Analitico/CardEquipe';
import { FiltrosEscopo } from '@/pages/Dashboard/Analitico/FiltrosEscopo';
import { resolverEscopoPainel, type EscopoPainel } from '@/pages/Dashboard/Analitico/escopoDoPainel';
import type { OperadorNaEquipe } from '@/pages/Dashboard/Analitico/desempenhoEquipe';
import {
  lideresDaEquipe, type LiderInfo, type PerfilLider,
} from '@/pages/Dashboard/Analitico/lideresDaEquipe';
import { QuartisComercial } from './painel/QuartisComercial';
import { EvolucaoVendas } from './dashboard/EvolucaoVendas';
import { Faixa } from './componentes';
import { corTexto } from '@/lib/temas';

// Desafios arrasta catálogo, detalhe e configuração das gincanas. Só baixa
// para quem abre a aba.
const DesafiosComercial = lazy(() => import('./DesafiosComercial'));

type AbaPainel = 'desempenho' | 'pessoas' | 'quartis' | 'grafico' | 'desafios';

// ─── Unidade da régua ─────────────────────────────────────────────────────────

function formatarQuantidade(n: number): string {
  const texto = n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${texto} ${Math.abs(n) === 1 ? 'venda' : 'vendas'}`;
}

/** O número que a régua lê de um resumo. */
function medir(resumo: Pick<ResumoVendas, 'quantidade' | 'valor'> | undefined, regua: ReguaMeta): number {
  if (!resumo) return 0;
  return regua === 'quantidade' ? resumo.quantidade : resumo.valor;
}

/**
 * A meta de um recorte na régua do painel, com a ausência descontada.
 *
 * `null` sem meta configurada — o card escreve «sem meta» em vez de medir
 * contra zero.
 */
function metaDoRecorte(
  meta: MetaDeRecorte | undefined,
  regua: ReguaMeta,
  fator: number | null,
): number | null {
  if (!meta || !ehRegua(meta.regua)) return null;
  const ajustada = ajustarMetaPorPresenca(
    { regua: meta.regua, quantidade: meta.quantidade, valor: meta.valor },
    fator,
  );
  const alvo = regua === 'quantidade' ? ajustada.quantidade : ajustada.valor;
  return alvo > 0 ? alvo : null;
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

// ─── Líderes das equipes ──────────────────────────────────────────────────────

/**
 * Quem lidera cada equipe, para as fotos do card.
 *
 * As três leituras e a regra são as do `DesempenhoEquipes` da cobrança —
 * `lideresDaEquipe` decide, e aqui só se busca. Falha não derruba o painel:
 * o card sai com o ícone de equipe no lugar das fotos.
 */
function useLideresDasEquipes(empresaId: string | null): Record<string, LiderInfo[]> {
  const [lideres, setLideres] = useState<Record<string, LiderInfo[]>>({});

  useEffect(() => {
    if (!empresaId) { setLideres({}); return; }
    let vivo = true;
    void Promise.all([
      supabase.from('perfis').select('id, nome, foto_url, equipe_id')
        .eq('empresa_id', empresaId).eq('perfil', 'lider'),
      supabase.from('equipe_lideres').select('equipe_id, lider_id')
        .eq('empresa_id', empresaId),
      supabase.from('equipe_operadores_clones').select('equipe_id, operador_id')
        .eq('empresa_id', empresaId),
    ]).then(([l, e, c]) => {
      if (!vivo) return;
      setLideres(lideresDaEquipe({
        lideres:    (l.data as unknown as PerfilLider[] | null) ?? [],
        explicitos: (e.data as unknown as { equipe_id: string; lider_id: string }[] | null) ?? [],
        clones:     (c.data as unknown as { equipe_id: string; operador_id: string }[] | null) ?? [],
      }));
    });
    return () => { vivo = false; };
  }, [empresaId]);

  return lideres;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PainelLiderComercial() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();
  const [searchParams, setSearchParams] = useSearchParams();

  const empresaId = empresa?.id ?? null;
  const ativo = Boolean(empresaId);

  const { vendas, carregando, disponivel, erro, recarregar } =
    useVendas({ empresaId, mes, eixo: 'confirmacao', ativo });
  const placar = useVendasPlacar({ empresaId, mes, ativo });
  const lideres = useLideresDasEquipes(empresaId);

  const [metas, setMetas] = useState<MetaDeRecorte[]>([]);
  useEffect(() => {
    if (!empresaId || !temPermissao('ver_metas_vendas')) { setMetas([]); return; }
    const { ano, mes: m } = partesDoMes(mes);
    void buscarMetasDoMes(empresaId, ano, m).then(r => setMetas(r.dado ?? []));
  }, [empresaId, mes, temPermissao]);

  // ── Abas ─────────────────────────────────────────────────────────────────
  const abasInternas = useMemo(() => ([
    { key: 'desempenho' as const, label: 'Desempenho Equipes', Icon: BarChart3 },
    /*
     * Quartis ao lado de Desempenho Equipes, como na cobrança, e ANTES de
     * Pessoas: a ordem das abas é a da pergunta que se faz primeiro — o time
     * está no ritmo? quem está fora? quanto cada um fez?
     *
     * A chave é a MESMA da cobrança (`painel_lider_sub_quartis`): «esta pessoa
     * enxerga os quartis do painel?» é a mesma pergunta nas duas operações, e um
     * cargo que já a tem lá não deveria precisar de outra configuração aqui —
     * o mesmo motivo de `ver_painel_lider` ser compartilhada.
     */
    ...(temPermissao('painel_lider_sub_quartis')
      ? [{ key: 'quartis' as const, label: 'Quartis', Icon: TrendingUp }]
      : []),
    { key: 'pessoas'    as const, label: 'Pessoas',            Icon: Users },
    { key: 'grafico'    as const, label: 'Gráfico de vendas',  Icon: LineChart },
    // A chave de sempre dos Desafios, que não depende de `ver_analitico`.
    ...(temPermissao('analitico_sub_desafios')
      ? [{ key: 'desafios' as const, label: 'Desafios', Icon: Trophy }]
      : []),
  ]), [temPermissao]);

  // A aba vai na URL: `/vendas/desafios` redireciona para cá já na certa.
  const pedida = searchParams.get('tab') as AbaPainel | null;
  const abaVisivel: AbaPainel = abasInternas.find(a => a.key === pedida)?.key ?? 'desempenho';
  useSubAbaUso(abaVisivel);

  // Aba visitada fica montada (escondida com CSS), como na cobrança: voltar a
  // ela não refaz as buscas de dentro.
  const [visitadas, setVisitadas] = useState<Set<AbaPainel>>(() => new Set([abaVisivel]));
  const mudarAba = useCallback((k: AbaPainel) => {
    setVisitadas(prev => (prev.has(k) ? prev : new Set(prev).add(k)));
    const p = new URLSearchParams(searchParams);
    p.set('tab', k);
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);
  useEffect(() => {
    setVisitadas(prev => (prev.has(abaVisivel) ? prev : new Set(prev).add(abaVisivel)));
  }, [abaVisivel]);

  // ── Calendário ──────────────────────────────────────────────────────────
  const { uteis, trabalhados } = useMemo(() => {
    const { ano, mes: m } = partesDoMes(mes);
    return {
      uteis: diasUteisDoMes(ano, m),
      trabalhados: diasUteisDecorridos(ano, m, [], getTodayISO()),
    };
  }, [mes]);

  // ── A régua ─────────────────────────────────────────────────────────────
  const regua: ReguaMeta = useMemo(() => {
    const doSetor = metas.find(m => m.tipo === 'setor' && ehRegua(m.regua));
    return (doSetor?.regua as ReguaMeta | undefined) ?? 'valor';
  }, [metas]);
  const formatar = regua === 'quantidade' ? formatarQuantidade : formatBRL;

  // ── Setores e equipes: o cadastro, mais o que a tela de metas conhece ────
  const { setores, equipes } = useMemo(() => {
    const s = new Map<string, string>();
    const e = new Map<string, EquipeAnalitico>();
    for (const p of placar.pessoas) {
      if (p.setor_id && p.setor_nome) s.set(p.setor_id, p.setor_nome);
      if (p.equipe_id && p.equipe_nome) {
        e.set(p.equipe_id, { id: p.equipe_id, nome: p.equipe_nome, setor_id: p.setor_id });
      }
    }
    for (const m of metas) {
      if (m.tipo === 'setor') s.set(m.referencia_id, m.nome);
      else if (!e.has(m.referencia_id)) {
        e.set(m.referencia_id, { id: m.referencia_id, nome: m.nome, setor_id: m.setor_id });
      }
      if (m.tipo === 'equipe' && m.setor_id && m.setor_nome) s.set(m.setor_id, m.setor_nome);
    }
    const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, 'pt-BR');
    return {
      setores: [...s].map(([id, nome]) => ({ id, nome })).sort(porNome),
      equipes: [...e.values()].sort(porNome),
    };
  }, [placar.pessoas, metas]);

  // ── O recorte ───────────────────────────────────────────────────────────
  //
  // Marcação múltipla desde 17/09/2026: lista vazia é "todas", e dá para
  // comparar duas ou três de uma vez. Ver `FiltrosEscopo`.
  //
  // O filtro de SETOR entrou em 21/09/2026, e até aqui a tela dizia
  // `podeFiltrarSetor: false` escrito no código — quem enxergava a empresa
  // inteira via os setores somados e não tinha como olhar um. Agora quem decide
  // é `resolverEscopoPainel`, o mesmo do Painel Líder da cobrança, lendo as
  // chaves `painel_lider_escopo_*`. As duas telas passam a responder à mesma
  // configuração, que era o ponto de compartilhar a chave.
  const [setoresMarcados, setSetoresMarcados] = useState<string[]>([]);
  const [equipesMarcadas, setEquipesMarcadas] = useState<string[]>([]);
  // Trocar de empresa não pode deixar setor nem equipe de outra empresa escolhidos.
  useEffect(() => { setSetoresMarcados([]); setEquipesMarcadas([]); }, [empresaId]);
  // Mexer nos setores descarta as equipes marcadas antes: elas podem ser de um
  // setor que saiu do recorte, e o cruzamento devolveria lista vazia parecendo
  // "não há ninguém".
  const mudarSetores = useCallback((ids: string[]) => {
    setSetoresMarcados(ids);
    setEquipesMarcadas([]);
  }, []);

  const escopo: EscopoPainel = useMemo(() => resolverEscopoPainel({
    temPermissao,
    setorDoPerfil:     perfil?.setor_id ?? null,
    setoresEscolhidos: setoresMarcados,
    equipesEscolhidas: equipesMarcadas,
    equipes,
  }), [temPermissao, perfil?.setor_id, setoresMarcados, equipesMarcadas, equipes]);

  const equipesValidas = escopo.equipeIds;
  const noRecorte = useMemo(() => new Set(equipesValidas), [equipesValidas]);
  const setoresNoFoco = useMemo(() => new Set(escopo.setorIds), [escopo.setorIds]);

  /**
   * As vendas do recorte.
   *
   * O setor corta primeiro, e pelo `setor_id` da VENDA — que é o setor onde o
   * dinheiro entrou, e não o setor de hoje de quem vendeu. A equipe corta
   * depois, dentro do que o setor deixou passar.
   */
  const vendasNaTela = useMemo(
    () => vendas.filter(v => {
      if (setoresNoFoco.size > 0 && !(v.setor_id && setoresNoFoco.has(v.setor_id))) return false;
      if (noRecorte.size === 0) return true;
      const eq = equipeDaVenda(v, placar.indice);
      return eq ? noRecorte.has(eq) : false;
    }),
    [vendas, setoresNoFoco, noRecorte, placar.indice],
  );

  const quemVendeu = useMemo(() => new Set(vendasNaTela.map(v => v.operador_id)), [vendasNaTela]);

  /**
   * Quem entra na lista: a equipe escolhida, ou todo o alcance.
   *
   * Desligado sem venda no recorte sai; desligado COM venda fica, para o total
   * lá em cima ter de onde vir. O robô sai sempre — ele tem linha própria.
   */
  const pessoasNaTela = useMemo(
    () => placar.pessoas.filter(p =>
      !p.robo
      && (p.situacao !== 'desligado' || quemVendeu.has(p.id))
      && (setoresNoFoco.size === 0 || (p.setor_id ? setoresNoFoco.has(p.setor_id) : false))
      && (noRecorte.size === 0 || (p.equipe_id ? noRecorte.has(p.equipe_id) : false))),
    [placar.pessoas, setoresNoFoco, noRecorte, quemVendeu],
  );

  const placarDaTela = useMemo(
    () => placarPorOperador(vendasNaTela, placar.indice, regua),
    [vendasNaTela, placar.indice, regua],
  );
  const porPessoa = useMemo(
    () => new Map(placarDaTela.map(l => [l.operadorId, l])),
    [placarDaTela],
  );
  /** O mesmo placar, só o resumo — é o que a aba Quartis pede. */
  const resumoPorPessoa = useMemo(
    () => new Map(placarDaTela.map(l => [l.operadorId, l.resumo] as const)),
    [placarDaTela],
  );
  const automacao = useMemo(() => separarAutomacao(placarDaTela).automacao, [placarDaTela]);
  const total = useMemo(
    () => totalDoRecorte(vendasNaTela, placar.indice),
    [vendasNaTela, placar.indice],
  );

  // ── Os cards de Desempenho ───────────────────────────────────────────────
  const presencaDe = useCallback((id: string) => {
    const p = placar.presencaPorRecorte.get(id);
    return p ? { presenca: p, fator: fatorDePresenca(p) } : { presenca: null, fator: null };
  }, [placar.presencaPorRecorte]);

  const operadoresDe = useCallback((gente: readonly PessoaComAusencia[]): OperadorNaEquipe[] =>
    gente.map((p): OperadorNaEquipe => ({
      id: p.id,
      nome: p.nome,
      fotoUrl: p.foto_url,
      recebido: medir(porPessoa.get(p.id)?.resumo, regua),
      // O Comercial não tem meta individual: a pessoa entra na soma e no
      // destaque, e fica fora da distribuição por quartil — o card diz isso.
      meta: null,
    })), [porPessoa, regua]);

  const cards = useMemo(() => {
    const setoresComDado = setores
      .filter(s => setoresNoFoco.size === 0 || setoresNoFoco.has(s.id))
      .filter(s =>
        equipes.some(e => e.setor_id === s.id)
        || vendas.some(v => v.setor_id === s.id)
        || metas.some(m => m.tipo === 'setor' && m.referencia_id === s.id));

    return setoresComDado.map(setor => {
      const vendasDoSetor = vendas.filter(v => v.setor_id === setor.id);
      const resumoSetor = resumirVendas(vendasDoSetor);
      const { presenca: presencaSetor, fator: fatorSetor } = presencaDe(setor.id);
      const metaSetorBruta = metas.find(m => m.tipo === 'setor' && m.referencia_id === setor.id);

      const equipesDoSetor = equipes
        .filter(e => e.setor_id === setor.id)
        .filter(e => noRecorte.size === 0 || noRecorte.has(e.id))
        .map(e => {
          const resumo = resumirVendas(vendasDoSetor.filter(v => equipeDaVenda(v, placar.indice) === e.id));
          const { presenca, fator } = presencaDe(e.id);
          const gente = placar.pessoas.filter(p =>
            !p.robo && p.equipe_id === e.id
            && (p.situacao !== 'desligado' || vendasDoSetor.some(v => v.operador_id === p.id)));
          return {
            equipe: e,
            acumulado: medir(resumo, regua),
            meta: metaDoRecorte(metas.find(m => m.tipo === 'equipe' && m.referencia_id === e.id), regua, fator),
            ausencia: presenca ? rotuloDaPresenca(presenca, fator) : null,
            operadores: operadoresDe(gente),
          };
        })
        .sort((a, b) => b.acumulado - a.acumulado);

      // As vendas do setor que nenhuma equipe conta: quem está sem equipe no
      // cadastro, e a automação. Somam no card do setor e só nele.
      const semEquipe = resumirVendas(
        vendasDoSetor.filter(v => equipeDaVenda(v, placar.indice) === null),
      );

      const genteDoSetor = placar.pessoas.filter(p =>
        !p.robo && p.setor_id === setor.id
        && (p.situacao !== 'desligado' || vendasDoSetor.some(v => v.operador_id === p.id)));

      return {
        setor,
        acumulado: medir(resumoSetor, regua),
        meta: metaDoRecorte(metaSetorBruta, regua, fatorSetor),
        ausencia: presencaSetor ? rotuloDaPresenca(presencaSetor, fatorSetor) : null,
        operadores: operadoresDe(genteDoSetor),
        equipes: equipesDoSetor,
        semEquipe,
      };
    });
  }, [setores, equipes, vendas, metas, placar.pessoas, placar.indice, presencaDe,
      operadoresDe, regua, noRecorte, setoresNoFoco]);

  // ── A meta do recorte, para a régua diária do gráfico ─────────────────────
  const andamentoDoRecorte = useMemo(() => {
    /*
     * A régua do gráfico só existe para um recorte com UMA meta.
     *
     * Com uma equipe marcada é a meta dela; sem nenhuma, a do setor. Com duas
     * ou mais marcadas não há uma meta a mostrar — somar as delas daria um
     * alvo que ninguém combinou, e escolher a primeira mediria o recorte
     * inteiro contra a régua de um pedaço. Aí o gráfico fica sem linha de
     * meta, que é a leitura honesta.
     */
    if (equipesValidas.length > 1) return null;
    const equipeUnica = equipesValidas[0] ?? null;
    const meta = equipeUnica
      ? metas.find(m => m.tipo === 'equipe' && m.referencia_id === equipeUnica)
      : metas.find(m => m.tipo === 'setor' && ehRegua(m.regua));
    if (!meta || !ehRegua(meta.regua)) return null;
    const { fator } = presencaDe(meta.referencia_id);
    const ajustada = ajustarMetaPorPresenca(
      { regua: meta.regua, quantidade: meta.quantidade, valor: meta.valor }, fator,
    );
    return progressoDaMeta({ meta: ajustada, resumo: total.resumo, uteis, trabalhados });
  }, [metas, equipesValidas, presencaDe, total.resumo, uteis, trabalhados]);

  const serie = useMemo(
    () => serieDoMes(serieDiaria(vendasNaTela, 'confirmacao'), mes),
    [vendasNaTela, mes],
  );

  // ── Cabeçalho ────────────────────────────────────────────────────────────
  const noMesAtual = ehMesAtual(mes);
  const irMes = (delta: number) => setMes(deslocarMes(mes, delta));
  const atualizando = carregando || placar.carregando;
  const carregandoTudo = atualizando && placar.pessoas.length === 0 && vendas.length === 0;
  const recarregarTudo = () => { recarregar(); placar.recarregar(); };

  /*
   * O nome do setor para quem NÃO pode filtrar — o rótulo travado do seletor.
   *
   * Duas fontes na ordem certa: o setor que o escopo fixou (o do perfil), e só
   * então «há um setor só na tela». A segunda sozinha mentiria para quem
   * enxerga a empresa inteira num mês em que apenas um setor vendeu.
   */
  const nomeSetorTravado = escopo.podeFiltrarSetor
    ? null
    : (escopo.setorUnico
        ? setores.find(s => s.id === escopo.setorUnico)?.nome ?? null
        : (setores.length === 1 ? setores[0].nome : null));

  if (!empresaId) return null;

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
              {pessoasNaTela.length} {pessoasNaTela.length === 1 ? 'pessoa' : 'pessoas'} no alcance
              {' · '}vendas pelo dia da confirmação
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-2 py-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => irMes(-1)} title="Mês anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="flex items-center gap-1.5 text-sm font-semibold min-w-[130px] justify-center capitalize">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            {rotuloDoMes(mes)}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => irMes(1)} title="Próximo mês">
            <ChevronRight className="w-4 h-4" />
          </Button>
          {!noMesAtual && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-primary"
              onClick={() => setMes(mesAtual())}>
              Hoje
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={recarregarTudo} disabled={atualizando} title="Recarregar">
            <RefreshCw className={cn('w-3.5 h-3.5', atualizando && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* ── Abas ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {abasInternas.map(({ key, label, Icon }) => (
          <button key={key} type="button" onClick={() => mudarAba(key)}
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

      {/* O recorte: um só, valendo para as abas de vendas. Desafios tem o
          recorte da campanha, e não este. */}
      {abaVisivel !== 'desafios' && (
        <FiltrosEscopo
          escopo={escopo}
          setores={setores}
          onSetores={mudarSetores}
          onEquipes={setEquipesMarcadas}
          nomeSetorTravado={nomeSetorTravado}
        />
      )}

      {/* ── Avisos ───────────────────────────────────────────────────────── */}
      {!disponivel && (
        <Faixa tom="alerta">
          A aba Vendas não respondeu. <strong>Recarregue a página</strong>; se persistir, confira
          se a migration <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915100000_vendas_fase1.sql</code> está aplicada.
        </Faixa>
      )}
      {erro && <Faixa tom="alerta">{erro}</Faixa>}
      {!placar.disponivel && (
        <Faixa tom="info">
          O cadastro das pessoas não respondeu, então <strong>quem não vendeu não aparece</strong> e
          a meta não desconta ausência. Confira a migration
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915230000_vendas_fase9_placar_e_paineis.sql</code>.
        </Faixa>
      )}

      {/* ── Aba: Desempenho Equipes ──────────────────────────────────────── */}
      {(visitadas.has('desempenho') || abaVisivel === 'desempenho') && (
        <div className={cn(abaVisivel !== 'desempenho' && 'hidden')}>
          {carregandoTudo ? (
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-muted rounded-2xl" />)}
            </div>
          ) : cards.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Nenhum setor ou equipe com venda ou meta em {rotuloDoMes(mes)}.
            </p>
          ) : (
            <div className="space-y-6">
              {cards.map(c => (
                <div key={c.setor.id} className="space-y-3">
                  {cards.length > 1 && (
                    <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {c.setor.nome}
                    </p>
                  )}
                  {/* O card do setor sai de cena com filtro de equipe: o número
                      dele é do setor inteiro e contradiria o recorte. */}
                  {noRecorte.size === 0 && (
                    <CardEquipe
                      titulo={c.setor.nome}
                      subtitulo={['Setor · vendas confirmadas e assinadas', c.ausencia]
                        .filter(Boolean).join(' · ')}
                      ehSetor
                      avatarProprio={{ foto: null, Icone: Building2, rotulo: 'Setor' }}
                      acumulado={c.acumulado}
                      meta={c.meta}
                      totalUteis={uteis}
                      decorridos={trabalhados}
                      quartis={QUARTIS_PADRAO}
                      operadores={c.operadores}
                      formatar={formatar}
                    />
                  )}
                  {c.equipes.map(e => (
                    <CardEquipe
                      key={e.equipe.id}
                      titulo={e.equipe.nome}
                      subtitulo={[
                        lideres[e.equipe.id]?.length
                          ? lideres[e.equipe.id].map(l => l.nome).join(' · ')
                          : null,
                        e.ausencia,
                      ].filter(Boolean).join(' · ') || undefined}
                      lideres={lideres[e.equipe.id] ?? []}
                      acumulado={e.acumulado}
                      meta={e.meta}
                      totalUteis={uteis}
                      decorridos={trabalhados}
                      quartis={QUARTIS_PADRAO}
                      operadores={e.operadores}
                      formatar={formatar}
                    />
                  ))}
                  {noRecorte.size === 0 && c.semEquipe.quantidade > 0 && (
                    <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                      <Bot className="w-3 h-3 shrink-0" />
                      {c.semEquipe.quantidade} {c.semEquipe.quantidade === 1 ? 'venda' : 'vendas'}
                      {' '}({formatBRL(c.semEquipe.valor)}) de quem não tem equipe no cadastro — inclusive
                      a automação — somam só no card do setor.
                    </p>
                  )}
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Acumulado = vendas <strong>confirmadas e assinadas</strong>, pelo dia da confirmação, em{' '}
                {REGUA_LABEL[regua].toLowerCase()} · meta e régua vêm de{' '}
                <Link to={`${ROUTE_PATHS.ADMIN_USUARIOS}?tab=metas`} className="underline underline-offset-2">
                  Usuários › Metas
                </Link>
                , já descontada a ausência ({trabalhados} de {uteis} dias úteis trabalhados) · clique
                num card para ver os degraus, o ritmo necessário e quem puxa a equipe.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Pessoas ─────────────────────────────────────────────────── */}
      {(visitadas.has('pessoas') || abaVisivel === 'pessoas') && (
        <div className={cn(abaVisivel !== 'pessoas' && 'hidden')}>
          <AbaPessoas
            pessoas={pessoasNaTela}
            porPessoa={porPessoa}
            automacao={automacao}
            resumo={total.resumo}
            pessoasQueVenderam={total.pessoasQueVenderam}
            regua={regua}
            carregando={carregandoTudo}
            cadastroDisponivel={placar.disponivel}
          />
        </div>
      )}

      {/* ── Aba: Quartis ─────────────────────────────────────────────────── */}
      {(visitadas.has('quartis') || abaVisivel === 'quartis') && (
        <div className={cn(abaVisivel !== 'quartis' && 'hidden')}>
          <QuartisComercial
            pessoas={pessoasNaTela}
            resumoPorPessoa={resumoPorPessoa}
            metas={metas}
            presencaPorRecorte={placar.presencaPorRecorte}
            regua={regua}
            uteis={uteis}
            trabalhados={trabalhados}
          />
        </div>
      )}

      {/* ── Aba: Gráfico de vendas ───────────────────────────────────────── */}
      {(visitadas.has('grafico') || abaVisivel === 'grafico') && (
        <div className={cn(abaVisivel !== 'grafico' && 'hidden')}>
          {carregandoTudo ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando as vendas do mês…
            </div>
          ) : (
            <EvolucaoVendas
              serie={serie}
              // Sempre em dinheiro: o eixo do gráfico é reais, e uma meta em
              // quantidade desenhada nele passaria rente ao chão.
              metaDiaria={andamentoDoRecorte?.ritmoValor?.porDia ?? null}
              diaDeHoje={noMesAtual ? Number(getTodayISO().slice(8, 10)) : null}
              eixo="confirmacao"
            />
          )}
        </div>
      )}

      {/* ── Aba: Desafios ────────────────────────────────────────────────── */}
      {abasInternas.some(a => a.key === 'desafios')
        && (visitadas.has('desafios') || abaVisivel === 'desafios') && (
        <div className={cn(abaVisivel !== 'desafios' && 'hidden')}>
          <Suspense fallback={
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          }>
            <DesafiosComercial embutido />
          </Suspense>
        </div>
      )}
    </div>
  );
}

// ─── Aba Pessoas ──────────────────────────────────────────────────────────────

interface AbaPessoasProps {
  pessoas: readonly PessoaComAusencia[];
  porPessoa: ReadonlyMap<string, LinhaDoPlacar>;
  automacao: readonly LinhaDoPlacar[];
  resumo: ResumoVendas;
  pessoasQueVenderam: number;
  regua: ReguaMeta;
  carregando: boolean;
  cadastroDisponivel: boolean;
}

const RESUMO_VAZIO = resumirVendas([]);

/**
 * A tabela por pessoa — o lugar que os Quartis ocupam na cobrança.
 *
 * O aviso âmbar do alto é a fila de assinatura: nos Quartis ele lista o que
 * falta resolver antes de ler a tabela, e aqui o que falta resolver é
 * exatamente isso. «Falta de assinatura do contrato» é o maior motivo de
 * cancelamento do relatório — é venda feita que ainda pode ser perdida.
 */
function AbaPessoas({
  pessoas, porPessoa, automacao, resumo, pessoasQueVenderam, regua, carregando,
  cadastroDisponivel,
}: AbaPessoasProps) {
  const [filaAberta, setFilaAberta] = useState(true);

  const linhas = useMemo(() => pessoas
    .map(p => ({ pessoa: p, r: porPessoa.get(p.id)?.resumo ?? RESUMO_VAZIO }))
    .sort((a, b) => {
      const d = medir(b.r, regua) - medir(a.r, regua);
      return d !== 0 ? d : a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR');
    }), [pessoas, porPessoa, regua]);

  const fila = linhas.filter(l => l.r.porGaveta.pendente_assinatura > 0);
  const valorNaFila = fila.reduce((s, l) => s + l.r.valorPorGaveta.pendente_assinatura, 0);
  const semVenda = linhas.filter(l => l.r.quantidade === 0).length;
  const comAusencia = pessoas.filter(p => p.diasAbatidos > 0).length;

  const totalConfirmado = GAVETAS_EM_ORDEM.reduce((s, g) => s + resumo.porGaveta[g], 0);

  if (carregando) {
    return (
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded-xl" />)}
      </div>
    );
  }

  // Agrupa por setor, como os Quartis. Com um setor só o grupo é um só.
  const grupos = new Map<string, { nome: string; linhas: typeof linhas }>();
  for (const l of linhas) {
    const id = l.pessoa.setor_id ?? '__sem_setor__';
    const g = grupos.get(id);
    if (g) g.linhas.push(l);
    else grupos.set(id, { nome: l.pessoa.setor_nome ?? 'Sem setor', linhas: [l] });
  }

  return (
    <div className="space-y-4">
      {fila.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 overflow-hidden">
          <button
            type="button"
            onClick={() => setFilaAberta(v => !v)}
            aria-expanded={filaAberta}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-amber-500/10"
          >
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span className="text-[12px] font-semibold text-foreground">
              {fila.length} {fila.length === 1 ? 'pessoa' : 'pessoas'} com venda esperando assinatura
              {' · '}{formatBRL(valorNaFila)}
            </span>
            <span className="hidden sm:inline text-[11px] text-muted-foreground">
              o maior motivo de cancelamento do relatório
            </span>
            <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              filaAberta && 'rotate-180')} />
          </button>
          {filaAberta && (
            <div className="border-t border-amber-500/30 divide-y divide-border/60">
              {fila.map(({ pessoa, r }) => (
                <div key={pessoa.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                    {pessoa.nome}
                  </span>
                  {pessoa.equipe_nome && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{pessoa.equipe_nome}</span>
                  )}
                  <span className="shrink-0 text-[11px] tabular-nums text-amber-700 dark:text-amber-400">
                    {r.porGaveta.pendente_assinatura} {r.porGaveta.pendente_assinatura === 1 ? 'venda' : 'vendas'}
                  </span>
                  <span className="w-28 shrink-0 text-right text-[12px] font-semibold tabular-nums font-mono">
                    {formatBRL(r.valorPorGaveta.pendente_assinatura)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {linhas.length === 0 && automacao.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {cadastroDisponivel
            ? 'Nenhuma pessoa no seu alcance para este recorte.'
            : 'O cadastro não respondeu — ver o aviso acima.'}
        </p>
      ) : (
        <div className="flex flex-col xl:flex-row gap-4 items-start">
          {/* ── A tabela ───────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-4 w-full">
            {[...grupos].map(([sid, g]) => (
              <div key={sid} className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  {g.nome}
                </p>
                <TabelaPessoas linhas={g.linhas} regua={regua} total={resumo} />
              </div>
            ))}

            {automacao.length > 0 && (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  <Bot className="w-3 h-3" /> Automação — soma no setor, fora da disputa
                </p>
                <div className="rounded-xl border border-border bg-card overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {automacao.map(l => (
                        <tr key={l.operadorId} className="border-t border-border/50 first:border-t-0">
                          <td className="px-2 py-1.5 font-medium">{l.nome}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-mono text-muted-foreground">
                            {l.resumo.quantidade} {l.resumo.quantidade === 1 ? 'venda' : 'vendas'}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-mono font-semibold w-32">
                            {formatBRL(l.resumo.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ── A distribuição ─────────────────────────────────────────── */}
          <div className="w-full xl:w-72 shrink-0 space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
              Onde as vendas pararam
            </p>
            <div className="rounded-xl border border-border bg-card p-3 space-y-3">
              <div className="space-y-2">
                {GAVETAS_EM_ORDEM.map(g => {
                  const qtd = resumo.porGaveta[g];
                  const parte = totalConfirmado > 0 ? Math.round((qtd / totalConfirmado) * 100) : 0;
                  return (
                    <div key={g} className="flex items-center gap-2">
                      <PontoDaLegenda cor={COR_DA_GAVETA[g]} />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{GAVETA_LABELS[g]}</span>
                      <span className="text-[11px] tabular-nums font-mono text-muted-foreground">{parte}%</span>
                      <span className="w-6 text-right text-[11px] tabular-nums font-mono font-bold"
                        style={{ color: corTexto(COR_DA_GAVETA[g]) }}>
                        {qtd}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-1.5 border-t border-border pt-2.5 text-[11px]">
                <p className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Gente que vendeu</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {pessoasQueVenderam} de {pessoas.length}
                  </span>
                </p>
                <p className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Sem venda na régua</span>
                  <span className="font-mono font-semibold tabular-nums">{semVenda}</span>
                </p>
                <p className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Com ausência no mês</span>
                  <span className="font-mono font-semibold tabular-nums">{comAusencia}</span>
                </p>
                <p className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Devolução · cancelamento</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {pct(resumo.pctDevolucao)} · {pct(resumo.pctCancelamento)}
                  </span>
                </p>
              </div>
              {comAusencia > 0 && (
                <p className="border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
                  O detalhe de cada ausência e os feedbacks estão em{' '}
                  <Link to={`${ROUTE_PATHS.ADMIN_USUARIOS}?tab=acompanhamento`} className="underline underline-offset-2">
                    Usuários › Acompanhamento
                  </Link>.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabelaPessoas({
  linhas, regua, total,
}: {
  linhas: readonly { pessoa: PessoaComAusencia; r: ResumoVendas }[];
  regua: ReguaMeta;
  total: ResumoVendas;
}) {
  const base = medir(total, regua);
  return (
    <div className="rounded-xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className="text-left  px-2 py-1.5 font-semibold text-muted-foreground">PESSOA</th>
            <th className="text-left  px-2 py-1.5 font-semibold text-muted-foreground">EQUIPE</th>
            <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">VENDAS</th>
            <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground">FATURAMENTO</th>
            <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground"
              title="Faturamento ÷ vendas na régua">TICKET</th>
            <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground"
              title="Confirmadas e ainda não assinadas">SEM ASSINAR</th>
            <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground"
              title="Devolução · cancelamento, sobre o que foi confirmado">DEV · CANC</th>
            <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground"
              title="Dias úteis do mês perdidos em ausência que abate meta">AUSÊNCIA</th>
            <th className="text-right px-2 py-1.5 font-semibold text-muted-foreground"
              title={`Participação no ${regua === 'quantidade' ? 'total de vendas' : 'faturamento'} do recorte`}>%</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ pessoa, r }) => {
            const ticket = ticketMedio(r);
            const parte = base > 0 ? Math.round((medir(r, regua) / base) * 1000) / 10 : null;
            const perdeu = (r.pctDevolucao ?? 0) + (r.pctCancelamento ?? 0) > 0;
            return (
              <tr key={pessoa.id} className="border-t border-border/50 hover:bg-accent/30">
                <td className="px-2 py-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {pessoa.foto_url ? (
                      <img src={pessoa.foto_url} alt=""
                        className="w-5 h-5 rounded-full object-cover border border-border/60 shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0">
                        {pessoa.nome.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium truncate max-w-[170px]" title={pessoa.nome}>
                      {pessoa.nome}
                    </span>
                    {/* Sem o rótulo, o desligado se leria como alguém da equipe
                        que não vendeu, e o líder cobraria um ausente. */}
                    {pessoa.situacao === 'desligado' && (
                      <span className="shrink-0 rounded px-1 text-[9px] font-semibold bg-muted text-muted-foreground"
                        title="A venda dele continua contando no total">
                        desligado
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1 text-muted-foreground truncate max-w-[130px]" title={pessoa.equipe_nome ?? ''}>
                  {pessoa.equipe_nome ?? '—'}
                </td>
                <td className={cn('px-2 py-1 text-right tabular-nums font-mono',
                  regua === 'quantidade' && 'font-semibold')}>
                  {r.quantidade}
                </td>
                <td className={cn('px-2 py-1 text-right tabular-nums font-mono',
                  regua === 'valor' && 'font-semibold')}>
                  {r.quantidade === 0 ? '—' : formatBRL(r.valor)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums font-mono text-muted-foreground">
                  {ticket === null ? '—' : formatBRL(ticket)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums font-mono">
                  {r.porGaveta.pendente_assinatura > 0 ? (
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {r.porGaveta.pendente_assinatura}
                    </span>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-2 py-1 text-right tabular-nums font-mono text-muted-foreground">
                  {perdeu ? `${pct(r.pctDevolucao)} · ${pct(r.pctCancelamento)}` : '—'}
                </td>
                <td className="px-2 py-1 text-right tabular-nums font-mono text-muted-foreground">
                  {pessoa.diasAbatidos > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <UserMinus className="w-3 h-3" />
                      {pessoa.diasAbatidos.toString().replace('.', ',')}d
                    </span>
                  ) : '—'}
                </td>
                <td className="px-2 py-1 text-right tabular-nums font-mono font-bold">
                  {parte === null || parte === 0 ? '—' : `${parte.toLocaleString('pt-BR')}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
