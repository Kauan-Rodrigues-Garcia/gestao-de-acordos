// Desempenho do Dia — a gaveta que o botão do menu lateral abre
// (`components/DesempenhoDia`): véu desfocado sobre a tela e o painel no canto
// de baixo à esquerda, com Recebido no dia, Meta do dia e Minha operação.

import {
  BarChart2, ChevronLeft, ChevronRight, CalendarIcon, FileText, RefreshCw, Target, TrendingUp, Users, X,
} from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import { aperto, entre, mola, ms, SUAVE } from '../../movimento';
import { DIA, HOJE, OPERADORA } from '../dados';
import { APP_A } from '../layout';
import type { TempoApp } from '../roteiro';
import { corProjecao, corTexto, formatBRL } from '../ui';

export const DesempenhoDia: React.FC<{ t: TempoApp }> = ({ t }) => {
  const f = useCurrentFrame();
  const c = t.clique;
  const abre = c.desempenho + ms(40);
  const fecha = c.fecharDia + ms(40);
  if (f < abre || f > fecha + ms(260)) return null;

  const entra = mola(f, abre, { mass: 0.7, stiffness: 400, damping: 34, overshootClamping: false });
  const sai = entre(f, fecha, fecha + ms(220), 0, 1);
  const vis = Math.min(1, entre(f, abre, abre + ms(150), 0, 1)) * (1 - sai);

  // o dinheiro do dia
  const chegou = entre(f, t.atualizado + ms(200), t.atualizado + ms(900), 0, 1, SUAVE);
  const recebido = DIA.recebidoAntes * entre(f, t.contaRecebido, t.contaRecebido + ms(1100), 0, 1, SUAVE) + (DIA.recebidoDepois - DIA.recebidoAntes) * chegou;
  const pct = Math.round((recebido / DIA.metaDia) * 100);
  const barra = Math.min(100, pct) * entre(f, t.falta - ms(300), t.falta + ms(500), 0, 1, SUAVE);
  const novoPago = f >= t.atualizado + ms(200);
  const pagos = DIA.pagos + (novoPago ? 1 : 0);
  const aVerificar = DIA.aVerificar - (novoPago ? 1 : 0);
  const brilho = Math.min(entre(f, t.atualizado + ms(200), t.atualizado + ms(450), 0, 1), entre(f, t.atualizado + ms(1100), t.atualizado + ms(1700), 1, 0));
  const aparece = (i: number) => {
    const p = entre(f, abre + ms(120 + i * 70), abre + ms(420 + i * 70), 0, 1);
    return { opacity: p, transform: `translateY(${(1 - p) * 8}px)` };
  };

  return (
    <div className="absolute inset-0" style={{ zIndex: 40 }}>
      <div className="absolute inset-0 bg-black/25" style={{ opacity: vis, backdropFilter: `blur(${2 * vis}px)` }} />
      <div
        data-alvo="dia-gaveta"
        className="absolute flex w-[420px] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xl font-sans"
        style={{ left: 16, bottom: 16, height: Math.min(620, APP_A * 0.85), opacity: vis, transform: `translateY(${(1 - entra) * 20 + sai * 10}px)` }}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
              <BarChart2 className="h-4 w-4 text-violet-500" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none">Desempenho do Dia</p>
              <p className="mt-1 flex items-center gap-1 truncate text-[11px] leading-none text-muted-foreground">
                <Users className="h-3 w-3 shrink-0" /> {OPERADORA.nome}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg"><RefreshCw className="h-3.5 w-3.5 text-muted-foreground" /></span>
            <span data-alvo="dia-fechar" className="inline-flex items-center justify-center h-7 w-7 rounded-lg" style={{ scale: String(aperto(f, c.fecharDia)) }}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </div>
        </header>

        <div className="shrink-0 space-y-2 border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-lg border border-input h-7 w-7 shrink-0"><ChevronLeft className="h-3.5 w-3.5" /></span>
            <div className="flex-1">
              <div className="inline-flex items-center rounded-md border border-input w-full h-7 text-xs justify-start gap-2 font-mono px-2">
                <CalendarIcon className="w-3 h-3 shrink-0 text-muted-foreground" /> {HOJE.br}
              </div>
            </div>
            <span className="inline-flex items-center justify-center rounded-lg border border-input h-7 w-7 shrink-0 opacity-50"><ChevronRight className="h-3.5 w-3.5" /></span>
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-4 py-3.5">
          <div className="space-y-3.5">
            {/* FaixaDinheiro */}
            <section className="space-y-2.5" style={aparece(0)}>
              <div className="flex items-start justify-between gap-2" data-alvo="dia-recebido">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Recebido no dia
                    <span className="ml-1 font-normal normal-case opacity-70">· relatório do ERP</span>
                  </p>
                  <span
                    className="block font-mono text-2xl font-bold leading-tight tracking-tight tabular-nums text-emerald-600"
                    style={{ textShadow: brilho > 0 ? `0 0 ${16 * brilho}px rgba(16,185,129,${0.45 * brilho})` : undefined }}
                  >
                    {formatBRL(recebido)}
                  </span>
                </div>
                {brilho > 0 && (
                  <span
                    className="mt-3 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600"
                    style={{ opacity: brilho, transform: `translateY(${(1 - brilho) * 6}px)` }}
                  >
                    + {formatBRL(DIA.recebidoDepois - DIA.recebidoAntes)} agora
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-emerald-500/10 text-emerald-600">
                  <TrendingUp className="h-3 w-3" />+{DIA.vsOntem}%<span className="font-normal opacity-70">vs. ontem</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-emerald-500/10 text-emerald-600">
                  <TrendingUp className="h-3 w-3" />+{DIA.vsMedia}%<span className="font-normal opacity-70">vs. média 7 dias</span>
                </span>
              </div>
              <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5" data-alvo="dia-meta">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Target className="h-3 w-3" /> Meta do dia</span>
                  <span className="font-mono font-semibold tabular-nums">{formatBRL(DIA.metaDia)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                  <div className="h-full rounded-full" style={{ width: `${barra}%`, background: corProjecao(pct) }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-semibold tabular-nums" style={{ color: corTexto(corProjecao(pct)) }}>{pct}% da meta do dia</span>
                  <span>21 dias úteis no mês</span>
                </div>
              </div>
            </section>

            {/* FaixaOperacao */}
            <section className="space-y-2.5 rounded-xl border border-border/60 bg-card/60 px-3 py-3" style={aparece(1)}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Minha operação<span className="ml-1 font-normal normal-case opacity-70">· acordos tabulados</span>
                </p>
                <span className="font-mono text-sm font-bold tabular-nums">
                  {DIA.agendados}<span className="ml-1 text-[10px] font-normal text-muted-foreground">agendados</span>
                </span>
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                  <div className="flex h-full w-full">
                    <div className="h-full bg-emerald-500" style={{ width: `${(pagos / DIA.agendados) * 100}%` }} />
                    <div className="h-full bg-amber-500" style={{ width: `${(aVerificar / DIA.agendados) * 100}%` }} />
                    <div className="h-full bg-rose-500" style={{ width: `${(DIA.naoPagos / DIA.agendados) * 100}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {[
                    { q: pagos, r: 'pagos', cor: '#10b981' },
                    { q: aVerificar, r: 'a verificar', cor: '#f59e0b' },
                    { q: DIA.naoPagos, r: 'não pagos', cor: '#f43f5e' },
                  ].map((s) => (
                    <span key={s.r} className="inline-flex items-center gap-1.5 text-[11px]">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.cor }} />
                      <span className="font-semibold tabular-nums">{s.q}</span>
                      <span className="text-muted-foreground">{s.r}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><FileText className="h-3 w-3" /> Formalizados hoje</span>
                <span className="font-mono text-sm font-bold tabular-nums">{DIA.formalizados}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">Conversão<span className="ml-1 opacity-70">· do que já foi conferido</span></span>
                <span className="font-mono font-semibold tabular-nums">{DIA.conversao}%</span>
              </div>
            </section>
          </div>
        </div>

        <footer className="shrink-0 border-t border-border/60 px-4 py-1.5">
          <p className="text-center text-[10px] text-muted-foreground">
            <kbd className="rounded border border-border px-1">←</kbd> <kbd className="rounded border border-border px-1">→</kbd>
            {' muda o dia · '}
            <kbd className="rounded border border-border px-1">Esc</kbd>
            {' fecha'}
          </p>
        </footer>
      </div>
    </div>
  );
};
