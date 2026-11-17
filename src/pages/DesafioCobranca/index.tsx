/**
 * Desafio Cobrança — a tela do super_admin (16/11/2026).
 *
 * Tudo o que mexe no desafio mora aqui, e só o super_admin entra (rota + RLS):
 *   • liberar para a operação (nada aparece para ninguém antes disso);
 *   • conferir o dado: o último 59 do robô × a última leitura do desafio;
 *   • acompanhar hora a hora e por setor — para achar erro;
 *   • quais setores somam e quais veem;
 *   • período, meta e prêmio;
 *   • ajuste de valor em caso de divergência: soma em todo lugar (Gestão e TV);
 *   • a fonte do placar: seguir o 59 (+ ajustes) ou SÓ os lançamentos do super_admin.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSinalDoDesafioCobranca } from '@/hooks/useDesafioCobranca';
import { toast } from 'sonner';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, Bot, CheckCircle2, Eye, EyeOff, Lock, PenLine, Plus, RefreshCw, Sun, Trash2, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useAxisColors, useChartColors } from '@/hooks/useChartColors';
import { cn } from '@/lib/utils';
import {
  buscarDetalheCobranca, lancarAjuste, lerAgora, liberar, removerAjuste, salvarConfig, salvarFonte, salvarGruposAvulsos, salvarSetor,
  type ConfigDoDesafio, type DetalheCobranca, type FonteDoPlacar, type SetorDoDesafio,
} from '@/services/desafioCobranca/desafioCobranca.service';
import {
  brl, brlCurto, curvaHoraAHora, dataCurta, diaDoDesafio, esperadoAteODia, hojeEmSaoPaulo, horaCurta, horaEmSaoPaulo, horasSemRetrato,
  lerValorEmReais, maiuscula, minutosSemO59, pct, porSetorNoDia, semana, semanaCurta, totalDepoisDoLancamento, ultimoLancamentoPorDia,
  valorDosLancamentos, type ModoDoLancamento,
} from '@/services/desafioCobranca/regras';

const CHAVE = ['desafio-cobranca-detalhe'];
const caixa = 'rounded-xl border border-border bg-card';
const campo = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function DesafioCobrancaPagina() {
  // O 59 subiu lote, outro super_admin lançou ajuste: relê sem recarregar.
  useSinalDoDesafioCobranca(true, [CHAVE, ['desafio-cobranca']]);
  const q = useQuery({ queryKey: CHAVE, queryFn: buscarDetalheCobranca, refetchInterval: 5 * 60 * 1000, refetchOnWindowFocus: false });
  const d = q.data;

  if (q.isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando o desafio…</p>;
  if (q.isError) return <p className="p-6 text-sm text-destructive">Não deu para carregar: {(q.error as Error).message}</p>;
  if (!d) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">Desafio Cobrança</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhum desafio ativo. Se a migration <code>20261116150000_desafio_cobranca</code> ainda não foi aplicada, é ela que cria o desafio de 16 a 18/11.
        </p>
      </div>
    );
  }
  return <Painel d={d} />;
}

function Painel({ d }: { d: DetalheCobranca }) {
  const { indice: hoje } = diaDoDesafio(d.dias, hojeEmSaoPaulo());
  const [dia, setDia] = useState(d.dias[hoje] ?? d.dias[0]);
  const ultimo = d.dias.length - 1;

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-warning">
            <Sun className="h-4 w-4" aria-hidden /> Desafio Cobrança · só super admin
          </p>
          <h1 className="mt-1 text-2xl font-bold">{d.titulo} {d.subtitulo}</h1>
          <p className="text-sm text-muted-foreground">
            {semana(d.dias[0])} a {semana(d.dias[ultimo])} · {dataCurta(d.dias[0])} a {dataCurta(d.dias[ultimo])} · meta {brl(d.meta_geral)}
          </p>
        </div>
        <Liberacao d={d} />
      </header>

      <FonteDoPlacarEscolha d={d} />
      <Conferencia d={d} />

      <section className="grid gap-3 sm:grid-cols-4">
        <Numero rotulo="Somado no desafio" valor={brl(d.total)} sub={`${pct(d.total, d.meta_geral)}% de ${brlCurto(d.meta_geral)}`} />
        {d.por_dia.map((p, i) => (
          <Numero
            key={p.dia} rotulo={`${semana(p.dia)}, ${dataCurta(p.dia)}${i === hoje ? ' · hoje' : ''}`} valor={brl(p.total)}
            sub={d.fonte === 'manual'
              ? `lançado pelo super admin · ponto do dia ${brlCurto(esperadoAteODia(d, i))}`
              : p.ajuste ? `59 ${brl(p.valor_59)} · ajuste ${p.ajuste > 0 ? '+' : ''}${brl(p.ajuste)}` : `ponto do dia ${brlCurto(esperadoAteODia(d, i))}`}
          />
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Qual dia ver">
        <span className="text-sm text-muted-foreground">Dia:</span>
        {d.dias.map(x => (
          <Button key={x} size="sm" variant={x === dia ? 'default' : 'outline'} onClick={() => setDia(x)} aria-pressed={x === dia}>
            {semanaCurta(x)} {dataCurta(x)}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GraficoHoraAHora d={d} dia={dia} />
        <PorSetor d={d} dia={dia} />
      </div>

      <Setores d={d} />
      <Ajustes d={d} diaInicial={dia} />
      <Configuracao d={d} />
    </main>
  );
}

function Numero({ rotulo, valor, sub }: { rotulo: string; valor: string; sub: string }) {
  return (
    <div className={cn(caixa, 'p-4')}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{valor}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function useRecarregar() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: CHAVE }),
    qc.invalidateQueries({ queryKey: ['desafio-cobranca'] }),
  ]);
}

// ── Liberar ──────────────────────────────────────────────────────────────────

function Liberacao({ d }: { d: DetalheCobranca }) {
  const recarregar = useRecarregar();
  const [confirmar, setConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const veem = d.setores.filter(s => s.ve).length;

  async function trocar() {
    setSalvando(true);
    try {
      await liberar(d.id, !d.liberado);
      toast.success(d.liberado ? 'Desafio recolhido: só o super admin vê.' : 'Desafio liberado para a operação.');
      await recarregar();
    } catch (e) {
      toast.error(`Não salvou: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
      setConfirmar(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {d.liberado
        ? <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success"><Eye className="h-4 w-4" aria-hidden /> Liberado{d.liberado_em ? ` · ${dataCurta(hojeEmSaoPaulo(new Date(d.liberado_em)))} ${horaCurta(d.liberado_em)}` : ''}</span>
        : <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground"><Lock className="h-4 w-4" aria-hidden /> Não liberado · só super admin vê</span>}
      <Button variant={d.liberado ? 'outline' : 'default'} onClick={() => setConfirmar(true)} disabled={salvando}>
        {d.liberado ? <><EyeOff className="mr-2 h-4 w-4" aria-hidden /> Recolher</> : <><Unlock className="mr-2 h-4 w-4" aria-hidden /> Liberar para a operação</>}
      </Button>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{d.liberado ? 'Recolher o desafio?' : 'Liberar o desafio para a operação?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {d.liberado
                ? 'A pílula, a gaveta e a TV somem para todo mundo. Só o super admin continua vendo.'
                : `A pílula, a gaveta e a TV aparecem para ${veem} ${veem === 1 ? 'setor' : 'setores'} marcados «vê». Confira os números antes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void trocar(); }} disabled={salvando}>
              {d.liberado ? 'Recolher' : 'Liberar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Fonte do placar ─────────────────────────────────────────────────────────

const FONTES: { f: FonteDoPlacar; Icone: typeof Bot; titulo: string; sub: string }[] = [
  { f: '59', Icone: Bot, titulo: 'Seguir o 59', sub: 'O robô sobe de hora em hora. Os ajustes do super admin somam por cima.' },
  { f: 'manual', Icone: PenLine, titulo: 'Só o lançamento do super admin', sub: 'O placar é só o que for lançado aqui. O 59 fica só para comparar.' },
];

function FonteDoPlacarEscolha({ d }: { d: DetalheCobranca }) {
  const recarregar = useRecarregar();
  const [pedida, setPedida] = useState<FonteDoPlacar | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Manual: o último lançamento de cada dia. 59: tudo soma por cima.
  const lancado = valorDosLancamentos(d.ajustes, pedida === 'manual' ? 'manual' : '59');

  async function trocar() {
    if (!pedida) return;
    setSalvando(true);
    try {
      await salvarFonte(d.id, pedida);
      toast.success(pedida === 'manual' ? 'Agora o placar segue só os lançamentos.' : 'Agora o placar segue o 59.');
      await recarregar();
    } catch (e) {
      toast.error(`Não trocou: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
      setPedida(null);
    }
  }

  return (
    <section className={cn(caixa, 'p-4')} aria-labelledby="dc-fonte-titulo">
      <h2 id="dc-fonte-titulo" className="font-semibold">De onde vem o placar</h2>
      <p className="text-sm text-muted-foreground">Vale para todo mundo: a pílula, a gaveta e a TV.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby="dc-fonte-titulo">
        {FONTES.map(({ f, Icone, titulo, sub }) => {
          const ativa = d.fonte === f;
          return (
            <button
              key={f} type="button" role="radio" aria-checked={ativa} disabled={salvando}
              onClick={() => { if (!ativa) setPedida(f); }}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ativa ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
              )}
            >
              <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', ativa ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                <Icone className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {titulo}
                  {ativa && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">em uso</span>}
                </span>
                <span className="block text-xs text-muted-foreground">{sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <AlertDialog open={pedida !== null} onOpenChange={o => { if (!o) setPedida(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pedida === 'manual' ? 'Seguir só o lançamento do super admin?' : 'Voltar a seguir o 59?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pedida === 'manual'
                ? `O placar de todo mundo passa a ser só o que foi lançado: o último lançamento de cada dia (${brl(lancado)} até agora). O 59 continua sendo lido, mas não conta. Dá para voltar quando quiser.`
                : `O placar volta a ser o 59 mais os lançamentos, que viram ajustes e SOMAM por cima — todos, não só o último do dia (${brl(lancado)} lançados). Se eles repetem o que o 59 já traz, remova-os antes para não contar duas vezes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void trocar()}>{pedida === 'manual' ? 'Seguir os lançamentos' : 'Seguir o 59'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ── Conferência do dado ─────────────────────────────────────────────────────

function Conferencia({ d }: { d: DetalheCobranca }) {
  const recarregar = useRecarregar();
  const [lendo, setLendo] = useState(false);
  const lote = d.lote_59?.importado_em ?? null;
  const leitura = d.atualizado_em;
  const atrasada = !!lote && (!leitura || new Date(lote).getTime() - new Date(leitura).getTime() > 60_000);
  const soltos = d.grupos.filter(g => !g.setor_id && !d.grupos_avulsos.includes(g.cod));
  const parado = minutosSemO59(lote);
  const manual = d.fonte === 'manual';

  async function ler() {
    setLendo(true);
    try {
      const n = await lerAgora(d.id);
      toast.success(`Leitura feita (${n} linhas).`);
      await recarregar();
    } catch (e) {
      toast.error(`Não leu: ${(e as Error).message}`);
    } finally {
      setLendo(false);
    }
  }

  return (
    <section className={cn(caixa, 'flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm')} aria-label="Conferência do dado">
      <span>Último 59 do robô: <strong>{lote ? horaCurta(lote) : '—'}</strong></span>
      {manual ? (
        <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
          <PenLine className="h-4 w-4" aria-hidden /> Placar pelos lançamentos{leitura ? ` · último às ${horaCurta(leitura)}` : ' · nada lançado ainda'}
        </span>
      ) : <span>Última leitura do desafio: <strong>{leitura ? horaCurta(leitura) : '—'}</strong></span>}
      {manual ? (
        <span className="text-muted-foreground">O 59 segue sendo lido só para comparar.</span>
      ) : atrasada
        ? <span className="inline-flex items-center gap-1.5 font-semibold text-warning"><AlertTriangle className="h-4 w-4" aria-hidden /> A leitura está atrás do 59</span>
        : parado === null && <span className="inline-flex items-center gap-1.5 font-semibold text-success"><CheckCircle2 className="h-4 w-4" aria-hidden /> Em dia com o 59</span>}
      {!manual && parado !== null && lote && (
        <p className="basis-full rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-warning" role="alert">
          <AlertTriangle className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />
          <strong>O 59 não chega há {Math.floor(parado / 60)}h{String(parado % 60).padStart(2, '0')}</strong> (último às {horaCurta(lote)}).
          {' '}O robô no PC do trabalho parou ou o ERP não exportou. O valor não se perde: o próximo retrato traz tudo do dia, mas esta hora fica sem ponto.
        </p>
      )}
      {soltos.length > 0 && (
        <span className="text-muted-foreground">
          {soltos.length} {soltos.length === 1 ? 'grupo sem setor ficou' : 'grupos sem setor ficaram'} de fora ({brl(soltos.reduce((s, g) => s + g.valor, 0))})
        </span>
      )}
      {d.aberturas !== undefined && (
        <span className="text-muted-foreground">
          Abertura vista por <strong className="text-foreground">{d.aberturas}</strong> {d.aberturas === 1 ? 'pessoa' : 'pessoas'} (uma vez cada)
        </span>
      )}
      <Button size="sm" variant="outline" className="ml-auto" onClick={ler} disabled={lendo}>
        <RefreshCw className={cn('mr-2 h-4 w-4', lendo && 'animate-spin')} aria-hidden /> Ler o 59 agora
      </Button>
    </section>
  );
}

// ── Gráficos ────────────────────────────────────────────────────────────────

function GraficoHoraAHora({ d, dia }: { d: DetalheCobranca; dia: string }) {
  const [modo, setModo] = useState<'total' | 'dia'>('total');
  const cores = useChartColors(['--primary', '--warning']);
  const { tickColor, gridColor } = useAxisColors();
  const curva = useMemo(() => curvaHoraAHora({ leituras: d.leituras, horas: d.horas, ajustes: d.ajustes, setores: d.setores, avulsos: d.grupos_avulsos, fonte: d.fonte, dia }), [d, dia]);
  const i = d.dias.indexOf(dia);
  const alvo = modo === 'total' ? esperadoAteODia(d, i) : Math.round(d.meta_geral / d.dias.length / 1000) * 1000;
  // Só as horas do dia escolhido: a curva é «como o dia andou». Hora sem
  // retrato do 59 entra como buraco (valor nulo), nunca pulada calada.
  // No manual não há retrato de hora em hora: cada ponto é um lançamento.
  const faltam = d.fonte === 'manual' ? [] : horasSemRetrato(d.leituras, dia);
  const pontos: { hora: string; valor: number | null; h: number }[] = [
    ...curva
      .filter(p => hojeEmSaoPaulo(new Date(p.lido_em)) === dia)
      .map(p => ({ hora: horaCurta(p.lido_em), valor: modo === 'total' ? p.total : p.dia, h: horaEmSaoPaulo(p.lido_em) })),
    ...faltam.map(h => ({ hora: `${String(h).padStart(2, '0')}:00`, valor: null as number | null, h })),
  ].sort((a, b) => a.h - b.h || a.hora.localeCompare(b.hora));
  const comValor = pontos.filter(p => p.valor !== null);

  return (
    <section className={cn(caixa, 'p-4')} aria-labelledby="dc-hora-titulo">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="dc-hora-titulo" className="font-semibold">
          {d.fonte === 'manual' ? 'Lançamentos' : 'Hora a hora'} · {semana(dia)}, {dataCurta(dia)}
        </h2>
        <div className="ml-auto inline-flex rounded-full border border-border bg-muted/50 p-0.5 text-xs" role="group" aria-label="O que a linha mostra">
          {(['total', 'dia'] as const).map(m => (
            <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}
              className={cn('rounded-full px-3 py-1 font-semibold', modo === m ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
              {m === 'total' ? 'Acumulado do desafio' : 'Só o dia'}
            </button>
          ))}
        </div>
      </div>
      {faltam.length > 0 && (
        <p className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning" role="alert">
          <AlertTriangle className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />
          Sem retrato do 59 {faltam.length === 1 ? 'na hora' : 'nas horas'} {faltam.map(h => `${h}h`).join(', ')}: o robô não subiu o 59 nessa hora.
          O total não perde nada (o retrato seguinte traz tudo do dia); só o ponto da hora fica vazio.
        </p>
      )}
      {comValor.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {d.fonte === 'manual'
            ? 'Nenhum lançamento neste dia ainda. Cada lançamento do super admin vira um ponto.'
            : 'Nenhuma leitura neste dia ainda. Cada lote do 59 que o robô sobe vira um ponto.'}
        </p>
      ) : (
        <>
          <div className="h-64" role="img" aria-label={`Recebido hora a hora em ${dataCurta(dia)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pontos} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={gridColor} vertical={false} />
                <XAxis dataKey="hora" tick={{ fill: tickColor, fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: tickColor, fontSize: 12 }} tickLine={false} axisLine={false} width={72} tickFormatter={(v: number) => brlCurto(v)} />
                <Tooltip formatter={(v: number) => [brl(v), modo === 'total' ? 'Acumulado' : 'No dia']} labelFormatter={(h: string) => (d.fonte === 'manual' ? `Lançamento das ${h}` : `Retrato das ${h}`)} />
                <ReferenceLine y={alvo} stroke={cores['--warning']} strokeDasharray="4 4"
                  label={{ value: `ponto do dia ${brlCurto(alvo)}`, position: 'insideTopRight', fill: tickColor, fontSize: 11 }} />
                <Line type="monotone" dataKey="valor" stroke={cores['--primary']} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Ver em tabela</summary>
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">{d.fonte === 'manual' ? 'Lançamento' : 'Retrato'}</th><th className="py-1 text-right">Valor</th><th className="py-1 text-right">Andou</th></tr></thead>
              <tbody>
                {pontos.map(p => {
                  if (p.valor === null) {
                    return (
                      <tr key={p.hora} className="border-t border-border text-warning">
                        <td className="py-1 font-semibold">{p.hora}</td>
                        <td className="py-1 text-right" colSpan={2}>sem retrato do 59 nesta hora</td>
                      </tr>
                    );
                  }
                  const antes = comValor[comValor.indexOf(p) - 1];
                  return (
                    <tr key={p.hora} className="border-t border-border">
                      <td className="py-1">{p.hora}</td>
                      <td className="py-1 text-right tabular-nums">{brl(p.valor)}</td>
                      <td className="py-1 text-right tabular-nums text-muted-foreground">{antes?.valor != null ? brl(p.valor - antes.valor) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

function PorSetor({ d, dia }: { d: DetalheCobranca; dia: string }) {
  const cores = useChartColors(['--primary', '--muted-foreground']);
  const { tickColor } = useAxisColors();
  const linhas = porSetorNoDia(d.grupos, d.setores, dia, d.grupos_avulsos);
  const conta = (l: { situacao: string }) => l.situacao === 'soma' || l.situacao === 'avulso';
  const somado = linhas.filter(conta).reduce((s, l) => s + l.valor, 0);
  const rotulo = { soma: 'soma', fora: 'não soma', solto: 'grupo sem setor', avulso: 'soma (grupo sem setor)' } as const;

  return (
    <section className={cn(caixa, 'p-4')} aria-labelledby="dc-setor-titulo">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 id="dc-setor-titulo" className="font-semibold">Por setor · {semana(dia)}, {dataCurta(dia)}</h2>
        <span className="ml-auto text-sm text-muted-foreground">{d.fonte === 'manual' ? 'o 59 daria' : 'soma'} {brl(somado)}</span>
      </div>
      {d.fonte === 'manual' && (
        <p className="mb-3 text-xs text-muted-foreground">O placar segue os lançamentos. Este é o 59, só para comparar.</p>
      )}
      {linhas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhum pagamento neste dia no 59.</p>
      ) : (
        <>
          <div style={{ height: Math.max(160, linhas.length * 30) }} role="img" aria-label={`Recebido por setor em ${dataCurta(dia)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={linhas} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }} barCategoryGap={4}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" width={130} tick={{ fill: tickColor, fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number, _n, item) => [brl(v), rotulo[(item.payload as { situacao: keyof typeof rotulo }).situacao]]} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                  {linhas.map(l => (
                    <Cell key={l.chave} fill={conta(l) ? cores['--primary'] : cores['--muted-foreground']} fillOpacity={conta(l) ? 1 : 0.45} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 flex gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cores['--primary'] }} /> soma na meta</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm opacity-45" style={{ background: cores['--muted-foreground'] }} /> fica de fora</span>
          </p>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Setor / grupo</th><th className="py-1">Situação</th><th className="py-1 text-right">Pagtos</th><th className="py-1 text-right">Valor</th></tr></thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.chave} className={cn('border-t border-border', !conta(l) && 'text-muted-foreground')}>
                  <td className="py-1">{l.nome}{l.cidade ? <span className="text-xs text-muted-foreground"> · {l.cidade}</span> : null}</td>
                  <td className="py-1">{rotulo[l.situacao]}</td>
                  <td className="py-1 text-right tabular-nums">{l.pagamentos}</td>
                  <td className="py-1 text-right tabular-nums">{brl(l.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// ── Setores ─────────────────────────────────────────────────────────────────

function Setores({ d }: { d: DetalheCobranca }) {
  const recarregar = useRecarregar();
  const [salvando, setSalvando] = useState<string | null>(null);

  async function mudar(s: SetorDoDesafio, campo: 'soma' | 've', v: boolean) {
    setSalvando(s.setor_id);
    try {
      await salvarSetor(d.id, { setor_id: s.setor_id, soma: s.soma, ve: s.ve, [campo]: v });
      await recarregar();
    } catch (e) {
      toast.error(`Não salvou: ${(e as Error).message}`);
    } finally {
      setSalvando(null);
    }
  }

  // Grupos do 59 sem setor: os que apareceram nos dias do desafio e os já marcados.
  const avulsos = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of d.grupos) if (!g.setor_id) m.set(g.cod, g.nome || `Grupo ${g.cod}`);
    for (const cod of d.grupos_avulsos) if (!m.has(cod)) m.set(cod, `Grupo ${cod}`);
    return [...m.entries()].map(([cod, nome]) => ({ cod, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [d.grupos, d.grupos_avulsos]);

  async function mudarAvulso(cod: string, v: boolean) {
    setSalvando(`grupo:${cod}`);
    try {
      await salvarGruposAvulsos(d.id, v ? [...d.grupos_avulsos, cod] : d.grupos_avulsos.filter(c => c !== cod));
      await recarregar();
    } catch (e) {
      toast.error(`Não salvou: ${(e as Error).message}`);
    } finally {
      setSalvando(null);
    }
  }

  return (
    <section className={caixa} aria-labelledby="dc-setores-titulo">
      <div className="border-b border-border p-4">
        <h2 id="dc-setores-titulo" className="font-semibold">Setores</h2>
        <p className="text-sm text-muted-foreground">
          «Soma» põe o recebimento do setor na meta. «Vê» mostra a pílula, a gaveta e a TV para a equipe. Grupo do 59 sem setor só soma se for marcado embaixo.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Setor</th>
              <th className="px-2 py-2 font-semibold">Cidade</th>
              <th className="px-2 py-2 text-center font-semibold">Soma</th>
              <th className="px-4 py-2 text-center font-semibold">Vê</th>
            </tr>
          </thead>
          <tbody>
            {d.setores.map(s => (
              <tr key={s.setor_id} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium">
                  {s.nome}
                  {s.regra === 'cofen' && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">regra Cofen</span>}
                  {s.soma && !s.ve && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">soma sem ver</span>}
                </td>
                <td className="px-2 py-2.5 text-muted-foreground">{s.cidade ?? '—'}</td>
                <td className="px-2 py-2.5 text-center">
                  <Switch checked={s.soma} disabled={salvando === s.setor_id} onCheckedChange={v => mudar(s, 'soma', v)} aria-label={`${s.nome}: soma na meta`} />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <Switch checked={s.ve} disabled={salvando === s.setor_id} onCheckedChange={v => mudar(s, 've', v)} aria-label={`${s.nome}: vê o desafio`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {avulsos.length > 0 && (
          <table className="w-full border-t-2 border-border text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Grupo do 59 sem setor</th>
                <th className="px-2 py-2 font-semibold">Código</th>
                <th className="px-2 py-2 text-center font-semibold">Soma</th>
                <th className="px-4 py-2 text-center font-semibold">Vê</th>
              </tr>
            </thead>
            <tbody>
              {avulsos.map(g => (
                <tr key={g.cod} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium">{g.nome}</td>
                  <td className="px-2 py-2.5 tabular-nums text-muted-foreground">{g.cod}</td>
                  <td className="px-2 py-2.5 text-center">
                    <Switch checked={d.grupos_avulsos.includes(g.cod)} disabled={salvando === `grupo:${g.cod}`}
                      onCheckedChange={v => mudarAvulso(g.cod, v)} aria-label={`${g.nome}: soma na meta`} />
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">sem equipe</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ── Ajustes ─────────────────────────────────────────────────────────────────

function Ajustes({ d, diaInicial }: { d: DetalheCobranca; diaInicial: string }) {
  const { perfil } = useAuth();
  const recarregar = useRecarregar();
  const [dia, setDia] = useState(diaInicial);
  const [setor, setSetor] = useState('');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  // Manual (17/11/2026): «corrigir» troca o total do dia; «somar» põe em cima do que já tem.
  const [modo, setModo] = useState<ModoDoLancamento>('corrigir');
  const [salvando, setSalvando] = useState(false);
  const nomeSetor = (id: string | null) => (id ? d.setores.find(s => s.setor_id === id)?.nome ?? 'setor' : 'Geral');

  const manual = d.fonte === 'manual';
  const numero = lerValorEmReais(valor);
  // Manual: vale o último lançamento do dia. 59: os ajustes somam.
  const lancadoNoDia = valorDosLancamentos(d.ajustes, d.fonte, dia);
  // O desafio soma os dias: segunda + terça + … (no manual, o último de cada dia).
  const porDia = d.dias.map(x => ({ dia: x, valor: valorDosLancamentos(d.ajustes, d.fonte, x) }));
  const totalDoDesafio = porDia.reduce((s, x) => s + x.valor, 0);
  // Os que valem agora no manual (um por dia); os outros são histórico.
  const valendo = useMemo(
    () => new Set(manual ? [...ultimoLancamentoPorDia(d.ajustes.filter(a => !a.removido_em && (!a.setor_id || d.setores.some(s => s.soma && s.setor_id === a.setor_id)))).values()].map(a => a.id) : []),
    [manual, d.ajustes, d.setores],
  );
  // No manual o que se grava é o novo total do dia (o banco fica com o último).
  const novoTotalDoDia = manual && numero !== null ? totalDepoisDoLancamento(lancadoNoDia, numero, modo) : null;
  // Motivo opcional (16/11/2026). Manual: o total do dia nunca negativo (0 vale);
  // somar 0 não muda nada. 59: o ajuste, nunca 0.
  const problema: string | null = !valor.trim() ? 'o valor'
    : numero === null ? 'um valor válido (ex.: 50.000,00)'
    : !manual ? (numero === 0 ? 'um valor diferente de zero' : null)
    : modo === 'somar' && numero === 0 ? 'um valor diferente de zero para somar'
    : (novoTotalDoDia ?? 0) < 0 ? `um valor menor: o dia tem ${brl(lancadoNoDia)} e não pode ficar negativo`
    : null;
  const valido = problema === null;
  const nomeDoDia = `${maiuscula(semana(dia))} ${dataCurta(dia)}`;

  async function lancar() {
    if (!valido || !perfil || numero === null) return;
    setSalvando(true);
    try {
      const somando = manual && modo === 'somar';
      const valorGravado = manual ? (novoTotalDoDia ?? numero) : numero;
      // No somar o histórico guarda quanto entrou, porque o valor gravado é o total.
      const motivoGravado = somando ? [`Somou ${numero > 0 ? '+' : ''}${brl(numero)}`, motivo.trim()].filter(Boolean).join(' · ') : motivo;
      await lancarAjuste({ desafioId: d.id, dia, setorId: manual ? null : setor || null, valor: valorGravado, motivo: motivoGravado, criadoPor: perfil.id });
      toast.success(manual
        ? `${nomeDoDia} fica com ${brl(valorGravado)} no Gestão e na TV.`
        : 'Ajuste lançado. Já soma no Gestão e na TV.');
      setValor(''); setMotivo('');
      await recarregar();
    } catch (e) {
      toast.error(`Não lançou: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    if (!perfil) return;
    try {
      await removerAjuste(id, perfil.id);
      toast.success('Ajuste removido.');
      await recarregar();
    } catch (e) {
      toast.error(`Não removeu: ${(e as Error).message}`);
    }
  }

  return (
    <section className={caixa} aria-labelledby="dc-ajustes-titulo">
      <div className="border-b border-border p-4">
        <h2 id="dc-ajustes-titulo" className="font-semibold">{manual ? 'Lançamentos do super admin' : 'Ajuste de valor (divergência)'}</h2>
        <p className="text-sm text-muted-foreground">
          {manual
            ? 'Escolha o dia e lance quantas vezes quiser; o motivo é opcional. «Corrigir» troca o total do dia pelo valor; «Somar» põe o valor em cima do que o dia já tem (negativo tira). O desafio é a soma dos dias. Tudo fica no histórico, com a hora; remover o último volta ao anterior.'
            : 'O valor soma no placar de todo mundo (Gestão e TV). Negativo tira. Ajuste com setor só conta se o setor soma. Remover deixa o registro.'}
        </p>
        {manual && (
          // O placar dia a dia: clicar num dia escolhe ele para lançar.
          <div className="mt-3 flex flex-wrap items-stretch gap-2" role="group" aria-label="Valor de cada dia do desafio">
            {porDia.map((x, i) => (
              <div key={x.dia} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground" aria-hidden>+</span>}
                <button
                  type="button"
                  onClick={() => setDia(x.dia)}
                  aria-pressed={x.dia === dia}
                  className={cn('rounded-lg border px-3 py-1.5 text-left text-sm transition-colors',
                    x.dia === dia ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}
                >
                  <span className="block text-xs text-muted-foreground">{semanaCurta(x.dia)} {dataCurta(x.dia)}</span>
                  <strong className="tabular-nums">{brl(x.valor)}</strong>
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground" aria-hidden>=</span>
              <div className="rounded-lg bg-muted px-3 py-1.5 text-sm">
                <span className="block text-xs text-muted-foreground">Desafio</span>
                <strong className="tabular-nums">{brl(totalDoDesafio)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
      {manual && (
        <div className="flex flex-wrap gap-2 px-4 pt-4" role="radiogroup" aria-label="Como lançar">
          {([['corrigir', 'Corrigir o total do dia'], ['somar', 'Somar ao dia']] as const).map(([m, rotulo]) => (
            <Button key={m} type="button" size="sm" variant={modo === m ? 'default' : 'outline'} role="radio" aria-checked={modo === m} onClick={() => setModo(m)}>
              {rotulo}
            </Button>
          ))}
        </div>
      )}
      <form className={cn('grid gap-3 p-4 sm:items-end', manual ? 'sm:grid-cols-[auto_10rem_1fr_auto]' : 'sm:grid-cols-[auto_auto_10rem_1fr_auto]')} onSubmit={e => { e.preventDefault(); void lancar(); }}>
        <label className="text-sm">Dia
          <select className={campo} value={dia} onChange={e => setDia(e.target.value)}>
            {d.dias.map(x => <option key={x} value={x}>{semanaCurta(x)} {dataCurta(x)}</option>)}
          </select>
        </label>
        {/* Manual: o lançamento é o total do dia, do geral — sem setor. */}
        {!manual && (
          <label className="text-sm">Setor
            <select className={campo} value={setor} onChange={e => setSetor(e.target.value)}>
              <option value="">Geral</option>
              {d.setores.filter(s => s.soma).map(s => <option key={s.setor_id} value={s.setor_id}>{s.nome}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm">{!manual ? 'Valor (R$)' : modo === 'somar' ? 'Quanto somar (R$)' : 'Total do dia (R$)'}
          <Input inputMode="decimal" placeholder="1.234,56" value={valor} onChange={e => setValor(e.target.value)} />
        </label>
        <label className="text-sm">Motivo <span className="text-muted-foreground">(opcional)</span>
          <Input placeholder={manual ? 'Ex.: recebido das 12h às 14h' : 'Ex.: baixa que o 59 não trouxe'} value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} />
        </label>
        <Button type="submit" disabled={!valido || salvando}><Plus className="mr-2 h-4 w-4" aria-hidden /> Lançar</Button>
        <p className={cn('text-sm', manual ? 'sm:col-span-4' : 'sm:col-span-5')} role="status" aria-live="polite">
          {valor.trim() && problema
            ? <span className="text-muted-foreground">Para lançar falta {problema}.</span>
            : manual && novoTotalDoDia !== null
              ? <>{nomeDoDia}: <span className="tabular-nums">{brl(lancadoNoDia)}</span> → <strong className="tabular-nums">{brl(novoTotalDoDia)}</strong>
                  <span className="text-muted-foreground"> · desafio </span><span className="tabular-nums">{brl(totalDoDesafio)}</span> → <strong className="tabular-nums">{brl(totalDoDesafio - lancadoNoDia + novoTotalDoDia)}</strong></>
              : manual
                ? <span className="text-muted-foreground">Valendo em {nomeDoDia}: <span className="tabular-nums">{brl(lancadoNoDia)}</span></span>
                : null}
        </p>
      </form>
      {d.ajustes.length > 0 && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2">Dia</th><th className="px-2 py-2">Setor</th><th className="px-2 py-2 text-right">Valor</th>
              <th className="px-2 py-2">Motivo</th><th className="px-2 py-2">Quem / quando</th><th className="px-4 py-2" />
            </tr></thead>
            <tbody>
              {d.ajustes.map(a => (
                <tr key={a.id} className={cn('border-t border-border', a.removido_em && 'text-muted-foreground line-through', manual && !a.removido_em && !valendo.has(a.id) && 'text-muted-foreground')}>
                  <td className="px-4 py-2">{dataCurta(a.dia)}</td>
                  <td className="px-2 py-2">{nomeSetor(a.setor_id)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {manual ? brl(a.valor) : <>{a.valor > 0 ? '+' : ''}{brl(a.valor)}</>}
                    {manual && valendo.has(a.id) && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">valendo</span>}
                  </td>
                  <td className="px-2 py-2">{a.motivo?.trim() ? a.motivo : '—'}</td>
                  <td className="px-2 py-2 text-xs">{a.criado_por ?? '—'} · {dataCurta(hojeEmSaoPaulo(new Date(a.criado_em)))} {horaCurta(a.criado_em)}</td>
                  <td className="px-4 py-2 text-right">
                    {!a.removido_em && (
                      <Button size="sm" variant="ghost" onClick={() => remover(a.id)} aria-label={`Remover o ajuste de ${brl(a.valor)}`}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Configuração ────────────────────────────────────────────────────────────

function Configuracao({ d }: { d: DetalheCobranca }) {
  const recarregar = useRecarregar();
  const [c, setC] = useState<ConfigDoDesafio>({
    titulo: d.titulo, subtitulo: d.subtitulo, dias: d.dias, meta_geral: d.meta_geral, premio_dia: d.premio_dia,
    premio_hora: d.premio_hora, premio_requisito: d.premio_requisito, regra_medias: d.regra_medias, regra_premio: d.regra_premio,
    regra_medias_maior: d.regra_medias_maior, regra_premio_maior: d.regra_premio_maior,
  });
  const [salvando, setSalvando] = useState(false);
  const mudar = <K extends keyof ConfigDoDesafio>(k: K, v: ConfigDoDesafio[K]) => setC(x => ({ ...x, [k]: v }));
  const dias = [...new Set(c.dias.filter(Boolean))].sort();
  const valido = dias.length > 0 && c.meta_geral > 0 && c.regra_medias > 0 && c.regra_medias_maior > c.regra_medias && c.titulo.trim() !== '';

  async function salvar() {
    setSalvando(true);
    try {
      await salvarConfig(d.id, { ...c, dias });
      // Dia novo precisa de leitura do 59 já, sem esperar o robô.
      await lerAgora(d.id);
      toast.success('Configuração salva.');
      await recarregar();
    } catch (e) {
      toast.error(`Não salvou: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className={caixa} aria-labelledby="dc-config-titulo">
      <div className="border-b border-border p-4">
        <h2 id="dc-config-titulo" className="font-semibold">Período, meta e prêmio</h2>
      </div>
      <form className="grid gap-4 p-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void salvar(); }}>
        <label className="text-sm">Título<Input value={c.titulo} onChange={e => mudar('titulo', e.target.value)} maxLength={60} /></label>
        <label className="text-sm">Subtítulo<Input value={c.subtitulo} onChange={e => mudar('subtitulo', e.target.value)} maxLength={60} /></label>
        <fieldset className="text-sm sm:col-span-2">
          <legend>Dias do desafio</legend>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {c.dias.map((x, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <Input type="date" className="w-40" value={x} onChange={e => mudar('dias', c.dias.map((y, k) => (k === i ? e.target.value : y)))} aria-label={`Dia ${i + 1}`} />
                {c.dias.length > 1 && (
                  <Button type="button" size="icon" variant="ghost" onClick={() => mudar('dias', c.dias.filter((_, k) => k !== i))} aria-label={`Tirar o dia ${i + 1}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </span>
            ))}
            {c.dias.length < 10 && (
              <Button type="button" size="sm" variant="outline" onClick={() => mudar('dias', [...c.dias, ''])}><Plus className="mr-1 h-4 w-4" aria-hidden /> Dia</Button>
            )}
          </div>
        </fieldset>
        <label className="text-sm">Meta geral (R$)
          <Input type="number" min={1} step={1000} value={c.meta_geral} onChange={e => mudar('meta_geral', Number(e.target.value))} />
        </label>
        <label className="text-sm">Dia da folga
          <Input type="date" value={c.premio_dia ?? ''} onChange={e => mudar('premio_dia', e.target.value || null)} />
        </label>
        <label className="text-sm">Saída às
          <Input type="time" value={c.premio_hora} onChange={e => mudar('premio_hora', e.target.value)} />
        </label>
        <label className="text-sm">Requisito
          <Input value={c.premio_requisito} onChange={e => mudar('premio_requisito', e.target.value)} maxLength={80} />
        </label>
        <label className="text-sm">Individual, 1º nível: médias
          <Input type="number" min={0.5} step={0.5} value={c.regra_medias} onChange={e => mudar('regra_medias', Number(e.target.value))} />
        </label>
        <label className="text-sm">Individual, 1º nível: prêmio
          <Input value={c.regra_premio} onChange={e => mudar('regra_premio', e.target.value)} maxLength={60} />
        </label>
        <label className="text-sm">Individual, 2º nível: médias
          <Input type="number" min={0.5} step={0.5} value={c.regra_medias_maior} onChange={e => mudar('regra_medias_maior', Number(e.target.value))} />
        </label>
        <label className="text-sm">Individual, 2º nível: prêmio
          <Input value={c.regra_premio_maior} onChange={e => mudar('regra_premio_maior', e.target.value)} maxLength={60} />
        </label>
        {c.regra_medias_maior <= c.regra_medias && (
          <p className="text-sm text-destructive sm:col-span-2">O 2º nível precisa de mais médias que o 1º.</p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={!valido || salvando}>Salvar configuração</Button>
        </div>
      </form>
    </section>
  );
}
