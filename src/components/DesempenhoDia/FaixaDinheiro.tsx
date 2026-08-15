/**
 * FaixaDinheiro — «quanto entrou», do relatório do ERP.
 *
 * É a única faixa do painel que lê `analitico_recebimentos`. Todas as outras
 * falam de `acordos`. A separação não é preciosismo: em 14 dias medidos, o
 * analítico da BookPlay somou R$ 1.413.487 contra R$ 104.172 de acordos
 * tabulados. Somar os dois, ou trocar um pelo outro sem avisar, produziria um
 * número que não corresponde a nada.
 *
 * Por isso o rótulo diz a fonte, em letras pequenas e permanentes.
 *
 * Um número grande, sozinho, em vez de mais um card na grade: é a resposta que a
 * pessoa abriu o painel para ver, e competir por atenção com outros cinco cards
 * do mesmo tamanho era o defeito visual da versão 1.0.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Target } from 'lucide-react';
import { formatCurrency } from '@/lib/index';
import { rotuloUnidade, type UnidadeValor } from '@/lib/unidadeValor';
import { corProjecao } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import { SeletorUnidade } from '@/components/PainelMetas/SeletorUnidade';
import { ValorAnimado } from './ValorAnimado';
import type { MetaDoDia, Variacao } from '@/lib/desempenhoDia';

interface ChipVariacaoProps {
  variacao: Variacao;
  rotulo: string;
}

/**
 * O chip de variação. Some quando não há base de comparação.
 *
 * Um dia depois de um dia zerado não tem variação — mostrar «+100%» ou «▲∞»
 * inventaria uma comparação. Ver `variacao()` em `lib/desempenhoDia.ts`.
 */
function ChipVariacao({ variacao, rotulo }: ChipVariacaoProps) {
  if (variacao.pct === null) return null;

  const subiu = variacao.pct > 0;
  const parado = variacao.pct === 0;
  const Icone = parado ? Minus : subiu ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        parado && 'bg-muted text-muted-foreground',
        !parado && subiu && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        !parado && !subiu && 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      )}
      title={`${rotulo}: ${formatCurrency(variacao.base)}`}
    >
      <Icone className="h-3 w-3" />
      {subiu ? '+' : ''}{variacao.pct}%
      <span className="font-normal opacity-70">{rotulo}</span>
    </span>
  );
}

interface FaixaDinheiroProps {
  recebido: number;
  recebidoOposto: number;
  meta: MetaDoDia | null;
  vsOntem: Variacao;
  vsMedia: Variacao;
  /** `null` na BookPlay — lá `total_ho` é zero e alternar não é uma escolha. */
  unidade: UnidadeValor | null;
  onUnidade: (u: UnidadeValor) => void;
}

export function FaixaDinheiro({
  recebido, recebidoOposto, meta, vsOntem, vsMedia, unidade, onUnidade,
}: FaixaDinheiroProps) {
  const semMovimento = useReducedMotion();
  const pctBarra = meta ? Math.min(100, Math.max(0, meta.percentual)) : 0;

  return (
    <section className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recebido no dia
            <span className="ml-1 font-normal normal-case opacity-70">· relatório do ERP</span>
          </p>
          <ValorAnimado
            valor={recebido}
            formatar={formatCurrency}
            className="block font-mono text-2xl font-bold leading-tight tracking-tight tabular-nums text-emerald-500"
          />
          {unidade && (
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {rotuloUnidade(unidade === 'ho' ? 'bruto' : 'ho')}: {formatCurrency(recebidoOposto)}
            </p>
          )}
        </div>

        {unidade && <SeletorUnidade valor={unidade} onChange={onUnidade} />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ChipVariacao variacao={vsOntem} rotulo="vs. ontem" />
        <ChipVariacao variacao={vsMedia} rotulo="vs. média 7 dias" />
      </div>

      {meta && (
        <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Target className="h-3 w-3" />
              Meta do dia
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {formatCurrency(meta.valor)}
            </span>
          </div>

          {/* Largura fixa, `scaleX` animado: transform não força layout. */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
            <motion.div
              initial={semMovimento ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{
                width: `${pctBarra}%`,
                transformOrigin: 'left',
                background: corProjecao(meta.percentual),
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span
              className="font-semibold tabular-nums"
              style={{ color: corProjecao(meta.percentual) }}
            >
              {meta.percentual}% da meta do dia
            </span>
            <span>{meta.diasUteis} dias úteis no mês</span>
          </div>
        </div>
      )}
    </section>
  );
}
