// Dashboard — a primeira tela do operador. Mesma estrutura de
// `pages/Dashboard/index.tsx` na BookPlay: saudação, régua de escopo
// (FiltroEscopo), faixa do mês e o painel de metas (FaixaDiasUteis, CardsMetas,
// CardMetaDonut e EvolucaoDiaria).

import {
  Building2, CalendarCheck, CalendarClock, CalendarRange, ChevronDown, ChevronLeft, ChevronRight,
  DollarSign, Gauge, Layers, RefreshCw, Target, TrendingUp, User,
} from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import { cn } from '@/lib/utils';
import { entrada, entre, ms, SUAVE } from '../../movimento';
import {
  AGENDADO_POR_DIA, DIAS_UTEIS, HOJE, MES_ROTULO, POR_DIA, RECORTES, SEM_EXPEDIENTE,
  type NumerosDoRecorte, type Recorte,
} from '../dados';
import type { TempoApp } from '../roteiro';
import {
  AnelProjecao, COR_QUARTIL, corDaMeta, corProjecao, corTexto, Destaque, DonutChart, formatBRL, MetricCard,
} from '../ui';
import { FormaSaudacao } from './FormaSaudacao';
import { usePessoa } from '../pessoa';

type Props = { t: TempoApp; entra: number; visita: 1 | 2 };

/** Qual recorte está na tela, e desde quando. */
function recorteEm(t: TempoApp, f: number): { atual: Recorte; anterior: Recorte; desde: number } {
  const c = t.clique;
  const trocas: { f: number; r: Recorte }[] = [
    { f: -Infinity, r: 'individual' },
    { f: c.equipe, r: 'equipe' },
    { f: c.setor, r: 'setor' },
    { f: c.minhaVisao, r: 'individual' },
  ];
  let i = 0;
  for (let k = 0; k < trocas.length; k++) if (f >= trocas[k].f) i = k;
  return { atual: trocas[i].r, anterior: trocas[Math.max(0, i - 1)].r, desde: trocas[i].f };
}

/** A troca suave do app (TrocaSuave): o valor novo sobe 8 px e sai do desfoque. */
function troca(f: number, desde: number): React.CSSProperties {
  if (!Number.isFinite(desde)) return {};
  const p = entre(f, desde, desde + ms(320), 0, 1);
  return { display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 8}px)`, filter: p < 1 ? `blur(${(1 - p) * 3}px)` : undefined };
}

export const Dashboard: React.FC<Props> = ({ t, entra, visita }) => {
  const f = useCurrentFrame();
  const pessoa = usePessoa();
  const { atual, anterior, desde } = recorteEm(t, f);
  const n = RECORTES[atual];
  const nAnt = RECORTES[anterior];
  // na primeira abertura os números rolam do zero
  const k = visita === 1 ? entre(f, entra + ms(250), entra + ms(1250), 0, 1, SUAVE) : 1;
  const mudou = Number.isFinite(desde) && f >= desde;
  const p = mudou ? entre(f, desde, desde + ms(650), 0, 1, SUAVE) : 1;
  const mistura = (campo: keyof NumerosDoRecorte) => ((nAnt[campo] as number) + ((n[campo] as number) - (nAnt[campo] as number)) * p) * k;

  const pctMeta = mistura('pctMeta');
  const projecao = mistura('projecaoPct');
  const corProj = corProjecao(n.projecaoPct);
  const corQ = COR_QUARTIL[n.quartil];
  const ts = mudou ? troca(f, desde) : {};

  // rolagem: na 1ª visita a página desce até o gráfico no «faz uma diferença»
  const rolagem = visita === 1 ? entre(f, t.rolaDash, t.rolaDash + ms(900), 0, 300, SUAVE) : 0;

  const destaques = t.detalhes.map((d, i) => {
    const fim = i < t.detalhes.length - 1 ? t.detalhes[i + 1] : d + ms(1400);
    return visita === 1 ? Math.min(entre(f, d, d + ms(260), 0, 1), entre(f, fim, fim + ms(260), 1, 0)) : 0;
  });
  const destaqueQuartil = visita === 2 ? Math.min(entre(f, t.ondeEsta, t.ondeEsta + ms(260), 0, 1), entre(f, t.c8.inicio - ms(200), t.c8.inicio, 1, 0)) : 0;

  const E = (i: number) => entrada(f, entra, i, { passoMs: 45 });

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="p-6 max-w-[1400px] mx-auto" style={{ transform: `translateY(${-rolagem}px)` }}>
        {/* Saudação */}
        <div className="flex items-start justify-between mb-6" style={E(0)}>
          <div>
            <h1 className="flex items-center gap-1.5 text-2xl font-bold text-foreground">
              <span>Boa tarde, {pessoa.primeiroNome}!</span>
              <FormaSaudacao />
            </h1>
            <p className="text-sm text-muted-foreground capitalize mt-0.5">{HOJE.semana}, {HOJE.extenso}</p>
            <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> {pessoa.marca}
            </p>
          </div>
        </div>

        <div className="mb-6 space-y-2">
          {/* FiltroEscopo */}
          <div className="flex flex-col gap-2 px-4 py-3 rounded-xl border border-border bg-card" data-alvo="escopo" style={E(1)}>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-muted/30">
                {([
                  { r: 'individual', rotulo: 'Minha visão', Icone: User },
                  { r: 'equipe', rotulo: 'Minha equipe', Icone: Layers },
                  { r: 'setor', rotulo: 'Meu setor', Icone: Building2 },
                ] as const).map(({ r, rotulo, Icone }) => (
                  <span
                    key={r}
                    data-alvo={`escopo-${r}`}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                      atual === r ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <Icone className="w-3.5 h-3.5 shrink-0" /> {rotulo}
                  </span>
                ))}
              </div>
              {atual === 'individual' && (
                <span className="text-[11px] text-muted-foreground">Setor e equipe não se aplicam a uma pessoa só.</span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {/* faixa do AnalyticsPanel (BookPlay: só os controles) */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border/70 bg-card shadow-sm" style={E(2)}>
              <div className="flex items-center gap-0.5">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground"><ChevronLeft className="w-3.5 h-3.5" /></span>
                <span className="text-[11px] leading-none min-w-[92px] text-center tabular-nums text-muted-foreground">{MES_ROTULO}</span>
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground opacity-50"><ChevronRight className="w-3.5 h-3.5" /></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></span>
              </div>
            </div>

            <div className="space-y-3">
              {/* FaixaDiasUteis */}
              <div className="flex items-center gap-x-4 gap-y-2 flex-wrap px-3 py-2 rounded-lg border border-border/60 bg-muted/20" style={E(3)}>
                <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Item valor={DIAS_UTEIS.passados} rotulo="dias úteis passados" />
                <span className="text-border">·</span>
                <Item valor={DIAS_UTEIS.restantes} rotulo="restantes" />
                <span className="text-border">·</span>
                <Item valor={DIAS_UTEIS.total} rotulo="no mês" />
                <div className="flex-1 min-w-[80px] h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${(DIAS_UTEIS.passados / DIAS_UTEIS.total) * 100 * k}%` }} />
                </div>
              </div>

              {/* CardsMetas */}
              <div className="grid gap-3 items-start lg:grid-cols-3" data-alvo="dash-cards">
                <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2">
                  <div className="relative" style={E(4)}>
                    <MetricCard
                      alvo="dash-total"
                      label="Total recebido"
                      icon={<DollarSign className="w-4 h-4" />}
                      accentColor={COR_QUARTIL[1]}
                      gradientFrom={COR_QUARTIL[1]}
                      trend="up"
                      className="h-full"
                      value={<span className="text-emerald-600" style={ts}>{formatBRL(mistura('recebido'))}</span>}
                      sub={`Meta ${n.rotulo}: ${formatBRL(n.meta)}`}
                    />
                    <Destaque forca={destaques[0]} />
                  </div>
                  <div className="relative" style={E(5)}>
                    <MetricCard
                      alvo="dash-projecao"
                      label="Projeção"
                      icon={<Gauge className="w-4 h-4" />}
                      accentColor={corProj}
                      gradientFrom={corProj}
                      trend={n.projecaoPct >= 100 ? 'up' : 'down'}
                      value={
                        <div className="flex justify-center py-1">
                          <AnelProjecao pct={projecao} cor={corProj} />
                        </div>
                      }
                      sub="do esperado até hoje"
                    />
                    <Destaque forca={destaques[1]} />
                  </div>
                  <div style={E(6)}>
                    <MetricCard
                      label="Valor esperado"
                      icon={<CalendarCheck className="w-4 h-4" />}
                      accentColor="#6366f1"
                      gradientFrom="#6366f1"
                      value={<span style={ts}>{formatBRL(mistura('esperado'))}</span>}
                      sub={`Com base em ${DIAS_UTEIS.passados} de ${DIAS_UTEIS.total} dias úteis`}
                    />
                  </div>
                  <div style={E(7)}>
                    <MetricCard
                      label="Diferença para projeção"
                      icon={<TrendingUp className="w-4 h-4" />}
                      accentColor={COR_QUARTIL[1]}
                      gradientFrom={COR_QUARTIL[1]}
                      trend="up"
                      value={<span style={{ color: corTexto(COR_QUARTIL[1]), ...ts }}>+ {formatBRL(Math.abs(mistura('diferenca')))}</span>}
                      sub="Acima da meta projetada"
                    />
                  </div>
                  <div className="relative" style={E(8)}>
                    <MetricCard
                      alvo="dash-quartil"
                      label="Análise por quartil"
                      icon={<Layers className="w-4 h-4" />}
                      accentColor={corQ}
                      gradientFrom={corQ}
                      value={<span style={{ color: corTexto(corQ), ...ts }}>{n.quartil}º Quartil</span>}
                      sub={`Faltam ${formatBRL(mistura('falta'))} · ${pctMeta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da meta`}
                    />
                    <Destaque forca={destaqueQuartil} />
                  </div>
                </div>

                {/* CardMetaDonut */}
                <div className="relative" style={E(6)}>
                  <div data-alvo="dash-donut" className="rounded-lg border bg-card text-card-foreground flex flex-col border-border/70 shadow-sm h-[26rem]">
                    <div className="flex flex-col space-y-1.5 pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2 min-w-0 leading-none tracking-tight">
                          <div className="flex items-center justify-center w-6 h-6 rounded-md shrink-0" style={{ background: corDaMeta(n.pctMeta) + '22' }}>
                            <Target className="w-3.5 h-3.5" style={{ color: corTexto(corDaMeta(n.pctMeta)) }} />
                          </div>
                          <span className="truncate">Progresso da meta</span>
                        </h3>
                        <span className="inline-flex items-center h-6 text-[11px] gap-1 text-muted-foreground px-2 shrink-0">
                          Formas de pagamento <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                    <div className="p-6 pt-0 flex-1 min-h-0 pb-5">
                      <div className="flex h-full flex-col items-center justify-center gap-4">
                        <DonutChart percent={pctMeta} sublabel="da meta" color={corDaMeta(n.pctMeta)} size={180} />
                        <div className="text-center space-y-1">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono tabular-nums font-semibold text-foreground" style={ts}>{formatBRL(mistura('recebido'))}</span>
                            {' '}de{' '}
                            <span className="font-mono tabular-nums">{formatBRL(n.meta)}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground/80">meta {n.rotulo}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Destaque forca={destaques[2]} />
                </div>
              </div>

              {/* EvolucaoDiaria */}
              <div className="relative" style={E(9)}>
                <Evolucao f={f} entra={entra} />
                <Destaque forca={destaques[3]} />
              </div>

              <div className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm" style={E(10)}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CalendarClock className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">Agendamentos e conversão</span>
                  <span className="block text-xs text-muted-foreground">Agendado por dia, taxa de conversão e quebra por tipo</span>
                </span>
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function Item({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-sm font-semibold tabular-nums font-mono text-foreground leading-none">{valor}</span>
      <span className="text-[11px] text-muted-foreground leading-none">{rotulo}</span>
    </div>
  );
}

// ── o gráfico de evolução diária (recharts no app; aqui em SVG) ─────────
const CHART_RECEBIDO = '#22c55e';
const CHART_AGENDADO = '#6366f1';
const TICK = 'oklch(0.48 0.02 220)';

function Evolucao({ f, entra }: { f: number; entra: number }) {
  const L = 1288;
  const A = 230;
  const m = { top: 14, right: 14, left: 50, bottom: 22 };
  const w = L - m.left - m.right;
  const h = A - m.top - m.bottom;
  const max = 2000;
  const metaDiaria = 22000 / DIAS_UTEIS.total;
  const dias = Array.from({ length: 31 }, (_, i) => i + 1);
  const passo = w / 31;
  const x = (d: number) => m.left + passo * (d - 0.5);
  const y = (v: number) => m.top + h * (1 - v / max);
  const cresce = (d: number) => entre(f, entra + ms(500 + d * 25), entra + ms(1100 + d * 25), 0, 1, SUAVE);
  const total = Object.values(POR_DIA).reduce((a, b) => a + b, 0);
  const melhor = Math.max(...Object.values(POR_DIA));
  const linhaAgendado = Object.entries(AGENDADO_POR_DIA)
    .map(([d, v]) => `${x(Number(d))},${y(v * cresce(Number(d)))}`)
    .join(' ');

  return (
    <div data-alvo="dash-evolucao" className="rounded-lg border bg-card text-card-foreground border-border/70 shadow-sm">
      <div className="flex flex-col space-y-1.5 pb-1 pt-4 px-4">
        <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-foreground leading-none tracking-tight">Evolução diária</h3>
            <div className="inline-flex rounded-md bg-muted p-0.5">
              <span className="rounded-[5px] px-2 py-0.5 text-[10px] font-medium bg-card text-foreground shadow-sm">Dia</span>
              <span className="rounded-[5px] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Baixa</span>
            </div>
          </div>
          <div className="flex items-center gap-3.5 text-[10px] text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-[2px]" style={{ background: CHART_RECEBIDO }} />Recebido</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-[2px]" style={{ background: CHART_RECEBIDO, opacity: 0.32 }} />Abaixo da meta</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-[2px] rounded-full" style={{ background: CHART_AGENDADO }} />Agendado</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 border-t border-dashed" style={{ borderColor: TICK }} />Meta diária</span>
          </div>
        </div>
      </div>
      <div className="px-2 pb-3">
        <svg width={L} height={A} style={{ display: 'block' }}>
          {[0, 500, 1000, 1500, 2000].map((v) => (
            <g key={v}>
              <line x1={m.left} x2={L - m.right} y1={y(v)} y2={y(v)} stroke="oklch(0.88 0.01 220)" strokeDasharray="3 3" />
              <text x={m.left - 8} y={y(v) + 3} fontSize={9} fill={TICK} textAnchor="end">{v === 0 ? 'R$ 0' : `R$ ${v >= 1000 ? `${v / 1000}k` : v}`}</text>
            </g>
          ))}
          <line x1={m.left} x2={L - m.right} y1={y(metaDiaria)} y2={y(metaDiaria)} stroke={TICK} strokeDasharray="4 4" strokeOpacity={0.55} />
          <text x={L - m.right - 4} y={y(metaDiaria) - 5} fontSize={9} fill={TICK} opacity={0.8} textAnchor="end">{formatBRL(metaDiaria)}</text>
          {dias.map((d) => {
            const v = POR_DIA[d];
            if (!v) return null;
            const alt = (h * v) / max * cresce(d);
            const bw = Math.min(22, passo * 0.7);
            const acima = v >= metaDiaria;
            return (
              <rect
                key={d}
                x={x(d) - bw / 2}
                y={m.top + h - alt}
                width={bw}
                height={alt}
                rx={3}
                fill={CHART_RECEBIDO}
                fillOpacity={acima ? 1 : 0.32}
                stroke={d === HOJE.dia ? CHART_RECEBIDO : undefined}
                strokeWidth={d === HOJE.dia ? 1.5 : 0}
              />
            );
          })}
          <polyline points={linhaAgendado} fill="none" stroke={CHART_AGENDADO} strokeWidth={1.5} strokeDasharray="3 3" />
          {dias.filter((d) => d % 2 === 1 || d === 30).map((d) => (
            <text key={d} x={x(d)} y={A - 6} fontSize={9} fill={TICK} textAnchor="middle" opacity={SEM_EXPEDIENTE.has(d) ? 0.6 : 1}>{d}</text>
          ))}
        </svg>
        <div className="flex items-center justify-center gap-x-3 gap-y-1 flex-wrap px-2 text-[10px] text-muted-foreground">
          <span>{Object.keys(POR_DIA).length} dias com recebimento</span>
          <span>·</span>
          <span>Total <strong className="text-foreground tabular-nums font-mono">{formatBRL(total)}</strong></span>
          <span>·</span>
          <span>Melhor dia <strong className="text-foreground tabular-nums font-mono">{formatBRL(melhor)}</strong></span>
        </div>
      </div>
    </div>
  );
}
