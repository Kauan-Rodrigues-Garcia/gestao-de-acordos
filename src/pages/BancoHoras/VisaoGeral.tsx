/**
 * Visão geral: os números grandes, o comparativo dos últimos 3 meses, como
 * está o time (cada pessoa num grupo) e quem está em destaque.
 */
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Clock, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { KpiTile, type TomKpi } from '@/components/KpiTile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  acumuladoAte, grupoDe, grupos, somaDoMes, totais, valorNoGrupo, verNegativas, verPositivas, verVencimento,
  type Pessoa,
} from '@/lib/bancoHoras/calculos';
import { data as fmtData, diaMes, horas, horasRedondas, MESES_CURTOS, mesCurto, mesLongo, plural } from '@/lib/bancoHoras/formato';
import type { ContextoBH } from './contexto';
import { TOM, tomDaPessoa } from './cores';
import { BarraEmpilhada, Horas, LinhaPessoa, Vazio } from './partes';

const LIMITES = [20, 30, 40, 60, 80, 100];

export function VisaoGeral({ c }: { c: ContextoBH }) {
  return (
    <div className="space-y-4">
      <Numeros c={c} />
      <Comparativo c={c} />
      <Time c={c} />
      <Destaques c={c} />
    </div>
  );
}

function Numeros({ c }: { c: ContextoBH }) {
  const { F, sit, limite, visao: v } = c;
  const t = totais(F, limite);
  const tiles: { rotulo: string; valor: string; sub: string; Icon: typeof Clock; tom: TomKpi; ir?: () => void }[] = [];
  if (verPositivas(sit)) {
    tiles.push({ rotulo: 'Horas positivas', valor: horas(t.positivas), Icon: TrendingUp, tom: 'primario',
      sub: `${plural(t.nPositivas, 'pessoa', 'pessoas')} com horas guardadas · média ${horas(t.nPositivas ? t.positivas / t.nPositivas : 0)}`,
      ir: () => c.ir('pessoas', { sit: 'pos' }) });
  }
  if (verNegativas(sit)) {
    tiles.push({ rotulo: 'Horas negativas', valor: horas(t.negativas), Icon: TrendingDown, tom: 'perigo',
      sub: `${plural(t.nNegativas, 'pessoa', 'pessoas')} devendo horas`, ir: () => c.ir('pessoas', { sit: 'neg' }) });
  }
  if (verVencimento(sit)) {
    tiles.push({ rotulo: `Vence em ${fmtData(v.prox)}`, valor: horas(t.vence), Icon: AlertTriangle, tom: 'alerta',
      sub: `${plural(t.nVence, 'pessoa precisa', 'pessoas precisam')} compensar`, ir: () => c.ir('vencimentos') });
  }
  if (sit === 'pos') {
    tiles.push({ rotulo: `Acima de ${limite}h`, valor: plural(t.nAcimaLimite, 'pessoa', 'pessoas'), Icon: Clock, tom: 'primario',
      sub: 'para programar folga', ir: () => c.ir('situacao') });
  }
  if (sit === 'neg') {
    tiles.push({ rotulo: 'Média por pessoa', valor: horas(t.nNegativas ? t.negativas / t.nNegativas : 0), Icon: Users, tom: 'perigo', sub: 'de horas devendo' });
    tiles.push({ rotulo: 'Devendo mais de 40h', valor: plural(F.filter(p => p.saldo <= -40 * 60).length, 'pessoa', 'pessoas'),
      Icon: AlertTriangle, tom: 'perigo', sub: 'precisam combinar a reposição', ir: () => c.ir('situacao') });
  }
  if (sit === 'vence') {
    tiles.push({ rotulo: 'Setores com horas vencendo', valor: plural(new Set(F.map(p => p.setor)).size, 'setor', 'setores'),
      Icon: Users, tom: 'alerta', sub: 'veja cada um em Vencimentos', ir: () => c.ir('vencimentos') });
    tiles.push({ rotulo: 'Banco dessas pessoas', valor: horas(t.positivas), Icon: TrendingUp, tom: 'primario', sub: 'horas positivas no total' });
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.slice(0, 3).map(k => (
        <button key={k.rotulo} type="button" onClick={k.ir} disabled={!k.ir} className="text-left disabled:cursor-default">
          <KpiTile rotulo={k.rotulo} valor={k.valor} sub={k.sub} Icon={k.Icon} tom={k.tom}
            className={cn(k.ir && 'transition-shadow hover:shadow-md')} />
        </button>
      ))}
    </div>
  );
}

/** Três painéis: positivas e negativas feitas em cada mês, e o banco acumulado. */
function Comparativo({ c }: { c: ContextoBH }) {
  const { F, sit, visao: v } = c;
  const ms = c.meses;
  const parcial = ms.includes(v.mesAtual) && +v.data.slice(8) < 28;
  const rotulo = (m: string) => (ms.length > 3 ? mesCurto(m) : MESES_CURTOS[+m.slice(5) - 1]);
  const dados = ms.map(m => somaDoMes(F, m));
  const acum = ms.map(m => acumuladoAte(F, m, sit));
  const paineis: { titulo: string; sub: string; vals: number[]; tom: 'pos' | 'neg'; ruimSobe: boolean; pessoas?: number[] }[] = [];
  if (verPositivas(sit)) paineis.push({ titulo: 'Horas positivas', sub: 'feitas em cada mês', vals: dados.map(d => d.pos), tom: 'pos', ruimSobe: false, pessoas: dados.map(d => d.nPos) });
  if (verNegativas(sit)) paineis.push({ titulo: 'Horas negativas', sub: 'ficaram devendo em cada mês', vals: dados.map(d => -d.neg), tom: 'neg', ruimSobe: true, pessoas: dados.map(d => d.nNeg) });
  paineis.push({ titulo: sit === 'neg' ? 'Dívida acumulada' : 'Banco acumulado', sub: 'saldo do banco no fim de cada mês',
    vals: acum.map(Math.abs), tom: sit === 'neg' ? 'neg' : 'pos', ruimSobe: sit === 'neg' });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-sm">
            {c.mesesPadrao ? 'Comparativo dos últimos 3 meses' : `Comparativo de ${ms.length === 1 ? mesLongo(ms[0]) : `${ms.length} meses`}`}
            {/* Os setores marcados no filtro (somados), para não confundir com a empresa inteira. */}
            {c.filtroTxt && <span className="font-normal text-muted-foreground"> · {c.filtroTxt}</span>}
          </CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {parcial ? `* ${MESES_CURTOS[+v.data.slice(5, 7) - 1]} conta só até ${diaMes(v.data)}, o mês ainda não fechou` : 'Mês a mês, lado a lado'}
            {' · '}os meses vêm do filtro «Meses das horas»
            {' · '}o mês é o da hora feita (vencimento − 12 meses)
          </p>
        </div>
      </CardHeader>
      <CardContent className={cn('grid gap-3', paineis.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        {paineis.map(p => {
          const mx = Math.max(1, ...p.vals);
          const a = p.vals.length > 1 ? p.vals[p.vals.length - 2] : 0;
          const b = p.vals[p.vals.length - 1];
          const pct = a > 0 ? Math.round(((b - a) / a) * 100) : null;
          const ruim = pct !== null && (p.ruimSobe ? pct > 0 : false);
          const bom = pct !== null && p.ruimSobe && pct < 0;
          return (
            <div key={p.titulo} className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-foreground">{p.titulo}</p>
                {pct !== null && (
                  <span className={cn('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold',
                    ruim ? 'bg-destructive/10 text-destructive' : bom ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
                    {pct >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {Math.abs(pct)}% vs {MESES_CURTOS[+ms[ms.length - 2].slice(5) - 1]}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{p.sub}</p>
              <div className={cn('mt-3 flex h-36 items-end', ms.length > 6 ? 'gap-1' : 'gap-3')}>
                {ms.map((m, i) => (
                  <div key={m} className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                    title={`${mesLongo(m)}: ${horas(p.vals[i])}${p.pessoas ? ` · ${plural(p.pessoas[i], 'pessoa', 'pessoas')}` : ''}`}>
                    {ms.length <= 8 && <span className={cn('font-mono text-[11px] font-semibold tabular-nums', TOM[p.tom].texto)}>{horasRedondas(p.vals[i])}h</span>}
                    <div className="flex w-full max-w-14 flex-1 items-end">
                      <div className={cn('w-full rounded-t-md', TOM[p.tom].fundo)}
                        style={{ height: `${Math.max(2, (p.vals[i] / mx) * 100)}%`, opacity: i === ms.length - 1 ? 1 : 0.45 }} />
                    </div>
                    <span className="whitespace-nowrap text-[10.5px] font-medium uppercase text-muted-foreground">
                      {rotulo(m)}{m === v.mesAtual && parcial ? '*' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Time({ c }: { c: ContextoBH }) {
  const { F, sit, limite, visao: v } = c;
  const defs = grupos(v, sit, limite);
  const cont: Record<string, number> = {};
  const hs: Record<string, number> = {};
  for (const p of F) {
    const g = grupoDe(p, sit, limite);
    cont[g] = (cont[g] || 0) + 1;
    hs[g] = (hs[g] || 0) + Math.abs(valorNoGrupo(g, p));
  }
  const tot = F.length || 1;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-sm">Como está o time</CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Cada pessoa em um grupo · clique para ver quem é</p>
        </div>
        {sit !== 'neg' && (
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            Limite para folga
            <Select value={String(limite)} onValueChange={x => c.setLimite(+x)}>
              <SelectTrigger className="h-8 w-20 rounded-lg text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{LIMITES.map(h => <SelectItem key={h} value={String(h)}>{h}h</SelectItem>)}</SelectContent>
            </Select>
          </label>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <BarraEmpilhada partes={defs.map(d => ({ valor: cont[d.id] || 0, tom: d.tom, forca: d.forca, titulo: d.titulo }))} />
        <div className={cn('grid gap-2', defs.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : defs.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
          {defs.map(d => {
            const t = TOM[d.tom];
            const n = cont[d.id] || 0;
            return (
              <button key={d.id} type="button" onClick={() => c.ir('situacao')}
                className={cn('rounded-xl border p-3 text-left transition-colors hover:bg-muted/40', t.borda)}>
                <span className={cn('text-[12px] font-semibold', t.texto)}>{d.titulo}</span>
                <span className="mt-1 block font-mono text-2xl font-bold tabular-nums text-foreground">
                  {n}<span className="ml-1 font-sans text-[11px] font-medium text-muted-foreground">{n === 1 ? 'pessoa' : 'pessoas'}</span>
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {horas(hs[d.id] || 0)} {d.id === 'vence' ? 'vencendo' : d.tom === 'neg' ? 'devendo' : 'guardadas'} · {Math.round((n / tot) * 100)}%
                </span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                  <span className={cn('block h-full', t.fundo)} style={{ width: `${(n / tot) * 100}%`, opacity: d.forca }} />
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Destaques({ c }: { c: ContextoBH }) {
  const { F, sit, visao: v } = c;
  const cols: { titulo: string; tom: 'pos' | 'neg' | 'warn'; L: Pessoa[]; val: (p: Pessoa) => number; sub?: (p: Pessoa) => string; vazio: string; ir: () => void }[] = [];
  if (verPositivas(sit)) cols.push({ titulo: 'Mais horas guardadas', tom: 'pos', L: F.filter(p => p.saldo > 0).sort((a, b) => b.saldo - a.saldo).slice(0, 5),
    val: p => p.saldo, vazio: 'Ninguém com horas positivas.', ir: () => c.ir('pessoas', { sit: 'pos' }) });
  if (verVencimento(sit)) cols.push({ titulo: `Vencem em ${diaMes(v.prox)}`, tom: 'warn', L: F.filter(p => p.vprox > 0).sort((a, b) => b.vprox - a.vprox).slice(0, 5),
    val: p => p.vprox, sub: p => `de ${horas(p.saldo)} no banco`, vazio: 'Ninguém com horas vencendo.', ir: () => c.ir('vencimentos') });
  if (verNegativas(sit)) cols.push({ titulo: 'Mais devendo', tom: 'neg', L: F.filter(p => p.saldo < 0).sort((a, b) => a.saldo - b.saldo).slice(0, 5),
    val: p => p.saldo, vazio: 'Ninguém devendo horas.', ir: () => c.ir('pessoas', { sit: 'neg' }) });
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Pessoas em destaque</CardTitle>
        <p className="text-[11px] text-muted-foreground">Clique na pessoa para ver tudo dela</p>
      </CardHeader>
      <CardContent className={cn('grid gap-4', cols.length === 3 ? 'lg:grid-cols-3' : cols.length === 2 ? 'md:grid-cols-2' : '')}>
        {cols.map(col => (
          <div key={col.titulo} className="min-w-0">
            <div className="mb-1 flex items-center gap-2 px-2">
              <span className={cn('h-2 w-2 rounded-full', TOM[col.tom].fundo)} />
              <span className="text-[12.5px] font-semibold text-foreground">{col.titulo}</span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-[11px]" onClick={col.ir}>
                Ver todos <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            {col.L.length ? col.L.map(p => (
              <LinhaPessoa key={p.key} p={p} url={c.fotoDe(p)} tom={tomDaPessoa(p, verVencimento(sit))} onAbrir={c.abrirPessoa}
                valor={<Horas min={col.val(p)} tom={col.tom === 'warn' ? 'warn' : undefined} devendo={false} />}
                sub={col.sub?.(p)} />
            )) : <Vazio>{col.vazio}</Vazio>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

