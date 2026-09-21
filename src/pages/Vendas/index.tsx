/**
 * Vendas — a aba do Comercial.
 *
 * ## Refeita em 21/09/2026, no desenho da aba Acordos da BookPlay
 *
 * O pedido: «o jeito que a venda é cadastrada é muito arcaico e complicado»,
 * «fica muito espaço sobrando nas linhas», e a aba «tem que ser boa tanto para
 * o líder quanto para o operador». O que mudou, e por quê:
 *
 *   - **Cadastro de dois campos, na própria lista.** NR e valor; o resto chega
 *     pelo relatório, que casa pelo NR e valida a venda sozinho
 *     (`fn_vendas_projetar`). Linha inline no topo da tabela, Enter salva,
 *     «continuar lançando» deixa o cursor no NR. E «Colar várias» para quem
 *     anota o dia numa planilha ou no WhatsApp. Ver `NovaVendaInline`.
 *   - **Tabela com colunas**, e o espaço que sobrava virou informação: vendedor,
 *     as duas datas, pagamento, status, valor, **quanto vale na meta** e
 *     recebido. Ver `TabelaVendas`.
 *   - **Status que diz quem mexe agora.** «Aguardando relatório» (lançada, o
 *     NR ainda não apareceu), «Falta assinatura» (cobrança do líder), «Na
 *     meta». Ver `statusDaLinha` em `@/lib/vendasLista`.
 *   - **Abas por situação** — Todas, Na meta, Pendências, Perdas — e busca por
 *     NR, cliente ou vendedor, como em Acordos.
 *   - **O líder decide na linha**: ✓ confirma e assina, ✎ marca assinado, e o
 *     detalhe (clique na linha) tem cancelar, devolver e voltar para aberta.
 *     A antiga «Fila do líder» virou a aba Pendências — de todos os meses.
 *   - **O operador vê a própria parte**: os cards falam dele, e a meta aparece
 *     como a contribuição dele para a meta da equipe — nunca como se a meta do
 *     setor inteiro fosse medida só com as vendas dele (era o que acontecia).
 *
 * ## Dois eixos, uma consulta
 *
 * A meta conta pela **data de confirmação**; o trabalho do dia, pela **data
 * da venda** (venda lançada hoje ainda não tem confirmação). A tela busca as
 * vendas com QUALQUER das duas datas no mês (`eixo: 'qualquer'`) e separa em
 * memória: os cards e a meta usam o recorte oficial; a lista agrupa pelo eixo
 * escolhido, com «Data da venda» como padrão — antes era «Confirmação», e a
 * venda que o operador acabava de lançar sumia da tela.
 *
 * A régua mora em `@/lib/vendas` e, no banco, em duas colunas geradas. Esta
 * tela nunca a reimplementa.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus, RefreshCw, TriangleAlert, ChevronLeft, ChevronRight, Search, X,
  ShoppingBag, DollarSign, Clock, Zap, Percent, ListChecks, Target,
  Hourglass, Ban, ClipboardPaste, SearchX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { MetricCard } from '@/components/AnalyticsPanel/SubComponents';
import { containerVariants } from '@/components/AnalyticsPanel/constants';
import { EfeitoComemoracao } from '@/components/comemoracao/EfeitoComemoracao';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { useVendas } from '@/hooks/useVendas';
import { useVendasPlacar } from '@/hooks/useVendasPlacar';
import { formatBRL } from '@/lib/money';
import { getTodayISO } from '@/lib/index';
import {
  deslocarMes, ehMesAtual, mesAtual, partesDoMes, rotuloDoMes,
} from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import {
  resumirVendas, agruparPorDia, diaDaVenda, type EixoDaVenda,
} from '@/lib/vendas';
import { abaDaVenda, casaComBusca, type AbaDaLista } from '@/lib/vendasLista';
import { equipeDaVenda } from '@/lib/vendasPlacar';
import { ticketMedio } from '@/lib/vendasDashboard';
import type { Venda } from '@/services/vendas/vendas.service';
import { diasUteisDoMes, diasUteisDecorridos } from '@/lib/diasUteis';
import { buscarMetasDoMes, type MetaDeRecorte } from '@/services/vendas/metasVendas.service';
import { AndamentoDasMetas } from './AndamentoDasMetas';
import { NovaVendaInline, type OpcaoDeVendedor } from './lista/NovaVendaInline';
import { ColarVendas } from './lista/ColarVendas';
import { TabelaVendas } from './lista/TabelaVendas';
import { MinhaParteNaMeta } from './lista/MinhaParteNaMeta';

/** O `Select` do shadcn recusa `value=""`; o «todos» precisa de um valor. */
const TODOS = '__todos__';
/** Quantas linhas antes do «mostrar mais». Um mês do setor cabe inteiro. */
const PASSO = 150;

export default function Vendas() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const [agrupar, setAgrupar] = useState<EixoDaVenda>('venda');
  const [aba, setAba] = useState<AbaDaLista>('todas');
  const [busca, setBusca] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState(TODOS);
  const [filtroEquipe, setFiltroEquipe] = useState(TODOS);
  const [novoAberto, setNovoAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [colarAberto, setColarAberto] = useState(false);
  const [excluindo, setExcluindo] = useState<Venda | null>(null);
  const [limite, setLimite] = useState(PASSO);
  const [festa, setFesta] = useState<string | null>(null);
  const [metas, setMetas] = useState<MetaDeRecorte[]>([]);

  const empresaId = empresa?.id ?? null;
  const {
    vendas, pendentes, carregando, disponivel, erro,
    recarregar, salvar, confirmar, excluir,
  } = useVendas({ empresaId, mes, eixo: 'qualquer', ativo: Boolean(empresaId) });
  const placar = useVendasPlacar({ empresaId, mes, ativo: Boolean(empresaId) });

  /*
   * Quem enxerga mais de uma pessoa ganha coluna de vendedor, filtros de
   * pessoa e equipe, o seletor «em nome de» e o bloco de meta inteiro. Quem
   * tem só `individual` vê a própria carteira — oferecer esses controles a ele
   * seria mostrar botões que não controlam nada.
   */
  const niveis = useMemo(() => niveisLiberados('vendas', temPermissao), [temPermissao]);
  const veAlemDeSi = niveis.some(n => n !== 'individual');

  const podeCriar     = temPermissao('criar_vendas');
  const podeEditar    = temPermissao('editar_vendas');
  const podeExcluir   = temPermissao('excluir_vendas');
  const podeDecidir   = temPermissao('confirmar_vendas');
  const podeVerMetas  = temPermissao('ver_metas_vendas');

  useEffect(() => {
    if (!empresaId || !podeVerMetas) { setMetas([]); return; }
    const { ano, mes: m } = partesDoMes(mes);
    void buscarMetasDoMes(empresaId, ano, m).then(r => setMetas(r.dado ?? []));
  }, [empresaId, mes, podeVerMetas]);

  // Trocar de mês volta a lista ao começo; o filtro de texto fica, porque
  // procurar o mesmo NR em outro mês é justamente o motivo de trocar.
  useEffect(() => { setLimite(PASSO); }, [mes, aba, agrupar]);

  /* ── Os recortes ──────────────────────────────────────────────────────── */

  const noMes = (dia: string) => dia.slice(0, 7) === mes;

  /** O recorte OFICIAL: confirmadas no mês. É dele que saem meta e placar. */
  const oficiais = useMemo(
    () => vendas.filter(v => v.data_confirmacao && noMes(v.data_confirmacao)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendas, mes],
  );

  const hoje = getTodayISO();
  const lancadasHoje = useMemo(() => vendas.filter(v => v.data_venda.slice(0, 10) === hoje), [vendas, hoje]);

  const vendedores = useMemo((): OpcaoDeVendedor[] => {
    if (!veAlemDeSi) return [];
    const lista = placar.pessoas
      .filter(p => !p.robo && p.situacao !== 'desligado')
      .map(p => ({ id: p.id, nome: p.nome, equipe: p.equipe_nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    // Quem está logado é o vendedor padrão do formulário; se o cadastro do
    // placar não o trouxer, o seletor abriria em branco.
    if (perfil?.id && !lista.some(v => v.id === perfil.id)) {
      lista.unshift({ id: perfil.id, nome: `${perfil.nome ?? 'Você'} (você)`, equipe: null });
    }
    return lista;
  }, [placar.pessoas, veAlemDeSi, perfil?.id, perfil?.nome]);

  const equipes = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of placar.pessoas) if (p.equipe_id && p.equipe_nome) mapa.set(p.equipe_id, p.equipe_nome);
    return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [placar.pessoas]);

  const nomeDaEquipe = useMemo(() => new Map(equipes.map(e => [e.id, e.nome])), [equipes]);
  const equipeDe = (v: Venda) => {
    const id = equipeDaVenda(v, placar.indice);
    return id ? nomeDaEquipe.get(id) ?? null : null;
  };

  /** Todas as pessoas que aparecem nas vendas, para o filtro — inclusive desligado e robô. */
  const vendedoresDoFiltro = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const v of [...vendas, ...pendentes]) mapa.set(v.operador_id, v.perfis?.nome ?? 'Sem nome');
    return [...mapa].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [vendas, pendentes]);

  /** NR → de quem é. Para o cadastro avisar antes de o banco recusar. */
  const nrsConhecidos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const v of [...vendas, ...pendentes]) {
      mapa.set(v.nr_documento, `${v.perfis?.nome ?? 'outro vendedor'}, ${v.data_venda.slice(8, 10)}/${v.data_venda.slice(5, 7)}`);
    }
    return mapa;
  }, [vendas, pendentes]);

  const filtrar = (lista: readonly Venda[]) => lista.filter(v =>
    casaComBusca(v, busca)
    && (filtroVendedor === TODOS || v.operador_id === filtroVendedor)
    && (filtroEquipe === TODOS || equipeDaVenda(v, placar.indice) === filtroEquipe));

  /** O mês pelo eixo escolhido para agrupar — é a lista das abas do mês. */
  const doMesNoEixo = useMemo(
    () => vendas.filter(v => noMes(diaDaVenda(v, agrupar))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendas, mes, agrupar],
  );

  const baseDaAba = useMemo(() => {
    if (aba === 'pendencias') return pendentes;
    if (aba === 'todas') return doMesNoEixo;
    return doMesNoEixo.filter(v => abaDaVenda(v) === aba);
  }, [aba, pendentes, doMesNoEixo]);

  const visiveis = useMemo(
    () => filtrar(baseDaAba),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseDaAba, busca, filtroVendedor, filtroEquipe, placar.indice],
  );

  const grupos = useMemo(() => {
    const cortadas = visiveis.slice(0, limite);
    // Pendência agrupa pela data da venda: é a idade da pendência que importa.
    return agruparPorDia(cortadas, aba === 'pendencias' ? 'venda' : agrupar);
  }, [visiveis, limite, aba, agrupar]);

  /* ── Os números ───────────────────────────────────────────────────────── */

  // Os cards respondem ao filtro de pessoa e equipe: um total que não bate
  // com a lista embaixo dele é o defeito que o Fechamento existe para evitar.
  const filtrando = filtroVendedor !== TODOS || filtroEquipe !== TODOS;
  const oficiaisFiltradas = useMemo(
    () => (filtrando ? oficiais.filter(v =>
      (filtroVendedor === TODOS || v.operador_id === filtroVendedor)
      && (filtroEquipe === TODOS || equipeDaVenda(v, placar.indice) === filtroEquipe)) : oficiais),
    [oficiais, filtrando, filtroVendedor, filtroEquipe, placar.indice],
  );
  const resumo = useMemo(() => resumirVendas(oficiaisFiltradas), [oficiaisFiltradas]);
  const ticket = ticketMedio(resumo);
  const aguardando = pendentes.filter(v => v.situacao === 'aberta');
  const semAssinatura = pendentes.filter(v => v.situacao === 'confirmada');
  const valorParado = semAssinatura.reduce((s, v) => s + v.valor_total, 0);
  const valorHoje = lancadasHoje.reduce((s, v) => s + v.valor_total, 0);
  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

  const contagem = useMemo(() => {
    const c = { todas: doMesNoEixo.length, na_meta: 0, pendencias: pendentes.length, perdas: 0 };
    for (const v of doMesNoEixo) {
      const a = abaDaVenda(v);
      if (a === 'na_meta') c.na_meta += 1;
      if (a === 'perdas') c.perdas += 1;
    }
    return c;
  }, [doMesNoEixo, pendentes]);

  const abas: AbaSegmentada<AbaDaLista>[] = [
    { key: 'todas',      label: `Todas (${contagem.todas})`, Icon: ListChecks },
    { key: 'na_meta',    label: `Na meta (${contagem.na_meta})`, Icon: Target },
    { key: 'pendencias', label: 'Pendências', Icon: Hourglass, badge: contagem.pendencias },
    { key: 'perdas',     label: `Perdas (${contagem.perdas})`, Icon: Ban },
  ];

  const { uteis, trabalhados } = useMemo(() => {
    const { ano, mes: m } = partesDoMes(mes);
    return { uteis: diasUteisDoMes(ano, m), trabalhados: diasUteisDecorridos(ano, m, [], hoje) };
  }, [mes, hoje]);

  /* ── Ações ────────────────────────────────────────────────────────────── */

  const comemorar = () => setFesta(String(Date.now()));
  useEffect(() => {
    if (!festa) return;
    const t = setTimeout(() => setFesta(null), 4500);
    return () => clearTimeout(t);
  }, [festa]);

  async function confirmarExclusao() {
    const v = excluindo;
    setExcluindo(null);
    if (!v) return;
    const r = await excluir(v.id, null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir a venda.'); return; }
    toast.success(`Venda ${v.nr_documento} na lixeira. Sete dias para restaurar.`);
  }

  const temFiltros = Boolean(busca.trim()) || filtrando;
  const limparFiltros = () => { setBusca(''); setFiltroVendedor(TODOS); setFiltroEquipe(TODOS); };
  const colSpan = veAlemDeSi ? 12 : 11;
  const operadorPadrao = perfil?.id ?? '';
  const eu = placar.pessoas.find(p => p.id === perfil?.id) ?? null;

  const vazio = (
    <div className="flex flex-col items-center gap-3 text-muted-foreground">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60">
        {temFiltros ? <SearchX className="h-6 w-6 opacity-40" /> : <Clock className="h-6 w-6 opacity-40" />}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground/70">
          {temFiltros ? 'Nenhuma venda com esses filtros'
            : aba === 'pendencias' ? 'Nada pendente — tudo validado'
            : `Nenhuma venda em ${rotuloDoMes(mes)}`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">
          {temFiltros ? 'Tente ajustar a busca ou os filtros.'
            : podeCriar ? 'Lance a primeira: só NR e valor.' : ''}
        </p>
      </div>
      {temFiltros ? (
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={limparFiltros}>
          <X className="h-3.5 w-3.5" /> Limpar filtros
        </Button>
      ) : podeCriar && disponivel && aba !== 'pendencias' && (
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setNovoAberto(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova venda
        </Button>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {festa && <EfeitoComemoracao efeito="confete" id={festa} />}

        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
              <ShoppingBag className="h-5 w-5 text-primary" aria-hidden /> Vendas
            </h1>
            <div className="mt-2 flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-6 w-6" aria-label="Mês anterior"
                onClick={() => setMes(deslocarMes(mes, -1))}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="min-w-[110px] text-center text-xs font-semibold capitalize text-muted-foreground">
                {rotuloDoMes(mes)}
              </span>
              <Button variant="outline" size="icon" className="h-6 w-6" aria-label="Próximo mês"
                onClick={() => setMes(deslocarMes(mes, 1))}>
                <ChevronRight className="h-3 w-3" />
              </Button>
              {!ehMesAtual(mes) && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => setMes(mesAtual())}>
                  Mês atual
                </Button>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {carregando && vendas.length === 0
                ? 'Carregando…'
                : veAlemDeSi
                  ? `${doMesNoEixo.length} venda${doMesNoEixo.length === 1 ? '' : 's'} no mês`
                  : `Suas vendas · ${doMesNoEixo.length} no mês`}
              {podeDecidir && pendentes.length > 0 && aba !== 'pendencias' && (
                <button type="button" onClick={() => setAba('pendencias')}
                  className="ml-2 font-medium text-warning hover:underline">
                  · {pendentes.length} esperando você
                </button>
              )}
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={recarregar}
              disabled={carregando} aria-label="Recarregar" title="Recarregar">
              <RefreshCw className={cn('h-3.5 w-3.5', carregando && 'animate-spin')} />
            </Button>
            {podeCriar && disponivel && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setColarAberto(true)}>
                  <ClipboardPaste className="h-3.5 w-3.5" /> Colar várias
                </Button>
                <Button size="sm"
                  onClick={() => { setEditandoId(null); setNovoAberto(v => !v); if (aba === 'pendencias') setAba('todas'); }}
                  className={cn('gap-1.5 shadow-sm',
                    novoAberto && 'border border-border bg-muted text-foreground hover:bg-muted/80')}>
                  <Plus className={cn('h-4 w-4 transition-transform', novoAberto && 'rotate-45')} />
                  {novoAberto ? 'Fechar' : 'Nova venda'}
                </Button>
              </>
            )}
          </div>
        </div>

        {!disponivel && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div>
              A aba Vendas não respondeu. <strong>Recarregue a página</strong> — se persistir, confira se a
              migration <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">20260915100000_vendas_fase1.sql</code>
              está aplicada.
            </div>
          </div>
        )}
        {erro && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{erro}
          </div>
        )}

        {/* ── Os números do mês ─────────────────────────────────────────── */}
        <motion.div
          variants={containerVariants} initial="hidden" animate="visible"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <MetricCard
            label={veAlemDeSi ? 'Na meta' : 'Suas vendas na meta'}
            value={resumo.quantidade}
            icon={<Target className="h-4 w-4" />} accentColor="#22c55e" gradientFrom="#22c55e"
            sub="confirmadas e assinadas no mês"
          />
          <MetricCard
            label="Faturamento na meta" value={formatBRL(resumo.valor)}
            icon={<DollarSign className="h-4 w-4" />} accentColor="#6366f1" gradientFrom="#6366f1"
            sub={ticket !== null ? `ticket médio ${formatBRL(ticket)}` : 'o que conta para a meta'}
          />
          <MetricCard
            label="Vendas de hoje" value={lancadasHoje.length}
            icon={<Zap className="h-4 w-4" />} accentColor="#0ea5e9" gradientFrom="#0ea5e9"
            sub={lancadasHoje.length > 0 ? formatBRL(valorHoje) : 'nenhuma ainda'}
          />
          <MetricCard
            label="Pendências" value={pendentes.length}
            icon={<Hourglass className="h-4 w-4" />} accentColor="#f59e0b" gradientFrom="#f59e0b"
            sub={`${aguardando.length} aguardando · ${semAssinatura.length} sem assinatura${valorParado > 0 ? ` (${formatBRL(valorParado)})` : ''}`}
          />
          <MetricCard
            label="Devolução / cancel." value={`${pct(resumo.pctDevolucao)} / ${pct(resumo.pctCancelamento)}`}
            icon={<Percent className="h-4 w-4" />} accentColor="#ef4444"
            sub={`${resumo.porGaveta.devolvida} devolvida${resumo.porGaveta.devolvida === 1 ? '' : 's'} · ${resumo.porGaveta.cancelada} cancelada${resumo.porGaveta.cancelada === 1 ? '' : 's'}`}
          />
        </motion.div>

        {/* ── A meta ────────────────────────────────────────────────────── */}
        {veAlemDeSi ? (
          <AndamentoDasMetas
            vendas={oficiais} metas={metas} eixo="confirmacao"
            uteis={uteis} trabalhados={trabalhados}
            pessoas={placar.indice.size > 0 ? placar.indice : undefined}
            presencaPorRecorte={placar.presencaPorRecorte}
          />
        ) : (
          <MinhaParteNaMeta
            metas={metas} eu={eu} resumo={resumirVendas(oficiais)}
            uteis={uteis} trabalhados={trabalhados}
          />
        )}

        {/* ── Filtros ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <AbasSegmentadas<AbaDaLista> abas={abas} ativa={aba} onTrocar={setAba} rotulo="Situação das vendas" />
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar NR, cliente ou vendedor"
              className="h-8 pl-8 text-xs" aria-label="Buscar venda"
            />
          </div>
          {veAlemDeSi && vendedoresDoFiltro.length > 1 && (
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Filtrar por vendedor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os vendedores</SelectItem>
                {vendedoresDoFiltro.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {veAlemDeSi && equipes.length > 1 && (
            <Select value={filtroEquipe} onValueChange={setFiltroEquipe}>
              <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Filtrar por equipe"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas as equipes</SelectItem>
                {equipes.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {aba !== 'pendencias' && (
            <Select value={agrupar} onValueChange={v => setAgrupar(v as EixoDaVenda)}>
              <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Agrupar por"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="venda">Pelo dia da venda</SelectItem>
                <SelectItem value="confirmacao">Pelo dia da confirmação</SelectItem>
              </SelectContent>
            </Select>
          )}
          {temFiltros && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted-foreground" onClick={limparFiltros}>
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          )}
        </div>

        {aba === 'pendencias' && (
          <p className="text-[11px] text-muted-foreground">
            Pendência de <strong className="text-foreground">qualquer mês</strong>: venda lançada que o relatório
            ainda não validou, e venda confirmada sem contrato assinado — o maior motivo de cancelamento.
          </p>
        )}

        {/* ── A tabela ──────────────────────────────────────────────────── */}
        <Card className="border-border">
          <CardContent className="p-0">
            {carregando && vendas.length === 0 && pendentes.length === 0 ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <TabelaVendas
                    grupos={grupos} colSpan={colSpan}
                    mostrarVendedor={veAlemDeSi} equipeDe={equipeDe}
                    podeEditar={podeEditar} podeExcluir={podeExcluir} podeDecidir={podeDecidir}
                    editandoId={editandoId}
                    renderEdicao={v => (
                      <NovaVendaInline
                        key={`editar-${v.id}`} colSpan={colSpan} venda={v}
                        operadorPadrao={operadorPadrao} vendedores={vendedores}
                        nrsConhecidos={nrsConhecidos} onSalvar={salvar}
                        onFechar={() => setEditandoId(null)}
                      />
                    )}
                    onEditar={v => { setNovoAberto(false); setEditandoId(v.id); }}
                    onExcluir={setExcluindo}
                    onDecidir={confirmar}
                    topo={novoAberto && podeCriar ? (
                      <NovaVendaInline
                        colSpan={colSpan} operadorPadrao={operadorPadrao}
                        vendedores={vendedores} nrsConhecidos={nrsConhecidos}
                        onSalvar={salvar} onFechar={() => setNovoAberto(false)}
                        onColar={() => setColarAberto(true)} onLancou={comemorar}
                      />
                    ) : null}
                    vazio={vazio}
                  />
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {visiveis.length > limite && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setLimite(l => l + PASSO)}>
              Mostrar mais ({visiveis.length - limite} restantes)
            </Button>
          </div>
        )}
      </div>

      <ColarVendas
        aberto={colarAberto} onFechar={() => setColarAberto(false)}
        operadorPadrao={operadorPadrao} vendedores={vendedores}
        nrsConhecidos={nrsConhecidos} onSalvar={salvar}
        onLancou={comemorar}
      />

      <AlertDialog open={excluindo !== null} onOpenChange={o => { if (!o) setExcluindo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a venda {excluindo?.nr_documento}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela vai para a lixeira e sai do placar. Dá para restaurar por sete dias.
              {excluindo?.origem === 'geral' && ' Como veio do relatório oficial, a próxima importação do geral a traz de volta.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmarExclusao()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
