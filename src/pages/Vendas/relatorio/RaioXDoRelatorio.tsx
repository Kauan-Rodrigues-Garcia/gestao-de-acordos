/**
 * RaioXDoRelatorio — tudo o que o relatório de prospecção traz, numa tela.
 *
 * ## O pedido
 *
 * «Na parte de importar vendas gostaria de saber tudo que está no relatório,
 * igual o Painel Diretoria da BookPlay.» A importação mostrava cinco números
 * e escondia o resto do arquivo. Aqui aparece cada coluna que o ERP manda,
 * fatiada: vendedor, franquia, setor, estado, forma de recebimento, produto,
 * categoria, tipo de venda e de produto, documento, parcelas, lead, score,
 * SPC, motivo e setor do cancelamento — mais a evolução dia a dia e a lista
 * inteira, com busca e download.
 *
 * ## Os filtros valem para a tela inteira
 *
 * Escolher uma franquia, um setor ou uma situação refaz TODAS as fatias,
 * como no recorte do Painel Diretoria. Um card que não obedece ao filtro do
 * alto é um número que ninguém sabe de onde veio.
 *
 * ## Serve a prévia e o mês
 *
 * O mesmo componente desenha o arquivo ANTES de gravar (na Importação) e o
 * lote gravado (na aba «Relatório do mês»). As contas são as de
 * `@/lib/vendasRelatorio`, que não sabem de onde a linha veio.
 *
 * Cores em hex, nunca `hsl(var(--x))`: as variáveis do tema são `oklch`, e o
 * gráfico apaga sem erro (ver §8 de COMERCIAL-ESTADO-E-PENDENCIAS).
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  FileSpreadsheet, DollarSign, Target, Receipt, Wallet, Undo2, Ban, Megaphone, Timer,
  Search, Download, ChevronDown, Users, Building2, MapPin, CreditCard, Package,
  Tags, Layers, FileText, CalendarRange, Gauge, ShieldAlert, Filter, X, AlertOctagon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MetricCard } from '@/components/AnalyticsPanel/SubComponents';
import { containerVariants } from '@/components/AnalyticsPanel/constants';
import { useAxisColors } from '@/hooks/useChartColors';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  classificarVenda, GAVETAS_EM_ORDEM, GAVETA_LABELS, type GavetaVenda,
} from '@/lib/vendas';
import {
  raioXDoRelatorio, soNaoInformado, chaveDoNomeDaFranquia,
  type Fatia, type LinhaDoRelatorio,
} from '@/lib/vendasRelatorio';
import { normalizarTexto } from '@/lib/vendasLista';

const TODOS = '__todos__';
const POR_PAGINA = 50;

/** Hex das gavetas — o tema é oklch e o recharts não o lê. */
const COR_GAVETA: Record<GavetaVenda, string> = {
  na_meta: '#22c55e',
  pendente_assinatura: '#f59e0b',
  aberta: '#94a3b8',
  devolvida: '#f97316',
  cancelada: '#ef4444',
};

interface Props {
  linhas: readonly LinhaDoRelatorio[];
  /** Franquia → setor. Monte com `mapaDeSetorDaFranquia`. */
  setorDaFranquia?: ReadonlyMap<string, string>;
  /** Nome do arquivo baixado. */
  nomeDoArquivo?: string;
}

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`);

export function RaioXDoRelatorio({ linhas, setorDaFranquia, nomeDoArquivo = 'relatorio-vendas' }: Props) {
  const [franquia, setFranquia] = useState(TODOS);
  const [setor, setSetor] = useState(TODOS);
  const [gaveta, setGaveta] = useState<GavetaVenda | typeof TODOS>(TODOS);
  const [busca, setBusca] = useState('');

  // A prévia do setor não traz o código da franquia, só o nome: casa pelos dois.
  const setorDe = (l: LinhaDoRelatorio) =>
    setorDaFranquia?.get(String(l.codigo_franquia ?? ''))
    ?? setorDaFranquia?.get(chaveDoNomeDaFranquia(l.franquia))
    ?? 'Sem setor';

  const opcoesFranquia = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const l of linhas) {
      const chave = String(l.codigo_franquia ?? l.franquia ?? '');
      if (chave) mapa.set(chave, `${l.codigo_franquia ? `${l.codigo_franquia} · ` : ''}${l.franquia ?? ''}`);
    }
    return [...mapa].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [linhas]);

  const opcoesSetor = useMemo(() => {
    if (!setorDaFranquia) return [];
    return [...new Set(linhas.map(setorDe))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, setorDaFranquia]);

  const filtradas = useMemo(() => {
    const termo = normalizarTexto(busca);
    return linhas.filter(l =>
      (franquia === TODOS || String(l.codigo_franquia ?? l.franquia ?? '') === franquia)
      && (setor === TODOS || setorDe(l) === setor)
      && (gaveta === TODOS || classificarVenda(l) === gaveta)
      && (!termo
        || l.nr_documento.includes(termo)
        || normalizarTexto(l.cliente).includes(termo)
        || normalizarTexto(l.nome_vendedor).includes(termo)
        || normalizarTexto(l.login_vendedor).includes(termo)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, franquia, setor, gaveta, busca, setorDaFranquia]);

  const r = useMemo(() => raioXDoRelatorio(filtradas), [filtradas]);
  const setores = useMemo(
    () => (setorDaFranquia
      ? raioXPorSetor(filtradas, setorDe)
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtradas, setorDaFranquia],
  );

  const filtrando = franquia !== TODOS || setor !== TODOS || gaveta !== TODOS || Boolean(busca.trim());
  const limpar = () => { setFranquia(TODOS); setSetor(TODOS); setGaveta(TODOS); setBusca(''); };
  const cobertura = r.valorNaRegua > 0 ? r.recebido / r.valorNaRegua : null;

  async function baixar() {
    try {
      const { utils, write } = await import('@e965/xlsx');
      const ws = utils.json_to_sheet(filtradas.map(l => ({
        NR: l.nr_documento,
        Cliente: l.cliente ?? '',
        Vendedor: l.nome_vendedor ?? '',
        Login: l.login_vendedor ?? '',
        'Cód. franquia': l.codigo_franquia ?? '',
        Franquia: l.franquia ?? '',
        Setor: setorDaFranquia ? setorDe(l) : '',
        'Data venda': l.data_venda ? formatDate(l.data_venda) : '',
        'Data confirmação': l.data_confirmacao ? formatDate(l.data_confirmacao) : '',
        UF: l.uf ?? '',
        Situação: GAVETA_LABELS[classificarVenda(l)],
        Assinado: l.contrato_assinado ? 'Sim' : 'Não',
        'Valor total': Number(l.valor_total) || 0,
        'Na régua': classificarVenda(l) === 'na_meta' ? Number(l.valor_total) || 0 : 0,
        Recebido: Number(l.valor_recebido) || 0,
        Entrada: l.valor_entrada ?? '',
        Parcelas: l.qtde_parcela ?? '',
        'Valor parcela': l.valor_parcela ?? '',
        'Forma de recebimento': l.tipo_recebimento ?? '',
        Documento: l.tipo_documento ?? '',
        Produto: l.produto ?? '',
        Categoria: l.categoria ?? '',
        'Tipo de venda': l.tipo_venda ?? '',
        'Tipo de produto': l.tipo_produto ?? '',
        Lead: l.veio_de_lead == null ? '' : l.veio_de_lead ? 'Sim' : 'Não',
        Score: l.score_classe ?? '',
        'SPC/Serasa': l.spc_serasa ?? '',
        Motivo: l.motivo ?? '',
        'Setor do cancelamento': l.setor_cancelamento ?? '',
        Cancelamento: l.data_cancelamento ? formatDate(l.data_cancelamento) : '',
        Devolução: l.data_devolucao ? formatDate(l.data_devolucao) : '',
      })));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Relatório');
      const buffer = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nomeDoArquivo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${filtradas.length} linhas na planilha.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar a planilha.');
    }
  }

  if (linhas.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">O relatório não tem linhas.</p>;
  }

  return (
    <div className="space-y-4">
      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {opcoesSetor.length > 1 && (
          <Select value={setor} onValueChange={setSetor}>
            <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Setor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os setores</SelectItem>
              {opcoesSetor.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {opcoesFranquia.length > 1 && (
          <Select value={franquia} onValueChange={setFranquia}>
            <SelectTrigger className="h-8 w-[260px] text-xs" aria-label="Franquia"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas as franquias ({opcoesFranquia.length})</SelectItem>
              {opcoesFranquia.map(([k, rot]) => <SelectItem key={k} value={k}>{rot}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={gaveta} onValueChange={v => setGaveta(v as GavetaVenda | typeof TODOS)}>
          <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Situação"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as situações</SelectItem>
            {GAVETAS_EM_ORDEM.map(g => <SelectItem key={g} value={g}>{GAVETA_LABELS[g]}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="NR, cliente ou vendedor" className="h-8 pl-8 text-xs" aria-label="Buscar no relatório" />
        </div>
        {filtrando && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={limpar}>
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {filtradas.length} de {linhas.length} linhas
        </span>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void baixar()}
          disabled={filtradas.length === 0}>
          <Download className="h-3.5 w-3.5" /> Baixar planilha
        </Button>
      </div>

      {/* ── Os números ──────────────────────────────────────────────────── */}
      <motion.div variants={containerVariants} initial="hidden" animate="visible"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <MetricCard label="Linhas" value={r.linhas} icon={<FileSpreadsheet className="h-4 w-4" />}
          accentColor="#64748b" sub={`${r.vendedores.length} vendedores · ${r.franquias.length} franquias`} />
        <MetricCard label="Faturamento bruto" value={formatBRL(r.faturamento)} icon={<DollarSign className="h-4 w-4" />}
          accentColor="#6366f1" gradientFrom="#6366f1" sub="tudo o que o arquivo traz" />
        <MetricCard label="Na régua" value={formatBRL(r.valorNaRegua)} icon={<Target className="h-4 w-4" />}
          accentColor="#22c55e" gradientFrom="#22c55e" sub={`${r.naRegua} vendas confirmadas e assinadas`} />
        <MetricCard label="Ticket médio" value={r.ticketMedio !== null ? formatBRL(r.ticketMedio) : '—'}
          icon={<Receipt className="h-4 w-4" />} accentColor="#0ea5e9" sub="na régua" />
        <MetricCard label="Recebido" value={formatBRL(r.recebido)} icon={<Wallet className="h-4 w-4" />}
          accentColor="#14b8a6" sub={cobertura !== null ? `${pct(cobertura)} do que está na régua` : 'nada na régua'} />
        <MetricCard label="Devolução" value={pct(r.pctDevolucao)} icon={<Undo2 className="h-4 w-4" />}
          accentColor="#f97316" sub={`${r.porGaveta.devolvida.linhas} · ${formatBRL(r.porGaveta.devolvida.valor)}`} />
        <MetricCard label="Cancelamento" value={pct(r.pctCancelamento)} icon={<Ban className="h-4 w-4" />}
          accentColor="#ef4444" sub={`${r.porGaveta.cancelada.linhas} · ${formatBRL(r.porGaveta.cancelada.valor)}`} />
        <MetricCard label="Sem assinatura" value={r.porGaveta.pendente_assinatura.linhas}
          icon={<AlertOctagon className="h-4 w-4" />} accentColor="#f59e0b"
          sub={`${formatBRL(r.porGaveta.pendente_assinatura.valor)} parado fora da régua`} />
        {r.pctLead !== null && (
          <MetricCard label="Vieram de lead" value={pct(r.pctLead)} icon={<Megaphone className="h-4 w-4" />}
            accentColor="#a855f7" sub="das linhas do arquivo" />
        )}
        {r.diasAteConfirmar !== null && (
          <MetricCard label="Venda → confirmação" value={`${r.diasAteConfirmar.toFixed(1).replace('.', ',')} dias`}
            icon={<Timer className="h-4 w-4" />} accentColor="#64748b" sub="em média" />
        )}
      </motion.div>

      <BarraDasGavetas porGaveta={r.porGaveta} total={r.linhas} />

      <GraficoDiario pontos={r.porDia} />

      {/* ── As fatias ───────────────────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <CardDeFatias titulo="Vendedores" Icon={Users} fatias={r.vendedores} total={r.valorNaRegua} limite={10} />
        <CardDeFatias titulo="Franquias" Icon={Building2} fatias={r.franquias} total={r.valorNaRegua} />
        {setores.length > 0 && (
          <CardDeFatias titulo="Setores (pelo vínculo da franquia)" Icon={Layers} fatias={setores} total={r.valorNaRegua} />
        )}
        <CardDeFatias titulo="Estados" Icon={MapPin} fatias={r.estados} total={r.valorNaRegua} />
        <CardDeFatias titulo="Forma de recebimento" Icon={CreditCard} fatias={r.formas} total={r.valorNaRegua} />
        <CardDeFatias titulo="Parcelas" Icon={CalendarRange} fatias={r.parcelas} total={r.valorNaRegua} />
        <CardDeFatias titulo="Produtos" Icon={Package} fatias={r.produtos} total={r.valorNaRegua} />
        <CardDeFatias titulo="Categoria" Icon={Tags} fatias={r.categorias} total={r.valorNaRegua} />
        <CardDeFatias titulo="Tipo de venda" Icon={Tags} fatias={r.tiposVenda} total={r.valorNaRegua} />
        <CardDeFatias titulo="Tipo de produto" Icon={Package} fatias={r.tiposProduto} total={r.valorNaRegua} />
        <CardDeFatias titulo="Tipo de documento" Icon={FileText} fatias={r.documentos} total={r.valorNaRegua} />
        <CardDeFatias titulo="Origem da venda" Icon={Megaphone} fatias={r.lead} total={r.valorNaRegua} />
        <CardDeFatias titulo="Score" Icon={Gauge} fatias={r.scores} total={r.valorNaRegua} />
        <CardDeFatias titulo="SPC / Serasa" Icon={ShieldAlert} fatias={r.spc} total={r.valorNaRegua} />
        <CardDeFatias titulo="Setor que cancelou / devolveu" Icon={Ban} fatias={r.setoresCancelamento}
          total={r.porGaveta.devolvida.valor + r.porGaveta.cancelada.valor} perdas />
        <CardDeMotivos motivos={r.motivos} />
      </div>

      <ListaDoRelatorio linhas={filtradas} setorDe={setorDaFranquia ? setorDe : undefined} />
    </div>
  );
}

/** Setor pelo vínculo da franquia — a mesma fatia, com outra chave. */
function raioXPorSetor(linhas: readonly LinhaDoRelatorio[], setorDe: (l: LinhaDoRelatorio) => string): Fatia[] {
  const porSetor = new Map<string, LinhaDoRelatorio[]>();
  for (const l of linhas) {
    const s = setorDe(l);
    const lista = porSetor.get(s);
    if (lista) lista.push(l); else porSetor.set(s, [l]);
  }
  return [...porSetor].map(([nome, ls]) => {
    const x = raioXDoRelatorio(ls);
    return {
      chave: nome, rotulo: nome, linhas: x.linhas, faturamento: x.faturamento,
      naRegua: x.naRegua, valorNaRegua: x.valorNaRegua, recebido: x.recebido,
      devolvidas: x.porGaveta.devolvida.linhas, canceladas: x.porGaveta.cancelada.linhas,
      semAssinatura: x.porGaveta.pendente_assinatura.linhas,
    };
  }).sort((a, b) => b.valorNaRegua - a.valorNaRegua || b.faturamento - a.faturamento);
}

function BarraDasGavetas({
  porGaveta, total,
}: { porGaveta: Record<GavetaVenda, { linhas: number; valor: number }>; total: number }) {
  if (total === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-bold text-foreground">Onde as vendas estão</h3>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {GAVETAS_EM_ORDEM.map(g => porGaveta[g].linhas > 0 && (
          <div key={g} style={{ width: `${(porGaveta[g].linhas / total) * 100}%`, background: COR_GAVETA[g] }}
            title={`${GAVETA_LABELS[g]}: ${porGaveta[g].linhas}`} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {GAVETAS_EM_ORDEM.map(g => (
          <div key={g} className="flex items-start gap-2">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_GAVETA[g] }} />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">{GAVETA_LABELS[g]}</p>
              <p className="text-sm font-semibold tabular-nums">{porGaveta[g].linhas}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{formatBRL(porGaveta[g].valor)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GraficoDiario({ pontos }: { pontos: ReturnType<typeof raioXDoRelatorio>['porDia'] }) {
  const { tickColor, gridColor } = useAxisColors();
  if (pontos.length < 2) return null;
  const dados = pontos.map(p => ({ ...p, rotulo: `${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}` }));
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Dia a dia</h3>
        <span className="text-[11px] text-muted-foreground">
          barra: faturamento na régua · linha: vendas no dia (pela confirmação)
        </span>
      </div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: tickColor }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="v" tick={{ fontSize: 10, fill: tickColor }} tickLine={false} axisLine={false}
              tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} width={40} />
            <YAxis yAxisId="q" orientation="right" tick={{ fontSize: 10, fill: tickColor }} tickLine={false}
              axisLine={false} width={28} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 12 }}
              formatter={(valor: number, nome: string) =>
                (nome === 'Na régua' ? [formatBRL(valor), nome] : [valor, nome])}
            />
            <Bar yAxisId="v" dataKey="valorNaRegua" name="Na régua" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Line yAxisId="q" dataKey="linhas" name="Vendas" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function CardDeFatias({
  titulo, Icon, fatias, total, limite = 8, perdas = false,
}: {
  titulo: string;
  Icon: React.ComponentType<{ className?: string }>;
  fatias: readonly Fatia[];
  /** Base da barra de participação. */
  total: number;
  limite?: number;
  /** Fatia de perdas: a barra é pelo faturamento, não pela régua. */
  perdas?: boolean;
}) {
  const [todas, setTodas] = useState(false);
  if (soNaoInformado(fatias)) return null;
  const mostradas = todas ? fatias : fatias.slice(0, limite);
  const valorDe = (f: Fatia) => (perdas ? f.faturamento : f.valorNaRegua);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon className="h-4 w-4 text-muted-foreground" /> {titulo}
        </h3>
        <span className="text-[11px] text-muted-foreground">{fatias.length}</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-1.5 text-left font-medium"> </th>
              <th className="px-2 py-1.5 text-right font-medium">Linhas</th>
              <th className="px-2 py-1.5 text-right font-medium">{perdas ? 'Valor' : 'Na régua'}</th>
              <th className="w-[28%] px-3 py-1.5 text-left font-medium">Parte</th>
              <th className="px-3 py-1.5 text-right font-medium" title="Devolvidas + canceladas">Perdas</th>
            </tr>
          </thead>
          <tbody>
            {mostradas.map(f => {
              const parte = total > 0 ? valorDe(f) / total : 0;
              return (
                <tr key={f.chave} className="border-t border-border/50">
                  <td className="max-w-[220px] px-3 py-1.5">
                    <p className="truncate font-medium text-foreground" title={f.rotulo}>{f.rotulo}</p>
                    {f.detalhe && <p className="truncate font-mono text-[10px] text-muted-foreground">{f.detalhe}</p>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {f.linhas}
                    {!perdas && f.naRegua !== f.linhas && (
                      <span className="text-muted-foreground"> ({f.naRegua})</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{formatBRL(valorDe(f))}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', perdas ? 'bg-destructive/70' : 'bg-primary/70')}
                          style={{ width: `${Math.min(parte * 100, 100)}%` }} />
                      </div>
                      <span className="w-10 text-right tabular-nums text-[10px] text-muted-foreground">
                        {(parte * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className={cn('px-3 py-1.5 text-right tabular-nums',
                    f.devolvidas + f.canceladas > 0 ? 'text-destructive' : 'text-muted-foreground/60')}>
                    {f.devolvidas + f.canceladas || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {fatias.length > limite && (
        <button type="button" onClick={() => setTodas(v => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-border py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground">
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', todas && 'rotate-180')} />
          {todas ? 'Mostrar menos' : `Ver todos (${fatias.length})`}
        </button>
      )}
    </section>
  );
}

function CardDeMotivos({ motivos }: { motivos: ReturnType<typeof raioXDoRelatorio>['motivos'] }) {
  const [todos, setTodos] = useState(false);
  if (motivos.length === 0) return null;
  const mostrados = todos ? motivos : motivos.slice(0, 8);
  const maior = Math.max(...motivos.map(m => m.canceladas + m.devolvidas));
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card lg:col-span-2">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <AlertOctagon className="h-4 w-4 text-muted-foreground" /> Por que as vendas caíram
        </h3>
        <span className="text-[11px] text-muted-foreground">{motivos.length} motivos</span>
      </header>
      <div className="divide-y divide-border/50">
        {mostrados.map(m => {
          const n = m.canceladas + m.devolvidas;
          return (
            <div key={m.motivo} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2 text-xs sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto]">
              <p className="truncate font-medium" title={m.motivo}>{m.motivo}</p>
              <div className="hidden h-1.5 overflow-hidden rounded-full bg-muted sm:block">
                <div className="h-full rounded-full bg-destructive/70" style={{ width: `${(n / maior) * 100}%` }} />
              </div>
              <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                {m.canceladas > 0 && <>{m.canceladas} canc.</>}
                {m.canceladas > 0 && m.devolvidas > 0 && ' · '}
                {m.devolvidas > 0 && <>{m.devolvidas} dev.</>}
              </span>
              <span className="whitespace-nowrap text-right font-mono">{formatBRL(m.valor)}</span>
            </div>
          );
        })}
      </div>
      {motivos.length > 8 && (
        <button type="button" onClick={() => setTodos(v => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-border py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground">
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', todos && 'rotate-180')} />
          {todos ? 'Mostrar menos' : `Ver todos (${motivos.length})`}
        </button>
      )}
    </section>
  );
}

function ListaDoRelatorio({
  linhas, setorDe,
}: { linhas: readonly LinhaDoRelatorio[]; setorDe?: (l: LinhaDoRelatorio) => string }) {
  const [pagina, setPagina] = useState(0);
  const paginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas - 1);
  const mostradas = linhas.slice(atual * POR_PAGINA, (atual + 1) * POR_PAGINA);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> Linha a linha
        </h3>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" disabled={atual === 0}
            onClick={() => setPagina(atual - 1)}>Anterior</Button>
          <span className="tabular-nums">{atual + 1} / {paginas}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" disabled={atual >= paginas - 1}
            onClick={() => setPagina(atual + 1)}>Próxima</Button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">NR</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Vendedor</th>
              <th className="px-3 py-2">Franquia</th>
              {setorDe && <th className="px-3 py-2">Setor</th>}
              <th className="px-3 py-2">Venda</th>
              <th className="px-3 py-2">Confirm.</th>
              <th className="px-3 py-2">UF</th>
              <th className="px-3 py-2">Forma</th>
              <th className="px-3 py-2 text-right">Parc.</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Recebido</th>
              <th className="px-3 py-2">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {mostradas.map((l, i) => {
              const g = classificarVenda(l);
              return (
                <tr key={`${l.nr_documento}-${i}`} className={cn('border-b border-border/40', i % 2 === 0 && 'bg-muted/10')}>
                  <td className="px-3 py-1.5 font-mono">{l.nr_documento}</td>
                  <td className="max-w-[180px] truncate px-3 py-1.5">{l.cliente || '—'}</td>
                  <td className="max-w-[160px] truncate px-3 py-1.5" title={l.login_vendedor ?? ''}>{l.nome_vendedor || l.login_vendedor || '—'}</td>
                  <td className="max-w-[180px] truncate px-3 py-1.5 text-muted-foreground" title={l.franquia ?? ''}>{l.franquia || '—'}</td>
                  {setorDe && <td className="max-w-[140px] truncate px-3 py-1.5 text-muted-foreground">{setorDe(l)}</td>}
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-muted-foreground">{formatDate(l.data_venda)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-muted-foreground">{l.data_confirmacao ? formatDate(l.data_confirmacao) : '—'}</td>
                  <td className="px-3 py-1.5">{l.uf || '—'}</td>
                  <td className="max-w-[140px] truncate px-3 py-1.5 text-muted-foreground">{l.tipo_recebimento || '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.qtde_parcela ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px]">
                      <span className="h-2 w-2 rounded-full" style={{ background: COR_GAVETA[g] }} />
                      {GAVETA_LABELS[g]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatBRL(Number(l.valor_total) || 0)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-muted-foreground">{formatBRL(Number(l.valor_recebido) || 0)}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 text-muted-foreground" title={l.motivo ?? ''}>{l.motivo || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
