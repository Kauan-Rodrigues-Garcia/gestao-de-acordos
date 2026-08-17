/**
 * FormasPagamento — aba "Formas de pagamento" do Analítico (visão líder+).
 *
 * Responde, sobre o MESMO dinheiro que os cards do topo da aba já mostram, uma
 * pergunta que só existia no ERP: **por onde ele entrou** — Pix, Pix Automático,
 * Boleto, Cartão, Cartão Recorrente — e como isso muda por período, por equipe e
 * por operador.
 *
 * ## Como se encaixa na lógica da aba
 *
 * • O MÊS e o SETOR continuam sendo os da página — este painel não tem seletor
 *   próprio para eles, senão a tela passaria a ter dois meses em foco.
 * • A EQUIPE é o mesmo estado que Ranking e Destaques já usam: escolher aqui
 *   mantém a escolha ao trocar de aba.
 * • Quem conta em cada recorte é `useEscopoAnalitico` — a mesma função que dá o
 *   número do card "Total recebido", com clone, setor alternativo e origens
 *   tiradas do acumulado. Nada é recontado por conta própria aqui.
 * • Os dados são as linhas agregadas de `fn_analitico_dashboard_mes_json`, já
 *   compartilhadas com o dashboard pelo React Query: abrir esta aba não custa
 *   uma consulta nova quando o mês já foi carregado.
 *
 * ## Desenho
 *
 * Os cards por forma SÃO o filtro: clicar num deles recorta o gráfico, a tabela
 * e o total, sem abrir menu nenhum — é o gesto que o líder já tenta fazer ao
 * olhar a tela. A cor de cada forma é a de `lib/formasPagamento`, a mesma do
 * Painel Diretoria, para que "Pix" seja o mesmo verde em qualquer painel.
 */

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Users, User, CalendarDays, X, Copy, Filter, AlertTriangle, Layers3,
  ArrowUpRight, ArrowDownRight, Sparkles, ListFilter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePickerField } from '@/components/DatePickerField';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { copiarTexto } from '@/lib/clipboard';
import { corDaForma, iconeDaForma } from '@/lib/formasPagamento';
import {
  deslocarMes, primeiroDiaDoMes, ultimoDiaDoMes, rotuloDoMes,
} from '@/lib/mesReferencia';
import { getTodayISO } from '@/lib/index';
import { useAnaliticoDashboard } from '@/hooks/useAnaliticoDashboard';
import { useEscopoAnalitico } from '@/hooks/useEscopoAnalitico';
import { useAxisColors } from '@/hooks/useChartColors';
import { CustomTooltip } from '@/components/AnalyticsPanel/SubComponents';
import type {
  EquipeAnalitico, ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import { filtrarResumos, type VinculosOperador } from './agregacaoLider';
import {
  agregarFormas, somaDasFormas, ordenarGrupos, insightsFormas,
  periodoEhMesTodo, formatarShare, montarTextoResumoFormas,
  CHAVE_SEM_OPERADOR,
  type FiltroTabulacaoFormas, type GrupoFormas,
} from './agregacaoFormas';

/** Quantas linhas da tabela cruzada aparecem antes do "carregar mais". */
const LINHAS_PAGE = 20;

const TABULACOES: { valor: FiltroTabulacaoFormas; label: string }[] = [
  { valor: 'todas',        label: 'Toda a tabulação' },
  { valor: 'tabulado',     label: 'Só tabulado' },
  { valor: 'nao_tabulado', label: 'Só não tabulado' },
  { valor: 'divergente',   label: 'Só divergente' },
];

interface FormasPagamentoProps {
  empresaId: string;
  mes: string;
  /** Setor em foco na página. `null` = empresa inteira. */
  setorId?: string | null;
  setorNome?: string;
  isPaguePlay: boolean;
  /** H.O. só existe no relatório PaguePlay. */
  mostrarHO: boolean;
  /** Equipes já recortadas pelo setor em foco. */
  equipes: EquipeAnalitico[];
  /** Resumo por operador do mês — dá nome (e existência) aos operadores. */
  resumos: ResumoOperadorAnalitico[];
  vinculos: VinculosOperador;
  /** Filtro de equipe compartilhado com Ranking/Destaques. */
  equipeId: string | null;
  onEquipeChange: (equipeId: string | null) => void;
}

export function FormasPagamento({
  empresaId, mes, setorId, setorNome, isPaguePlay, mostrarHO,
  equipes, resumos, vinculos, equipeId, onEquipeChange,
}: FormasPagamentoProps) {
  const { tickColor, gridColor } = useAxisColors();

  const [inicio,      setInicio]      = useState('');
  const [fim,         setFim]         = useState('');
  const [operadorId,  setOperadorId]  = useState<string | null>(null);
  const [tabulacao,   setTabulacao]   = useState<FiltroTabulacaoFormas>('todas');
  const [formasSel,   setFormasSel]   = useState<Set<string>>(new Set());
  const [agrupamento, setAgrupamento] = useState<'operador' | 'equipe'>('operador');
  const [visiveis,    setVisiveis]    = useState(LINHAS_PAGE);

  const mesAnterior   = deslocarMes(mes, -1);
  // Comparar só faz sentido com o mês inteiro na tela: metade de agosto contra
  // julho fechado seria uma queda inventada pelo próprio recorte.
  const compararAtivo = periodoEhMesTodo(mes, inicio || null, fim || null);

  const atual    = useAnaliticoDashboard(true, mes);
  const anterior = useAnaliticoDashboard(compararAtivo, mesAnterior);

  // Setor, equipe e operador viram UM escopo — a mesma regra do card do topo.
  const { escopo, pendente } = useEscopoAnalitico({
    ativo: true, empresaId, isPaguePlay, setorId, equipeId, operadorId, mes,
    linhas: atual.linhas,
  });

  // ── Nomes ────────────────────────────────────────────────────────────────
  const operadoresDoRecorte = useMemo(
    () => filtrarResumos(resumos, { setorId, equipeId }, vinculos),
    [resumos, setorId, equipeId, vinculos],
  );

  const dadosDoOperador = useMemo(() => {
    const m = new Map<string, { nome: string; usuario: string }>();
    for (const r of resumos) {
      m.set(r.operador_id, {
        nome: r.operador_nome ?? r.operador_usuario,
        usuario: r.operador_usuario,
      });
    }
    return m;
  }, [resumos]);

  const rotulos = useMemo(() => ({
    nomeOperador:     (id: string) => dadosDoOperador.get(id)?.nome ?? 'Operador sem cadastro',
    usuarioOperador:  (id: string) => dadosDoOperador.get(id)?.usuario ?? '',
    equipeDoOperador: (id: string) => vinculos.operadorEquipeMap[id]?.equipe_nome ?? 'Sem equipe',
  }), [dadosDoOperador, vinculos]);

  // ── Agregações ───────────────────────────────────────────────────────────
  const detalhe = useMemo(() => {
    if (!escopo) return null;
    return agregarFormas(
      atual.linhas, escopo,
      { inicio: inicio || null, fim: fim || null, tabulacao },
      rotulos, mes,
    );
  }, [atual.linhas, escopo, inicio, fim, tabulacao, rotulos, mes]);

  /**
   * Mês anterior para a variação por forma.
   *
   * O escopo é o do mês EM FOCO (é o que está resolvido na tela). Para setor
   * somado por usuários isso significa comparar com a composição de hoje — a
   * mesma aproximação que o Painel Diretoria já faz na sua variação, e o rodapé
   * do painel diz que a comparação é entre meses inteiros.
   */
  const detalheAnterior = useMemo(() => {
    if (!escopo || !compararAtivo || anterior.linhas.length === 0) return null;
    return agregarFormas(anterior.linhas, escopo, { tabulacao }, rotulos, mesAnterior);
  }, [anterior.linhas, escopo, compararAtivo, tabulacao, rotulos, mesAnterior]);

  const brutoAnteriorPorForma = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of detalheAnterior?.formas ?? []) m.set(f.rotulo, f.bruto);
    return m;
  }, [detalheAnterior]);

  const frases = useMemo(
    () => (detalhe ? insightsFormas(detalhe, detalheAnterior) : []),
    [detalhe, detalheAnterior],
  );

  /**
   * A seleção que vale, já cruzada com o que o recorte tem.
   *
   * Trocar o período depois de escolher uma forma pode deixar a escolhida fora
   * do recorte; sem este cruzamento a tela ficaria vazia sem dizer por quê —
   * então uma seleção que não sobrou nada equivale a "todas".
   */
  const selecao = useMemo<ReadonlySet<string> | null>(() => {
    if (formasSel.size === 0) return null;
    const presentes = new Set((detalhe?.rotulos ?? []).filter(r => formasSel.has(r)));
    return presentes.size > 0 ? presentes : null;
  }, [formasSel, detalhe]);

  /** Formas que o gráfico e a tabela desenham: a seleção, ou todas. */
  const formasVisiveis = useMemo(() => {
    const todas = detalhe?.rotulos ?? [];
    if (!selecao) return todas;
    return todas.filter(r => selecao.has(r));
  }, [detalhe, selecao]);

  const totalSelecionado = useMemo(() => {
    if (!detalhe) return 0;
    if (!selecao) return detalhe.total;
    return detalhe.formas
      .filter(f => selecao.has(f.rotulo))
      .reduce((s, f) => s + f.bruto, 0);
  }, [detalhe, selecao]);

  const grupos = useMemo(() => {
    if (!detalhe) return [] as GrupoFormas[];
    return ordenarGrupos(
      agrupamento === 'operador' ? detalhe.porOperador : detalhe.porEquipe,
      selecao,
    );
  }, [detalhe, agrupamento, selecao]);

  // Séries do gráfico por chave posicional (f0, f1…): rótulo do ERP pode ter
  // ponto ("Cartão Cred."), e o Recharts leria o dataKey como caminho aninhado.
  const dadosGrafico = useMemo(() => {
    return (detalhe?.porDia ?? []).map(p => {
      const ponto: Record<string, string | number> = { dia: String(p.dia).padStart(2, '0') };
      formasVisiveis.forEach((rotulo, i) => { ponto[`f${i}`] = p.porForma[rotulo] ?? 0; });
      return ponto;
    });
  }, [detalhe, formasVisiveis]);

  // ── Ações ────────────────────────────────────────────────────────────────
  function alternarForma(rotulo: string) {
    setFormasSel(prev => {
      const next = new Set(prev);
      if (next.has(rotulo)) next.delete(rotulo); else next.add(rotulo);
      return next;
    });
    setVisiveis(LINHAS_PAGE);
  }

  function limparFiltros() {
    setInicio(''); setFim('');
    setOperadorId(null);
    setTabulacao('todas');
    setFormasSel(new Set());
    setVisiveis(LINHAS_PAGE);
  }

  function ultimosSeteDias() {
    const hoje = getTodayISO();
    const dentroDoMes = hoje.slice(0, 7) === mes;
    const base = dentroDoMes ? hoje : ultimoDiaDoMes(mes);
    const de = new Date(base + 'T12:00:00');
    de.setDate(de.getDate() - 6);
    const deIso = de.toISOString().slice(0, 10);
    setInicio(deIso < primeiroDiaDoMes(mes) ? primeiroDiaDoMes(mes) : deIso);
    setFim(base);
  }

  const temFiltro = !!(inicio || fim || operadorId || tabulacao !== 'todas' || formasSel.size > 0);

  const escopoLabel = [
    operadorId ? dadosDoOperador.get(operadorId)?.nome : null,
    equipeId   ? equipes.find(e => e.id === equipeId)?.nome : null,
    setorNome  || null,
  ].filter(Boolean).join(' · ') || 'empresa inteira';

  const periodoLabel = inicio || fim
    ? `${fmtDia(inicio || primeiroDiaDoMes(mes))} a ${fmtDia(fim || ultimoDiaDoMes(mes))}`
    : rotuloDoMes(mes);

  // ── Estados de carregamento e ausência ───────────────────────────────────
  if (!atual.dbAtiva) {
    return (
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          O detalhamento por forma de pagamento depende da função de agregação do
          banco (<span className="font-mono">fn_analitico_dashboard_mes_json</span>),
          que ainda não está aplicada nesta base. Os demais números da aba seguem
          normais.
        </p>
      </div>
    );
  }

  if (!atual.carregado || pendente || !detalhe) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-12 bg-muted rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl" />)}
        </div>
        <div className="h-52 bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <Card className="border-border">
        <CardContent className="p-3 flex items-center gap-x-4 gap-y-2 flex-wrap">
          {/* Mesmo seletor de data do resto do site (Acordos, Painel Líder…):
              calendário em popover, nunca `<input type="date">`. Os limites são
              as pontas do mês em foco — e a ponta já escolhida estreita a outra,
              para não existir "de 20 até 05". */}
          <div className="flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-medium">Período:</span>
            <DatePickerField
              value={inicio}
              onChange={setInicio}
              placeholder="Data início"
              triggerClassName="w-32"
              minDate={primeiroDiaDoMes(mes)}
              maxDate={fim || ultimoDiaDoMes(mes)}
            />
            <span className="text-xs text-muted-foreground">até</span>
            <DatePickerField
              value={fim}
              onChange={setFim}
              placeholder="Data fim"
              triggerClassName="w-32"
              minDate={inicio || primeiroDiaDoMes(mes)}
              maxDate={ultimoDiaDoMes(mes)}
            />
            {(inicio || fim) && (
              <button
                type="button"
                onClick={() => { setInicio(''); setFim(''); }}
                className="h-8 w-8 flex items-center justify-center rounded-md border border-input text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Limpar filtro de data"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground"
              onClick={ultimosSeteDias}>
              7 dias
            </Button>
          </div>

          {equipes.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <select
                value={equipeId ?? ''}
                onChange={e => { onEquipeChange(e.target.value || null); setOperadorId(null); }}
                className="h-8 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Todas as equipes</option>
                {equipes.map(eq => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select
              value={operadorId ?? ''}
              onChange={e => setOperadorId(e.target.value || null)}
              className="h-8 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary max-w-[200px]"
            >
              <option value="">Todos os operadores</option>
              {operadoresDoRecorte.map(r => (
                <option key={r.operador_id} value={r.operador_id}>
                  {r.operador_nome ?? r.operador_usuario}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <ListFilter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select
              value={tabulacao}
              onChange={e => setTabulacao(e.target.value as FiltroTabulacaoFormas)}
              className="h-8 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {TABULACOES.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {temFiltro && (
              <Button size="sm" variant="ghost" className="h-8 px-2 gap-1 text-xs text-muted-foreground"
                onClick={limparFiltros}>
                <X className="w-3 h-3" /> Limpar
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 px-2 gap-1 text-xs"
              disabled={detalhe.total === 0}
              onClick={() => void copiarTexto(
                montarTextoResumoFormas({ detalhe, periodo: periodoLabel, escopoLabel }),
                'Resumo por forma copiado',
              )}>
              <Copy className="w-3 h-3" /> Copiar resumo
            </Button>
          </div>
        </CardContent>
      </Card>

      {detalhe.total === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Nenhum recebimento neste recorte.</p>
          <p className="text-xs mt-1">
            {temFiltro ? 'Solte um dos filtros acima.' : 'O mês ainda não tem relatório importado.'}
          </p>
        </div>
      ) : (
        <>
          {/* ── Cards por forma (clicar = filtrar) ───────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {detalhe.formas.map(f => {
              const cor        = corDaForma(f.rotulo);
              const FormaIcon  = iconeDaForma(f.rotulo);
              const selecionada = formasSel.has(f.rotulo);
              const apagada     = formasSel.size > 0 && !selecionada;
              const base        = brutoAnteriorPorForma.get(f.rotulo);
              const variacao    = base && base > 0 ? ((f.bruto - base) / base) * 100 : null;

              return (
                <button
                  key={f.rotulo}
                  type="button"
                  aria-pressed={selecionada}
                  onClick={() => alternarForma(f.rotulo)}
                  title={
                    selecionada
                      ? `Tirar ${f.rotulo} do recorte`
                      : `Ver só ${f.rotulo} no gráfico e na tabela`
                  }
                  className={cn(
                    'text-left rounded-xl border bg-card p-3 border-l-4 transition-all',
                    'hover:shadow-sm hover:border-border',
                    selecionada && 'ring-2 ring-offset-1 ring-offset-background',
                    apagada && 'opacity-45',
                  )}
                  style={{
                    borderLeftColor: cor,
                    ...(selecionada ? { ['--tw-ring-color' as string]: cor } : {}),
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <FormaIcon className="w-3.5 h-3.5 shrink-0" style={{ color: cor }} />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
                      {f.rotulo}
                    </p>
                  </div>
                  <p className="text-base font-bold font-mono leading-tight mt-1 truncate" style={{ color: cor }}>
                    {formatBRL(f.bruto)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">
                      {formatarShare(f.share)} · {f.qtd.toLocaleString('pt-BR')} registro{f.qtd !== 1 ? 's' : ''}
                    </span>
                    {variacao !== null && Math.abs(variacao) >= 1 && (
                      <span className={cn(
                        'inline-flex items-center gap-0.5 text-[10px] font-semibold',
                        variacao > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                      )}
                        title={`Mês anterior: ${formatBRL(base ?? 0)}`}
                      >
                        {variacao > 0
                          ? <ArrowUpRight className="w-3 h-3" />
                          : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(Math.round(variacao))}%
                      </span>
                    )}
                  </div>
                  {mostrarHO && f.ho > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                      H.O. {formatBRL(f.ho)}
                    </p>
                  )}
                </button>
              );
            })}

            {/* Total do recorte — o card escuro do relatório, em token do tema */}
            <div className="rounded-xl border border-primary bg-primary text-primary-foreground p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                {selecao ? 'Total selecionado' : 'Total do recorte'}
              </p>
              <p className="text-base font-bold font-mono leading-tight mt-1 truncate">
                {formatBRL(totalSelecionado)}
              </p>
              <p className="text-[11px] opacity-80 mt-0.5">
                {detalhe.qtd.toLocaleString('pt-BR')} registros · ticket {formatBRL(detalhe.ticket)}
              </p>
              {selecao && (
                <p className="text-[10px] opacity-70 mt-0.5">
                  de {formatBRL(detalhe.total)} no recorte
                </p>
              )}
            </div>
          </div>

          {/* ── Leitura rápida ──────────────────────────────────────────── */}
          {frases.length > 0 && (
            <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl border border-border bg-muted/30">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {frases.map((f, i) => (
                  <span key={i}>
                    {i > 0 && <span className="opacity-40"> · </span>}
                    <span className="text-foreground">{f}</span>
                  </span>
                ))}
              </p>
            </div>
          )}

          {/* ── Distribuição ────────────────────────────────────────────── */}
          <Card className="border-border">
            <CardHeader className="pb-2 pt-3.5 px-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-sm font-semibold">Distribuição por forma</CardTitle>
                <span className="text-xs text-muted-foreground">
                  Total {formatBRL(detalhe.total)}
                  {detalhe.naoTabulado > 0 && (
                    <> · <span className="text-amber-600 dark:text-amber-400">
                      {formatBRL(detalhe.naoTabulado)} sem tabulação
                    </span></>
                  )}
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {detalhe.formas.map(f => {
                const cor = corDaForma(f.rotulo);
                const parteNaoTabulada = f.bruto > 0 ? (f.naoTabulado / f.bruto) * 100 : 0;
                return (
                  <div key={f.rotulo} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-28 sm:w-36 shrink-0 truncate text-right">
                      {f.rotulo}
                    </span>
                    <div className="flex-1 h-4 rounded-full bg-muted/60 overflow-hidden relative">
                      <div className="h-full rounded-full flex items-center justify-end pr-1.5"
                        style={{ width: `${Math.max(f.share, 1.5)}%`, background: cor }}
                      >
                        <span className="text-[10px] font-bold text-white/95 tabular-nums">
                          {formatarShare(f.share)}
                        </span>
                      </div>
                      {/* Faixa hachurada = pedaço da forma que ainda não foi
                          tabulado. Fica DENTRO da barra para não sugerir que é
                          dinheiro a mais. */}
                      {parteNaoTabulada > 0 && (
                        <div
                          className="absolute top-0 left-0 h-full opacity-40"
                          style={{
                            width: `${Math.max((f.share * parteNaoTabulada) / 100, 0.5)}%`,
                            background:
                              'repeating-linear-gradient(45deg, rgba(255,255,255,.85) 0 3px, transparent 3px 6px)',
                          }}
                          title={`${formatBRL(f.naoTabulado)} sem tabulação`}
                        />
                      )}
                    </div>
                    <span className="text-xs font-mono font-semibold w-24 sm:w-28 text-right shrink-0"
                      style={{ color: cor }}>
                      {formatBRL(f.bruto)}
                    </span>
                    <span className="text-[11px] text-muted-foreground w-14 text-right shrink-0 tabular-nums">
                      {f.qtd.toLocaleString('pt-BR')}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ── Por dia, empilhado por forma ────────────────────────────── */}
          {dadosGrafico.length > 1 && (
            <Card className="border-border">
              <CardHeader className="pb-1 pt-3.5 px-4">
                <div className="flex items-center justify-between gap-x-4 gap-y-1 flex-wrap">
                  <CardTitle className="text-sm font-semibold">Entrada por dia</CardTitle>
                  <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
                    {formasVisiveis.map(rotulo => (
                      <span key={rotulo} className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-[2px]"
                          style={{ background: corDaForma(rotulo) }} />
                        {rotulo}
                      </span>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-3">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dadosGrafico} margin={{ top: 12, right: 14, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 9, fill: tickColor }}
                      stroke="transparent" tickLine={false} axisLine={false}
                      interval="preserveStartEnd" minTickGap={8} />
                    <YAxis tick={{ fontSize: 9, fill: tickColor }} stroke="transparent"
                      tickLine={false} axisLine={false} tickFormatter={formatYAxis} width={50} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: gridColor, fillOpacity: 0.2 }} />
                    {formasVisiveis.map((rotulo, i) => (
                      <Bar
                        key={rotulo}
                        dataKey={`f${i}`}
                        name={rotulo}
                        stackId="formas"
                        fill={corDaForma(rotulo)}
                        maxBarSize={22}
                        // Só a última série arredonda: o topo da pilha é um só.
                        radius={i === formasVisiveis.length - 1 ? [3, 3, 0, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-center text-[10px] text-muted-foreground">
                  {detalhe.diasComRecebimento} dia{detalhe.diasComRecebimento !== 1 ? 's' : ''} com
                  recebimento no período · {periodoLabel}
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Quem recebeu por qual forma ─────────────────────────────── */}
          <Card className="border-border">
            <CardHeader className="pb-2 pt-3.5 px-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-sm font-semibold">
                    {agrupamento === 'operador' ? 'Por operador × forma' : 'Por equipe × forma'}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selecao
                      ? `Somando só ${[...selecao].join(', ')}`
                      : 'Todas as formas do recorte'}
                  </p>
                </div>
                <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-muted/30">
                  {([
                    { key: 'operador', label: 'Operador', Icon: User },
                    { key: 'equipe',   label: 'Equipe',   Icon: Layers3 },
                  ] as const).map(({ key, label, Icon }) => (
                    <button key={key} onClick={() => { setAgrupamento(key); setVisiveis(LINHAS_PAGE); }}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                        agrupamento === key
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 border-t">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                        {agrupamento === 'operador' ? 'OPERADOR' : 'EQUIPE'}
                      </th>
                      {formasVisiveis.map(rotulo => (
                        <th key={rotulo} className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full"
                              style={{ background: corDaForma(rotulo) }} />
                            {rotulo.toUpperCase()}
                          </span>
                        </th>
                      ))}
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">TOTAL</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">FORMA FORTE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {grupos.slice(0, visiveis).map(g => {
                      const total = somaDasFormas(g.porForma, selecao);
                      const forte = formaMaisForte(g, formasVisiveis);
                      const orfa  = g.chave === CHAVE_SEM_OPERADOR;
                      return (
                        <tr key={g.chave} className="hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <span className={cn('font-semibold', orfa && 'text-amber-600 dark:text-amber-400')}>
                              {g.rotulo}
                            </span>
                            {g.detalhe && (
                              <span className="block text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">
                                {g.detalhe}
                              </span>
                            )}
                          </td>
                          {formasVisiveis.map(rotulo => {
                            const valor = g.porForma[rotulo] ?? 0;
                            return (
                              <td key={rotulo} className={cn(
                                'px-3 py-2 text-right font-mono tabular-nums',
                                valor === 0 && 'text-muted-foreground/40',
                              )}>
                                {valor === 0 ? '—' : formatBRL(valor)}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right font-mono font-bold text-primary tabular-nums">
                            {formatBRL(total)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {forte && (
                              <Badge variant="outline" className="text-[10px] font-normal whitespace-nowrap"
                                style={{ borderColor: `${corDaForma(forte.rotulo)}80`, color: corDaForma(forte.rotulo) }}>
                                {forte.rotulo} {formatarShare(forte.share)}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 border-t border-border">
                      <td className="px-3 py-2 font-semibold text-muted-foreground">
                        {grupos.length} {agrupamento === 'operador' ? 'operador' : 'equipe'}
                        {grupos.length !== 1 ? 's' : ''}
                      </td>
                      {formasVisiveis.map(rotulo => (
                        <td key={rotulo} className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                          {formatBRL(detalhe.formas.find(f => f.rotulo === rotulo)?.bruto ?? 0)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-mono font-bold text-primary tabular-nums">
                        {formatBRL(totalSelecionado)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {visiveis < grupos.length && (
                <div className="flex justify-center py-2 border-t border-border">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={() => setVisiveis(v => v + LINHAS_PAGE)}>
                    Carregar mais ({grupos.length - visiveis} restantes)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── De onde vem cada número ─────────────────────────────────── */}
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed px-1">
            <Filter className="w-3 h-3 shrink-0 mt-0.5" />
            <p>
              Relatório analítico de <span className="text-foreground">{periodoLabel}</span> ·
              recorte <span className="text-foreground">{escopoLabel}</span>. Cada linha do
              analítico consolida as parcelas do mesmo cliente/NR e carrega a forma do primeiro
              pagamento — para o pagamento a pagamento, veja a aba{' '}
              <span className="text-foreground">Recebimento diário</span>. Operador clonado
              aparece na equipe de origem; use o filtro de equipe para ver o que conta em cada uma.
              {compararAtivo
                ? ' A variação compara meses inteiros.'
                : ' A variação contra o mês anterior aparece quando o período é o mês todo.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Abrevia no eixo Y — "R$ 205.944,66" por tick não caberia. */
function formatYAxis(v: number): string {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R$${(v / 1_000).toFixed(0)}k`;
  return `R$${v}`;
}

/** 'yyyy-MM-dd' → 'dd/MM'. */
function fmtDia(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/**
 * A forma que mais pesa na linha, entre as visíveis.
 *
 * É a coluna que transforma a tabela em leitura: "esse operador vive de Pix",
 * "essa equipe depende de cartão". Sem ela, cruzar dez colunas de reais com o
 * olho é o trabalho que a tela deveria ter feito.
 */
function formaMaisForte(
  g: GrupoFormas, visiveis: readonly string[],
): { rotulo: string; share: number } | null {
  let melhor: { rotulo: string; valor: number } | null = null;
  let total = 0;
  for (const rotulo of visiveis) {
    const valor = g.porForma[rotulo] ?? 0;
    total += valor;
    if (valor > 0 && (!melhor || valor > melhor.valor)) melhor = { rotulo, valor };
  }
  if (!melhor || total <= 0) return null;
  return { rotulo: melhor.rotulo, share: Math.round((melhor.valor / total) * 1000) / 10 };
}
