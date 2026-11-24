/**
 * AgendadosOperadores.tsx — aba «Agendados» do Painel Líder (23/11/2026).
 *
 * «O que a minha gente tem para receber, e quando?» Três blocos, do geral ao
 * miúdo:
 *
 *   1. O período em números: agendado, pago, a verificar, não pago, conversão —
 *      e, no mês corrente, o que vem pela frente (hoje, amanhã, próximos dias).
 *   2. O calendário do mês: uma coluna por dia, nos três estados. Clicar num dia
 *      recorta a aba inteira naquele dia.
 *   3. Pessoa a pessoa, por setor. Abrir a linha traz a lista dos acordos dela.
 *
 * Os modelos foram os painéis de cobrança do mercado (promessas «vence hoje /
 * amanhã / próximos dias», quebras e taxa de cumprimento por cobrador), com as
 * regras DESTE sistema por cima — ver o cabeçalho de `services/agendados`.
 *
 * Regra Cofen e Nosso produto são carteiras diferentes e não se somam: com as
 * duas no recorte, a aba pergunta qual mostrar.
 */
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CalendarClock, CalendarX2, ChevronDown, ChevronRight, ExternalLink,
  Loader2, RefreshCw, Search, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VinculoTag } from '@/components/VinculoTag';
import type { Acordo } from '@/lib/supabase';
import { tabelaSemTipo } from '@/lib/supabaseSemTipo';
import { cn } from '@/lib/utils';
import {
  formatCurrency, getTodayISO, STATUS_COLORS, STATUS_LABELS, STATUS_LABELS_PAGUEPLAY,
  TIPO_LABELS, TIPO_LABELS_PAGUEPLAY,
} from '@/lib/index';
import { ehMesAtual, primeiroDiaDoMes, rotuloDoMes, ultimoDiaDoMes } from '@/lib/mesReferencia';
import { ehRegraDoSetor, ROTULO_REGRA, type RegraDoSetor } from '@/lib/regraDoSetor';
import { estadoDoAcordo } from '@/lib/desempenhoDia';
import {
  agendaVazia, distribuirPorSetor, intervaloDaConsulta, janelaDe, ordenarPessoas,
  pessoasNoEscopo, porDia, resumir,
  type DiaAgenda, type FontesAgenda, type GrupoSetor, type LinhaAgenda, type OperadorBase,
  type OrdemAgenda, type PessoaAgenda, type ResumoAgenda, type Soma,
} from '@/services/agendados/agendados';
import {
  buscarAgenda, buscarAgendaDaPessoa, type AcordoDaAgenda,
} from '@/services/agendados/agendados.service';

interface Props {
  empresaId: string;
  mes: string;
  /** As pessoas que o painel já carregou (a RLS e o escopo decidiram quem). */
  operadores: readonly OperadorBase[];
  /** A composição do mês. `null` enquanto carrega. */
  fontes: FontesAgenda | null;
  setorIds: readonly string[];
  equipeIds: readonly string[];
  /** Os setores na ordem do admin, com o nome do mês olhado. */
  setores: readonly { id: string; nome: string }[];
  /** Regra de reserva do setor sem a coluna lida: a da empresa. */
  isPP: boolean;
  /** Sobe com o botão de recarregar do cabeçalho do painel. */
  recarregarKey: number;
}

// ─── Formatação ──────────────────────────────────────────────────────────────

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function rotuloDoDia(iso: string, hoje: string): string {
  const j = janelaDe(hoje);
  if (iso === j.hoje) return 'hoje';
  if (iso === j.amanha) return 'amanhã';
  return `${DIAS_SEMANA[diaDaSemana(iso)]} ${ddmm(iso)}`;
}

/** R$ sem centavos nos números grandes: o líder lê de relance, não confere. */
function brlCurto(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v);
}

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

/** As palavras de cada regra: «Verificar» é «Pendente» na Cofen. */
function vocabulario(regra: RegraDoSetor) {
  const cofen = regra === 'cofen';
  return {
    aVerificar: cofen ? 'Pendente' : 'A verificar',
    status: cofen ? STATUS_LABELS_PAGUEPLAY : STATUS_LABELS,
    tipo: cofen ? TIPO_LABELS_PAGUEPLAY : TIPO_LABELS,
  };
}

// ─── Peças ───────────────────────────────────────────────────────────────────

/** Os três estados numa barra só — mesmas cores do Desempenho do Dia. */
function BarraTresEstados({ r, className }: { r: Pick<ResumoAgenda, 'pago' | 'aVerificar' | 'naoPago' | 'total'>; className?: string }) {
  const total = r.total.valor;
  if (total <= 0) return <div className={cn('h-2 rounded-full bg-muted', className)} />;
  const partes = [
    { k: 'pago', v: r.pago.valor, c: 'bg-success' },
    { k: 'ver', v: r.aVerificar.valor, c: 'bg-warning' },
    { k: 'nao', v: r.naoPago.valor, c: 'bg-destructive' },
  ].filter(p => p.v > 0);
  return (
    <div className={cn('flex h-2 gap-[2px] rounded-full overflow-hidden bg-muted', className)}>
      {partes.map(p => (
        <div key={p.k} className={cn('h-full first:rounded-l-full last:rounded-r-full', p.c)}
          style={{ width: `${(p.v / total) * 100}%` }} />
      ))}
    </div>
  );
}

function Legenda({ aVerificar }: { aVerificar: string }) {
  const itens = [
    { c: 'bg-success', t: 'Pago' },
    { c: 'bg-warning', t: aVerificar },
    { c: 'bg-destructive', t: 'Não pago' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {itens.map(i => (
        <span key={i.t} className="inline-flex items-center gap-1.5">
          <span className={cn('w-2.5 h-2.5 rounded-sm', i.c)} /> {i.t}
        </span>
      ))}
    </div>
  );
}

const COR_DESTAQUE = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
} as const;

function Numero({ rotulo, soma, dica, destaque, children }: {
  rotulo: string; soma: Soma; dica?: string; destaque?: keyof typeof COR_DESTAQUE;
  children?: ReactNode;
}) {
  return (
    <div className="bg-card p-4 sm:p-5 min-w-0" title={dica}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {destaque && <span className={cn('w-2 h-2 rounded-sm', COR_DESTAQUE[destaque])} />}
        {rotulo}
      </p>
      <p className="mt-2 font-mono tabular-nums font-bold text-xl sm:text-2xl leading-none whitespace-nowrap">
        {brlCurto(soma.valor)}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{plural(soma.qtd, 'acordo', 'acordos')}</p>
      {children}
    </div>
  );
}

function Avatar({ p }: { p: PessoaAgenda }) {
  if (p.foto) return <img src={p.foto} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" loading="lazy" />;
  const iniciais = p.nome.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  return (
    <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
      {iniciais || '?'}
    </span>
  );
}

/** Uma célula «qtd · R$» da tabela. Vazio vira traço, que se lê mais rápido que zero. */
function Celula({ s, sub, forte }: { s: Soma; sub?: string | null; forte?: boolean }) {
  if (s.qtd === 0) return <span className="text-muted-foreground/60">—</span>;
  return (
    <div className="leading-tight">
      <div className={cn('font-mono tabular-nums whitespace-nowrap', forte && 'font-semibold')}>
        {brlCurto(s.valor)}
      </div>
      <div className="text-[11px] text-muted-foreground whitespace-nowrap">
        {plural(s.qtd, 'acordo', 'acordos')}{sub ? ` · ${sub}` : ''}
      </div>
    </div>
  );
}

function Conversao({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted-foreground/60" title="Nada com desfecho ainda">—</span>;
  const cor = v >= 70 ? 'text-success' : v >= 50 ? 'text-warning' : 'text-destructive';
  return <span className={cn('font-mono tabular-nums font-semibold', cor)}>{v}%</span>;
}

// ─── Calendário ──────────────────────────────────────────────────────────────

function Calendario({ dias, hoje, selecionado, onSelecionar, aVerificar }: {
  dias: DiaAgenda[];
  hoje: string;
  selecionado: string | null;
  onSelecionar: (dia: string | null) => void;
  aVerificar: string;
}) {
  const [foco, setFoco] = useState<string | null>(null);
  const maior = Math.max(1, ...dias.map(d => d.total.valor));
  const leitura = dias.find(d => d.dia === (foco ?? selecionado)) ?? null;
  const ALTURA = 112;

  return (
    <section className="rounded-3xl border border-border bg-card shadow-sm p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Calendário do mês</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Valor agendado por dia de vencimento. Clique num dia para ver só ele.
          </p>
        </div>
        <Legenda aVerificar={aVerificar} />
      </div>

      <div className="mt-5 flex items-end gap-[3px] sm:gap-1" style={{ height: ALTURA + 22 }}
        onMouseLeave={() => setFoco(null)}>
        {dias.map(d => {
          const h = d.total.qtd ? Math.max(4, Math.round((d.total.valor / maior) * ALTURA)) : 0;
          const fimDeSemana = [0, 6].includes(diaDaSemana(d.dia));
          const eHoje = d.dia === hoje;
          const ativo = selecionado === d.dia;
          const partes = [
            { v: d.pago.valor, c: 'bg-success' },
            { v: d.aVerificar.valor, c: 'bg-warning' },
            { v: d.naoPago.valor, c: 'bg-destructive' },
          ].filter(p => p.v > 0);
          return (
            <button key={d.dia} type="button"
              onClick={() => onSelecionar(ativo ? null : d.dia)}
              onMouseEnter={() => setFoco(d.dia)}
              onFocus={() => setFoco(d.dia)}
              onBlur={() => setFoco(null)}
              aria-pressed={ativo}
              aria-label={`${rotuloDoDia(d.dia, hoje)}: ${plural(d.total.qtd, 'acordo', 'acordos')}, ${formatCurrency(d.total.valor)}`}
              className={cn(
                'group relative flex-1 min-w-0 h-full flex flex-col justify-end items-stretch rounded-md',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ativo ? 'bg-primary/10' : 'hover:bg-muted/60',
                selecionado && !ativo && 'opacity-45',
              )}
            >
              <div className="flex flex-col-reverse gap-[2px] px-[1px]" style={{ height: h }}>
                {partes.map((p, i) => (
                  <div key={i} className={cn(p.c, 'w-full', i === partes.length - 1 ? 'rounded-t-[4px]' : 'rounded-[1px]')}
                    style={{ flexGrow: p.v, flexBasis: 0, minHeight: 2 }} />
                ))}
              </div>
              <span className={cn(
                'mt-1 h-[18px] text-center text-[10px] tabular-nums leading-[18px] rounded',
                eHoje ? 'bg-primary text-primary-foreground font-bold'
                  : fimDeSemana ? 'text-muted-foreground/50' : 'text-muted-foreground',
                // No celular, só os dias ímpares levam número (e hoje, sempre).
                !eHoje && Number(d.dia.slice(8)) % 2 === 0 && 'max-sm:text-transparent',
              )}>
                {Number(d.dia.slice(8))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 min-h-[20px] text-xs" aria-live="polite">
        {leitura ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold capitalize">{rotuloDoDia(leitura.dia, hoje)}</span>
            <span className="font-mono tabular-nums">{formatCurrency(leitura.total.valor)}</span>
            <span className="text-muted-foreground">{plural(leitura.total.qtd, 'acordo', 'acordos')}</span>
            {leitura.total.qtd > 0 && (
              <span className="text-muted-foreground">
                {leitura.pago.qtd} pago{leitura.pago.qtd === 1 ? '' : 's'} · {leitura.aVerificar.qtd} {aVerificar.toLowerCase()} · {leitura.naoPago.qtd} não pago{leitura.naoPago.qtd === 1 ? '' : 's'}
              </span>
            )}
          </p>
        ) : (
          <p className="text-muted-foreground">Passe o mouse num dia para ver os números.</p>
        )}
      </div>
    </section>
  );
}

// ─── Lista de uma pessoa ─────────────────────────────────────────────────────

type FiltroLista = 'frente' | 'sem_baixa' | 'nao_pago' | 'pago' | 'todos';

function ListaDaPessoa({ empresaId, pessoa, linhas, de, ate, periodo, hoje, regra, mostrarFrente }: {
  empresaId: string;
  pessoa: PessoaAgenda;
  /** As linhas desta pessoa NESTE grupo (o clone em dois setores tem duas). */
  linhas: readonly LinhaAgenda[];
  de: string; ate: string;
  periodo: { inicio: string; fim: string };
  hoje: string;
  regra: RegraDoSetor;
  mostrarFrente: boolean;
}) {
  const [acordos, setAcordos] = useState<AcordoDaAgenda[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ids = useMemo(() => new Set(linhas.map(l => l.id)), [linhas]);
  const voc = vocabulario(regra);

  useEffect(() => {
    let vivo = true;
    setAcordos(null); setErro(null);
    buscarAgendaDaPessoa({ empresaId, operadorId: pessoa.id, de, ate })
      .then(a => { if (vivo) setAcordos(a); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar'); });
    return () => { vivo = false; };
  }, [empresaId, pessoa.id, de, ate]);

  const doGrupo = useMemo(() => (acordos ?? []).filter(a => ids.has(a.id)), [acordos, ids]);
  const r = useMemo(() => resumir(linhas, { ...periodo, hoje }), [linhas, periodo, hoje]);

  const filtros = useMemo(() => {
    const j = janelaDe(hoje);
    // A mesma regra do filtro abaixo, contada nas linhas: o número do botão
    // tem de ser exatamente o tamanho da lista que ele abre.
    const pelaFrente = linhas.filter(l => estadoDoAcordo(l.status) === 'a_verificar'
      && l.vencimento >= hoje && l.vencimento <= j.proximosAte).length;
    const lista: { k: FiltroLista; t: string; n: number }[] = [];
    if (mostrarFrente) lista.push({ k: 'frente', t: 'Pela frente', n: pelaFrente });
    lista.push(
      { k: 'sem_baixa', t: 'Vencidos sem baixa', n: r.vencidoSemBaixa.qtd },
      { k: 'nao_pago', t: 'Não pagos', n: r.naoPago.qtd },
      { k: 'pago', t: 'Pagos', n: r.pago.qtd },
      { k: 'todos', t: 'Todos', n: r.total.qtd },
    );
    return { lista, j };
  }, [mostrarFrente, r, hoje, linhas]);

  const [filtro, setFiltro] = useState<FiltroLista | null>(null);
  const filtroEfetivo: FiltroLista = filtro
    ?? (mostrarFrente && filtros.lista[0].n > 0 ? 'frente' : r.vencidoSemBaixa.qtd > 0 ? 'sem_baixa' : 'todos');

  const visiveis = useMemo(() => doGrupo.filter(a => {
    const e = estadoDoAcordo(a.status);
    const noPeriodo = a.vencimento >= periodo.inicio && a.vencimento <= periodo.fim;
    switch (filtroEfetivo) {
      case 'frente':    return e === 'a_verificar' && a.vencimento >= hoje && a.vencimento <= filtros.j.proximosAte;
      case 'sem_baixa': return noPeriodo && e === 'a_verificar' && a.vencimento < hoje;
      case 'nao_pago':  return noPeriodo && e === 'nao_pago';
      case 'pago':      return noPeriodo && e === 'pago';
      default:          return noPeriodo;
    }
  }), [doGrupo, filtroEfetivo, periodo, hoje, filtros.j.proximosAte]);

  return (
    <div className="bg-muted/30 border-t border-border/60 px-3 sm:px-5 py-4 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {filtros.lista.map(f => (
          <button key={f.k} type="button" onClick={() => setFiltro(f.k)}
            aria-pressed={filtroEfetivo === f.k}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              filtroEfetivo === f.k
                ? 'bg-card border-primary/40 text-foreground shadow-sm'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}>
            {f.t} <span className="ml-0.5 tabular-nums text-muted-foreground">{f.n}</span>
          </button>
        ))}
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {!acordos && !erro && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando os acordos de {pessoa.nome.split(' ')[0]}…
        </p>
      )}
      {acordos && visiveis.length === 0 && (
        <p className="text-sm text-muted-foreground py-3">Nenhum acordo neste filtro.</p>
      )}
      {acordos && visiveis.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-3 py-2 font-semibold">Vencimento</th>
                <th className="px-3 py-2 font-semibold">Cliente</th>
                <th className="px-3 py-2 font-semibold">{regra === 'cofen' ? 'NR · Código' : 'NR'}</th>
                <th className="px-3 py-2 font-semibold">Forma</th>
                <th className="px-3 py-2 font-semibold text-right">Valor</th>
                <th className="px-3 py-2 font-semibold">Situação</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map(a => {
                const atrasado = estadoDoAcordo(a.status) === 'a_verificar' && a.vencimento < hoje;
                return (
                  <tr key={a.id} className={cn('border-b border-border/50 last:border-0', a.vencimento === hoje && 'bg-primary/5')}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={cn('capitalize', a.vencimento === hoje && 'font-semibold text-primary')}>
                        {rotuloDoDia(a.vencimento, hoje)}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[240px]">
                      <div className="truncate" title={a.nome_cliente ?? ''}>{a.nome_cliente || '—'}</div>
                      {(a.parcelas ?? 0) > 1 && (
                        <div className="text-[11px] text-muted-foreground">parcela {a.numero_parcela ?? '?'} de {a.parcelas}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {a.nr_cliente || '—'}
                      {regra === 'cofen' && a.instituicao ? <span className="text-muted-foreground"> · {a.instituicao}</span> : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{voc.tipo[a.tipo ?? ''] ?? a.tipo ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">{formatCurrency(a.valor)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn('inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-semibold', STATUS_COLORS[a.status ?? ''])}>
                          {voc.status[a.status ?? ''] ?? a.status}
                        </span>
                        {atrasado && <span className="text-[11px] text-warning font-medium">sem baixa</span>}
                        <VinculoTag acordo={a as unknown as Acordo} />
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Link to={`/acordos/${a.id}`} title="Abrir o acordo" aria-label="Abrir o acordo"
                        className="inline-flex w-8 h-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Componente ──────────────────────────────────────────────────────────────

const ORDENS: { k: OrdemAgenda; t: string; soFrente?: boolean }[] = [
  { k: 'hoje', t: 'Vence hoje', soFrente: true },
  { k: 'agendado', t: 'Mais agendado' },
  { k: 'nao_pago', t: 'Mais não pago' },
  { k: 'conversao', t: 'Menor conversão' },
  { k: 'nome', t: 'Nome' },
];

export function AgendadosOperadores({
  empresaId, mes, operadores, fontes, setorIds, equipeIds, setores, isPP, recarregarKey,
}: Props) {
  const hoje = getTodayISO();
  const inicio = primeiroDiaDoMes(mes);
  const fim = ultimoDiaDoMes(mes);
  const mesCorrente = ehMesAtual(mes);
  const { de, ate } = intervaloDaConsulta({ inicio, fim, hoje, mesCorrente });

  const pessoas = useMemo(
    () => (fontes ? pessoasNoEscopo({ operadores, fontes, setorIds, equipeIds }) : []),
    [operadores, fontes, setorIds, equipeIds],
  );
  const idsChave = useMemo(() => pessoas.map(p => p.id).sort().join(','), [pessoas]);

  // ── Leitura ────────────────────────────────────────────────────────────────
  const [linhas, setLinhas] = useState<LinhaAgenda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [lidoEm, setLidoEm] = useState<Date | null>(null);
  const [releitura, setReleitura] = useState(0);

  useEffect(() => {
    if (!fontes) return;
    let vivo = true;
    setCarregando(true); setErro(null);
    buscarAgenda({ empresaId, operadores: idsChave ? idsChave.split(',') : [], de, ate })
      .then(l => { if (vivo) { setLinhas(l); setLidoEm(new Date()); } })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar a agenda'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [empresaId, idsChave, de, ate, fontes, recarregarKey, releitura]);

  // A regra de cada setor (CLAUDE.md «Cofen não é PaguePlay»). Falhou, cai na
  // regra da empresa — a decisão de antes.
  const [regraPorSetor, setRegraPorSetor] = useState<Record<string, RegraDoSetor>>({});
  useEffect(() => {
    let vivo = true;
    void tabelaSemTipo<{ id: string; regra: unknown }>('setores')
      .select('id, regra').eq('empresa_id', empresaId)
      .then(({ data, error }) => {
        if (!vivo || error || !data) return;
        const m: Record<string, RegraDoSetor> = {};
        for (const s of data) if (ehRegraDoSetor(s.regra)) m[s.id] = s.regra;
        setRegraPorSetor(m);
      });
    return () => { vivo = false; };
  }, [empresaId]);
  const regraDe = useCallback(
    (sid: string | null): RegraDoSetor => (sid && regraPorSetor[sid]) || (isPP ? 'cofen' : 'nosso_produto'),
    [regraPorSetor, isPP],
  );

  // ── Grupos e carteira ──────────────────────────────────────────────────────
  const ordemSetor = useMemo(() => new Map(setores.map((s, i) => [s.id, i])), [setores]);
  const nomeSetor = useCallback(
    (sid: string | null) => (sid ? setores.find(s => s.id === sid)?.nome ?? 'Setor' : 'Sem setor'),
    [setores],
  );
  const grupos = useMemo(() => distribuirPorSetor({ pessoas, linhas, setorIds })
    .sort((a, b) => (ordemSetor.get(a.setorId ?? '') ?? 9e9) - (ordemSetor.get(b.setorId ?? '') ?? 9e9)
      || nomeSetor(a.setorId).localeCompare(nomeSetor(b.setorId), 'pt-BR')),
  [pessoas, linhas, setorIds, ordemSetor, nomeSetor]);

  const carteiras = useMemo(() => {
    const presentes = new Set(grupos.map(g => regraDe(g.setorId)));
    return (['nosso_produto', 'cofen'] as const).filter(r => presentes.has(r));
  }, [grupos, regraDe]);
  const [carteiraEscolhida, setCarteira] = useState<RegraDoSetor | null>(null);
  const carteira: RegraDoSetor = carteiraEscolhida && carteiras.includes(carteiraEscolhida)
    ? carteiraEscolhida : (carteiras[0] ?? (isPP ? 'cofen' : 'nosso_produto'));
  const voc = vocabulario(carteira);

  const gruposDaCarteira = useMemo(
    () => grupos.filter(g => regraDe(g.setorId) === carteira), [grupos, regraDe, carteira]);
  const linhasDaCarteira = useMemo(
    () => gruposDaCarteira.flatMap(g => g.linhas), [gruposDaCarteira]);

  // ── Período: o mês, ou um dia escolhido no calendário ──────────────────────
  const [diaSel, setDiaSel] = useState<string | null>(null);
  useEffect(() => { setDiaSel(null); }, [mes]);
  const periodo = useMemo(
    () => (diaSel ? { inicio: diaSel, fim: diaSel } : { inicio, fim }), [diaSel, inicio, fim]);
  /** Hoje/amanhã/próximos só fazem sentido no mês corrente e sem dia escolhido. */
  const mostrarFrente = mesCorrente && !diaSel;

  const geral = useMemo(
    () => resumir(linhasDaCarteira, { ...periodo, hoje, semExtraDoPar: true }),
    [linhasDaCarteira, periodo, hoje]);
  const dias = useMemo(
    () => porDia(linhasDaCarteira, { inicio, fim, semExtraDoPar: true }),
    [linhasDaCarteira, inicio, fim]);
  const janela = janelaDe(hoje);

  // ── Lista ──────────────────────────────────────────────────────────────────
  const [ordem, setOrdem] = useState<OrdemAgenda>(mesCorrente ? 'hoje' : 'agendado');
  const ordemEfetiva: OrdemAgenda = ordem === 'hoje' && !mostrarFrente ? 'agendado' : ordem;
  const [busca, setBusca] = useState('');
  const [soAlertas, setSoAlertas] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const tabela = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return gruposDaCarteira.map((g: GrupoSetor) => {
      const itens = g.pessoas.map(x => ({ ...x, resumo: resumir(x.linhas, { ...periodo, hoje }) }));
      const alertaDe = (r: ResumoAgenda) => ({
        vazia: mostrarFrente && agendaVazia(r),
        semBaixa: r.vencidoSemBaixa.qtd > 0,
        conversaoBaixa: r.conversao !== null && r.conversao < 50,
      });
      const filtrados = itens
        .map(x => ({ ...x, alerta: alertaDe(x.resumo) }))
        .filter(x => !termo || x.pessoa.nome.toLocaleLowerCase('pt-BR').includes(termo)
          || (x.pessoa.equipeNome ?? '').toLocaleLowerCase('pt-BR').includes(termo))
        .filter(x => !soAlertas || x.alerta.vazia || x.alerta.semBaixa || x.alerta.conversaoBaixa);
      return {
        grupo: g,
        resumo: resumir(g.linhas, { ...periodo, hoje, semExtraDoPar: true }),
        itens: ordenarPessoas(filtrados, ordemEfetiva),
        total: itens.length,
      };
    });
  }, [gruposDaCarteira, periodo, hoje, busca, soAlertas, ordemEfetiva, mostrarFrente]);

  const totalAlertas = useMemo(() => tabela.reduce((s, t) => s + t.grupo.pessoas.filter(x => {
    const r = resumir(x.linhas, { ...periodo, hoje });
    return (mostrarFrente && agendaVazia(r)) || r.vencidoSemBaixa.qtd > 0 || (r.conversao !== null && r.conversao < 50);
  }).length, 0), [tabela, periodo, hoje, mostrarFrente]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const rotuloPeriodo = diaSel ? rotuloDoDia(diaSel, hoje) : rotuloDoMes(mes);
  const pessoasNaCarteira = new Set(gruposDaCarteira.flatMap(g => g.pessoas.map(x => x.pessoa.id))).size;

  if (!fontes || (carregando && linhas.length === 0)) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando a agenda…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {erro && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center justify-between gap-3">
          <span>Não deu para ler a agenda: {erro}</span>
          <Button size="sm" variant="link" className="text-destructive h-auto p-0" onClick={() => setReleitura(v => v + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Carteira: regra Cofen e Nosso produto não se somam. */}
      {carteiras.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Carteira:</span>
          <div className="flex items-center gap-1 rounded-full bg-muted/70 p-1">
            {carteiras.map(c => (
              <button key={c} type="button" onClick={() => { setCarteira(c); setAberta(null); }}
                aria-pressed={carteira === c}
                className={cn(
                  'rounded-full px-3.5 py-1 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  carteira === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}>
                {ROTULO_REGRA[c]}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">Regras de negócio diferentes ficam separadas.</span>
        </div>
      )}

      {/* ── 1. O período em números ─────────────────────────────────────── */}
      <section className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> Acordos agendados · {ROTULO_REGRA[carteira]}
            </p>
            <h2 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight">
              <span className="capitalize">{rotuloPeriodo}</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Por vencimento · {plural(pessoasNaCarteira, 'pessoa', 'pessoas')}
              {geral.extra.qtd > 0 && <> · {plural(geral.extra.qtd, 'Extra', 'Extras')} no total (o par Direto/Extra conta uma vez)</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {diaSel && (
              <Button variant="outline" size="sm" className="h-8 rounded-full text-xs" onClick={() => setDiaSel(null)}>
                <X className="w-3.5 h-3.5 mr-1" /> Ver o mês inteiro
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="Recarregar a agenda"
              onClick={() => setReleitura(v => v + 1)} disabled={carregando}>
              <RefreshCw className={cn('w-3.5 h-3.5', carregando && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* `gap-px` sobre fundo de borda: as linhas entre os números saem
            certas em 2 e em 5 colunas, sem regra de borda para cada caso. */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-border/70 border-t border-border/70">
          <Numero rotulo="Agendado" soma={geral.total} dica="Todo acordo com vencimento no período" />
          <Numero rotulo="Pago" soma={geral.pago} destaque="success" />
          <Numero rotulo={voc.aVerificar} soma={geral.aVerificar} destaque="warning"
            dica="Ainda sem desfecho: a vencer, ou vencido sem baixa">
            {geral.vencidoSemBaixa.qtd > 0 && (
              <p className="mt-1 text-[11px] font-medium text-warning flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {plural(geral.vencidoSemBaixa.qtd, 'vencido', 'vencidos')} sem baixa
              </p>
            )}
          </Numero>
          <Numero rotulo="Não pago" soma={geral.naoPago} destaque="destructive" dica="Venceu e não pagou: o acordo quebrou" />
          <div className="bg-card p-4 sm:p-5 min-w-0 col-span-2 lg:col-span-1"
            title="Pagos ÷ (pagos + não pagos). Só conta o que já teve desfecho.">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Conversão</p>
            <p className="mt-2 text-xl sm:text-2xl leading-none font-bold"><Conversao v={geral.conversao} /></p>
            <p className="mt-1.5 text-xs text-muted-foreground">dos que já tiveram desfecho</p>
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-border/70 space-y-2">
          <BarraTresEstados r={geral} className="h-2.5" />
          <Legenda aVerificar={voc.aVerificar} />
        </div>

        {mostrarFrente && (
          <div className="grid sm:grid-cols-3 border-t border-border/70 bg-muted/25 divide-y sm:divide-y-0 sm:divide-x divide-border/70">
            {[
              { t: 'Vence hoje', s: geral.hoje, sub: geral.hoje.qtd ? `${geral.hojePago.qtd} já pago${geral.hojePago.qtd === 1 ? '' : 's'}` : null },
              { t: `Amanhã · ${ddmm(janela.amanha)}`, s: geral.amanha, sub: null },
              { t: `Próximos dias · ${ddmm(janela.proximosDe)} a ${ddmm(janela.proximosAte)}`, s: geral.proximos, sub: null },
            ].map(x => (
              <div key={x.t} className="px-5 sm:px-6 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{x.t}</p>
                <p className="mt-1.5 font-mono tabular-nums font-bold text-lg">{brlCurto(x.s.valor)}</p>
                <p className="text-xs text-muted-foreground">
                  {plural(x.s.qtd, 'acordo', 'acordos')}{x.sub ? ` · ${x.sub}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 2. Calendário ───────────────────────────────────────────────── */}
      <Calendario dias={dias} hoje={hoje} selecionado={diaSel} onSelecionar={setDiaSel} aVerificar={voc.aVerificar} />

      {/* ── 3. Pessoa a pessoa ──────────────────────────────────────────── */}
      <section className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-wrap items-center gap-3 border-b border-border/70">
          <div className="min-w-0 mr-auto">
            <h3 className="text-sm font-semibold">Por pessoa</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Clique na pessoa para ver a lista de acordos dela.</p>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa ou equipe"
              className="h-8 pl-8 text-xs" />
          </div>
          <Button variant={soAlertas ? 'default' : 'outline'} size="sm" className="h-8 rounded-full text-xs"
            onClick={() => setSoAlertas(v => !v)} disabled={totalAlertas === 0 && !soAlertas}
            title="Agenda vazia pela frente, vencido sem baixa ou conversão abaixo de 50%">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Precisa de atenção · {totalAlertas}
          </Button>
        </div>
        <div className="px-4 sm:px-5 py-2.5 flex flex-wrap items-center gap-1 border-b border-border/70 text-xs">
          <span className="text-muted-foreground mr-1">Ordenar:</span>
          {ORDENS.filter(o => !o.soFrente || mostrarFrente).map(o => (
            <button key={o.k} type="button" onClick={() => setOrdem(o.k)} aria-pressed={ordemEfetiva === o.k}
              className={cn(
                'rounded-full px-2.5 py-1 font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ordemEfetiva === o.k ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}>
              {o.t}
            </button>
          ))}
        </div>

        {tabela.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">Ninguém no recorte escolhido.</p>
        )}

        {tabela.map(({ grupo, resumo, itens, total }) => (
          <div key={grupo.setorId ?? 'sem'} className="border-b border-border/70 last:border-0">
            {(tabela.length > 1 || !setorIds.length) && (
              <div className="px-4 sm:px-5 py-3 bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-semibold text-sm">{nomeSetor(grupo.setorId)}</span>
                <span className="text-xs text-muted-foreground">{plural(total, 'pessoa', 'pessoas')}</span>
                <span className="text-xs font-mono tabular-nums ml-auto">
                  {brlCurto(resumo.total.valor)} agendado · {brlCurto(resumo.pago.valor)} pago
                </span>
                <span className="text-xs">Conversão <Conversao v={resumo.conversao} /></span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pl-4 sm:pl-5 pr-3 py-2 font-semibold">Pessoa</th>
                    {mostrarFrente ? (<>
                      <th className="px-3 py-2 font-semibold">Hoje</th>
                      <th className="px-3 py-2 font-semibold">Amanhã</th>
                      <th className="px-3 py-2 font-semibold">Próximos dias</th>
                    </>) : (<>
                      <th className="px-3 py-2 font-semibold">Pago</th>
                      <th className="px-3 py-2 font-semibold">{voc.aVerificar}</th>
                      <th className="px-3 py-2 font-semibold">Não pago</th>
                    </>)}
                    <th className="px-3 py-2 font-semibold">{diaSel ? 'No dia' : 'No mês'}</th>
                    <th className="px-3 py-2 font-semibold w-[140px]">Situação</th>
                    <th className="px-3 py-2 font-semibold text-right">Conversão</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 && (
                    <tr><td colSpan={8} className="px-5 py-6 text-center text-xs text-muted-foreground">
                      Ninguém neste filtro.
                    </td></tr>
                  )}
                  {itens.map(({ pessoa, linhas: minhas, resumo: r, alerta }) => {
                    const chave = `${grupo.setorId ?? 'sem'}:${pessoa.id}`;
                    const estaAberta = aberta === chave;
                    return (
                      <Fragment key={chave}>
                        <tr onClick={() => setAberta(estaAberta ? null : chave)}
                          className={cn('border-t border-border/50 cursor-pointer hover:bg-muted/40 transition-colors', estaAberta && 'bg-muted/40')}>
                          <td className="pl-4 sm:pl-5 pr-3 py-2.5">
                            <button type="button" aria-expanded={estaAberta}
                              className="flex items-center gap-2.5 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                              onClick={e => { e.stopPropagation(); setAberta(estaAberta ? null : chave); }}>
                              <Avatar p={pessoa} />
                              <span className="min-w-0">
                                <span className="block font-medium truncate max-w-[200px]">{pessoa.nome}</span>
                                <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                  {pessoa.equipeNome ?? 'Sem equipe'}
                                  {alerta.vazia && (
                                    <span className="inline-flex items-center gap-0.5 text-warning font-medium" title="Nada em aberto hoje, nem amanhã, nem nos próximos 7 dias">
                                      <CalendarX2 className="w-3 h-3" /> agenda vazia
                                    </span>
                                  )}
                                  {alerta.semBaixa && (
                                    <span className="text-warning font-medium" title="Venceu e ninguém marcou pago ou não pago">
                                      {r.vencidoSemBaixa.qtd} sem baixa
                                    </span>
                                  )}
                                  {r.extra.qtd > 0 && <span>· {plural(r.extra.qtd, 'extra', 'extras')}</span>}
                                </span>
                              </span>
                            </button>
                          </td>
                          {mostrarFrente ? (<>
                            <td className="px-3 py-2.5"><Celula s={r.hoje} forte
                              sub={r.hoje.qtd ? `${r.hojePago.qtd} pago${r.hojePago.qtd === 1 ? '' : 's'}` : null} /></td>
                            <td className="px-3 py-2.5"><Celula s={r.amanha} /></td>
                            <td className="px-3 py-2.5"><Celula s={r.proximos} /></td>
                          </>) : (<>
                            <td className="px-3 py-2.5"><Celula s={r.pago} /></td>
                            <td className="px-3 py-2.5"><Celula s={r.aVerificar} /></td>
                            <td className="px-3 py-2.5"><Celula s={r.naoPago} /></td>
                          </>)}
                          <td className="px-3 py-2.5"><Celula s={r.total} /></td>
                          <td className="px-3 py-2.5"><BarraTresEstados r={r} /></td>
                          <td className="px-3 py-2.5 text-right"><Conversao v={r.conversao} /></td>
                          <td className="pr-3 text-muted-foreground">
                            {estaAberta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                        </tr>
                        {estaAberta && (
                          <tr>
                            <td colSpan={8} className="p-0">
                              <ListaDaPessoa empresaId={empresaId} pessoa={pessoa} linhas={minhas}
                                de={de} ate={ate} periodo={periodo} hoje={hoje}
                                regra={regraDe(grupo.setorId)} mostrarFrente={mostrarFrente} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Fonte: os acordos tabulados no sistema, pelo vencimento — o valor é o do acordo, não o recebido do relatório.
        Cada pessoa vê os próprios acordos, o Extra incluso; no total do setor e da carteira, o par Direto/Extra
        conta uma vez. {lidoEm && <>Lido às {lidoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</>}
      </p>
    </div>
  );
}

export default AgendadosOperadores;
