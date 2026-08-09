/**
 * PixComissaoDobrada.tsx — o card da comissão dobrada do operador.
 *
 * ## Por que é UM card e não dois
 *
 * Antes eram dois: `PixDobraCard` contava os 18 acordos e dizia "meta batida —
 * comissão dobrada" ao chegar lá; logo abaixo, um bloco solto de "bônus por
 * meta" dizia que bastava bater a meta do mês para receber tudo de novo. Dois
 * desenhos diferentes, duas promessas, e nenhuma das duas era a regra.
 *
 * A regra é uma só, com DOIS requisitos que precisam fechar juntos:
 *
 *   1. 18 acordos Pix feitos no mês;
 *   2. a meta de recebimento do mês batida.
 *
 * Cumpridos os dois, o operador recebe de novo o que já fez de comissão — fez
 * R$ 100,00, leva R$ 200,00. Por isso os requisitos aparecem como uma lista de
 * confirmação (✓ / ○), e o valor final só é prometido quando os dois estão
 * verdes.
 *
 * As contas moram em `calcularDobraComissao` (pura, com teste). Aqui só o
 * desenho.
 */
import { motion } from 'framer-motion';
import { Trophy, CircleCheck, Circle, Zap, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { DobraComissao } from './pixAutomaticoView';

export interface PixComissaoDobradaProps {
  dobra: DobraComissao;
  /**
   * Projeção do mês em % (mesma do painel de metas). Só entra como dica de
   * ritmo enquanto a meta não fecha — não é requisito.
   */
  projecao?: number | null;
}

/** Uma linha de requisito: ✓ quando cumprido, ○ enquanto falta. */
function Requisito({
  ok, titulo, detalhe, pct, faltando, dourado,
}: {
  ok: boolean;
  titulo: string;
  detalhe: string;
  pct: number;
  faltando: string | null;
  dourado: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {ok
        ? <CircleCheck className={cn('w-4 h-4 shrink-0 mt-0.5',
            dourado ? 'text-amber-400' : 'text-emerald-400')} />
        : <Circle className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground/50" />}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className={cn('text-xs font-medium',
            ok ? 'text-foreground' : 'text-muted-foreground')}>
            {titulo}
          </p>
          <p className={cn('text-[11px] font-mono tabular-nums',
            ok ? (dourado ? 'text-amber-400' : 'text-emerald-400') : 'text-muted-foreground')}>
            {detalhe}
          </p>
        </div>

        <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500',
              ok ? (dourado ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-violet-400/70')}
            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
          />
        </div>

        {!ok && faltando && (
          <p className="text-[10.5px] text-muted-foreground mt-1">{faltando}</p>
        )}
      </div>
    </div>
  );
}

export function PixComissaoDobrada({ dobra, projecao }: PixComissaoDobradaProps) {
  const dobrou = dobra.atingiu;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className={cn(
        'rounded-xl border bg-gradient-to-br p-4 space-y-3.5',
        dobrou
          ? 'from-amber-500/20 to-orange-600/5 border-amber-500/40'
          : 'from-violet-500/12 to-fuchsia-600/5 border-violet-500/25',
      )}>

        {/* ── Cabeçalho: o que é, e quanto dos requisitos já fechou ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            {dobrou
              ? <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
              : <Zap className="w-5 h-5 text-violet-400 shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground leading-tight">Comissão dobrada</p>
              <p className="text-[11px] text-muted-foreground">
                Os dois requisitos abaixo precisam ser cumpridos no mês
              </p>
            </div>
          </div>

          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border shrink-0',
            dobrou
              ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
              : 'bg-muted/50 text-muted-foreground border-border',
          )}>
            {dobra.requisitosOk}/2 requisitos
          </span>
        </div>

        {/* ── Os dois requisitos ── */}
        <div className="space-y-3">
          <Requisito
            ok={dobra.acordosOk}
            dourado={dobrou}
            titulo="Requisito 1 · 18 acordos Pix no mês"
            detalhe={`${dobra.feitos} / ${dobra.meta}`}
            pct={dobra.pctAcordos}
            faltando={dobra.faltam > 0
              ? `Faltam ${dobra.faltam} acordo${dobra.faltam !== 1 ? 's' : ''}.`
              : null}
          />

          <Requisito
            ok={dobra.metaOk}
            dourado={dobrou}
            titulo="Requisito 2 · bater a meta do mês"
            detalhe={dobra.metaDefinida
              ? `${formatCurrency(dobra.recebidoMes ?? 0)} / ${formatCurrency(dobra.metaValor ?? 0)}`
              : 'sem meta definida'}
            pct={dobra.pctMeta}
            faltando={dobra.metaDefinida
              ? (dobra.faltaMeta > 0
                  ? `Faltam ${formatCurrency(dobra.faltaMeta)} de recebimento.`
                  : null)
              : 'A meta do seu mês ainda não foi definida — fale com o líder.'}
          />
        </div>

        {/* ── O que está em jogo ── */}
        <div className={cn(
          'rounded-lg border px-3 py-2.5',
          dobrou ? 'border-amber-500/30 bg-amber-500/[0.07]' : 'border-border bg-background/40',
        )}>
          {dobrou ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-xs font-semibold text-amber-400">
                🏆 Requisitos cumpridos — sua comissão do mês está dobrada
              </p>
              <p className="text-sm font-mono font-bold text-foreground">
                <span className="text-muted-foreground line-through mr-2">
                  {formatCurrency(dobra.comissao)}
                </span>
                {formatCurrency(dobra.comissaoFinal)}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[11px] text-muted-foreground">
                Comissão aprovada até agora — cumprindo os dois requisitos, você
                recebe <strong className="text-foreground">este mesmo valor de novo</strong>.
              </p>
              <p className="text-sm font-mono font-bold text-violet-400">
                {formatCurrency(dobra.comissao)}
                <span className="text-muted-foreground font-normal mx-1.5">→</span>
                <span className="text-foreground">{formatCurrency(dobra.comissao * 2)}</span>
              </p>
            </div>
          )}
        </div>

        {/* Ritmo do mês: não é requisito, é só para saber se está no caminho. */}
        {!dobra.metaOk && dobra.metaDefinida && projecao != null && projecao > 0 && (
          <p className="text-[10.5px] text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 shrink-0" />
            No ritmo de hoje, você fecha o mês em{' '}
            <strong className="text-foreground">{projecao}%</strong> da meta.
          </p>
        )}
      </div>
    </motion.div>
  );
}
