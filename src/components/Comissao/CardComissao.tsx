/**
 * CardComissao — a comissão no Dashboard, num card.
 *
 * Mora na mesma grade dos cards de projeção e usa o mesmo acabamento do
 * `MetricCard` — mesma altura, mesma hierarquia. Não é um `MetricCard` porque
 * precisa de um botão, e aquele componente só desenha texto.
 *
 * O card responde de relance e manda o resto para «Ver comissão»: o valor grande
 * é a comissão total, e as linhas de apoio dizem a faixa, o percentual e quanto
 * falta para a próxima. Nada de tabela de faixas aqui — o pedido foi para não
 * poluir o Dashboard.
 */
import { motion } from 'framer-motion';
import { Coins, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { itemVariants } from '@/components/AnalyticsPanel/constants';
import { formatBRL } from '@/lib/money';
import type { ResultadoComissao } from '@/services/comissao/comissao';
import { formatarPct } from './formato';

interface CardComissaoProps {
  resultado: ResultadoComissao;
  isPaguePlay: boolean;
  mesFechado: boolean;
  onVer: () => void;
}

export function CardComissao({ resultado: r, isPaguePlay, mesFechado, onVer }: CardComissaoProps) {
  const falta = mesFechado ? 'Faltou' : 'Faltam';
  const cor = r.beneficioAtivo ? '#f59e0b' : '#6366f1';

  const apoio: string[] = [];
  if (r.atual) {
    const indireta = r.indireta && r.indireta.comissao > 0
      ? ` · + indireta ${formatBRL(r.indireta.comissao)}`
      : '';
    apoio.push(`${r.atual.ordem}ª Meta · ${formatarPct(r.atual.pctEfetivo)}${indireta}`);
    if (r.proxima) {
      apoio.push(r.proxima.comissao !== null
        ? `Próxima: ${formatBRL(r.proxima.comissao)} (${r.proxima.ordem}ª Meta)`
        : `Próxima: ${r.proxima.ordem}ª Meta`);
      if (r.proxima.falta !== null) apoio.push(`${falta} ${formatBRL(r.proxima.falta)}`);
    } else {
      apoio.push('Todas as faixas atingidas');
    }
  } else if (r.proxima) {
    const comissao = r.proxima.comissao !== null ? ` · comissão ${formatBRL(r.proxima.comissao)}` : '';
    apoio.push(`${r.proxima.ordem}ª Meta: ${falta.toLowerCase()} ${formatBRL(r.proxima.falta ?? 0)}${comissao}`);
  }

  return (
    <motion.div
      variants={itemVariants}
      className="group relative flex flex-col gap-1.5 overflow-hidden rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-shadow duration-200 hover:shadow-md"
    >
      <div className="absolute bottom-0 left-0 top-0 w-[3px] rounded-l-xl" style={{ background: cor }} />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{ background: `radial-gradient(ellipse at top left, ${cor} 0%, transparent 70%)` }}
      />

      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {`Comissão${isPaguePlay ? ' · H.O.' : ''}`}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {r.beneficioAtivo && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300"
              title="Meta do setor atingida — benefício ativo"
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              setor
            </span>
          )}
          <Coins className="h-4 w-4" style={{ color: `${cor}aa` }} aria-hidden="true" />
        </span>
      </div>

      <div className="pl-1 font-mono text-xl font-bold leading-tight tracking-tight tabular-nums">
        {r.atual || r.total > 0 ? formatBRL(r.total) : 'Nenhuma faixa ainda'}
      </div>

      {apoio.map(linha => (
        <span key={linha} className="pl-1 text-[11px] leading-snug text-muted-foreground">{linha}</span>
      ))}

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-1 h-7 self-end text-xs"
        onClick={onVer}
      >
        Ver comissão
      </Button>
    </motion.div>
  );
}
