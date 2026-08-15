/**
 * BarraEstados — pago · a verificar · não pago, numa barra só.
 *
 * Substitui a "taxa de eficiência" da versão 1.0, que era `pagos ÷ agendados` e
 * contava `verificar_pendente` como falha. Com 41% dos acordos da BookPlay em
 * verificação, ela mostrava 37% num dia em que nada tinha dado errado.
 *
 * A barra existe porque os três estados são partes de um todo, e a pergunta
 * verdadeira é a proporção entre eles. Três números soltos obrigariam o leitor a
 * dividir de cabeça; três cores lado a lado ele lê de relance.
 *
 * A cor do meio é âmbar de propósito — nem verde nem vermelho. "Ainda não
 * conferido" não é resultado, é trabalho pendente de outra pessoa.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { BarraEstados as Estados } from '@/lib/desempenhoDia';

interface Segmento {
  chave: 'pago' | 'aVerificar' | 'naoPago';
  rotulo: string;
  cor: string;
  classe: string;
}

const SEGMENTOS: Segmento[] = [
  { chave: 'pago',       rotulo: 'pagos',       cor: '#10b981', classe: 'bg-emerald-500' },
  { chave: 'aVerificar', rotulo: 'a verificar', cor: '#f59e0b', classe: 'bg-amber-500' },
  { chave: 'naoPago',    rotulo: 'não pagos',   cor: '#f43f5e', classe: 'bg-rose-500' },
];

interface BarraEstadosProps {
  estados: Estados;
  /** Valor recebido do dia, para o título do segmento «pagos». */
  valorPago?: number;
}

export function BarraEstados({ estados, valorPago }: BarraEstadosProps) {
  const semMovimento = useReducedMotion();
  const { total } = estados;

  if (total === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1">
        Nenhum acordo com vencimento neste dia.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted/40"
        role="img"
        aria-label={
          `${estados.pago} pagos, ${estados.aVerificar} a verificar, `
          + `${estados.naoPago} não pagos, de ${total} agendados`
        }
      >
        {SEGMENTOS.map(s => {
          const qtd = estados[s.chave];
          if (qtd === 0) return null;
          const pct = (qtd / total) * 100;
          return (
            <motion.div
              key={s.chave}
              initial={semMovimento ? false : { width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className={cn(s.classe, 'h-full first:rounded-l-full last:rounded-r-full')}
              title={
                s.chave === 'pago' && valorPago !== undefined
                  ? `${qtd} ${s.rotulo} · ${formatCurrency(valorPago)}`
                  : `${qtd} ${s.rotulo}`
              }
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {SEGMENTOS.map(s => {
          const qtd = estados[s.chave];
          if (qtd === 0) return null;
          return (
            <span key={s.chave} className="inline-flex items-center gap-1.5 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.cor }} />
              <span className="font-semibold tabular-nums">{qtd}</span>
              <span className="text-muted-foreground">{s.rotulo}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
