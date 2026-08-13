/**
 * FaixaDiasUteis — a régua do mês, discreta.
 *
 * É contexto para ler o resto do painel ("6 de 21 dias"), não um número de
 * destaque. Por isso: linha fina, tipografia pequena, sem bloco colorido — o
 * único acento é a barrinha de progresso do mês.
 *
 * Os três números precisam FECHAR entre si, então `restantes` chega calculado
 * como `total − passados` lá do hook e não é rederivado aqui.
 */

import { CalendarRange } from 'lucide-react';

interface FaixaDiasUteisProps {
  passados: number;
  restantes: number;
  total: number;
}

function Item({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-sm font-semibold tabular-nums font-mono text-foreground leading-none">
        {valor}
      </span>
      <span className="text-[11px] text-muted-foreground leading-none">{rotulo}</span>
    </div>
  );
}

export function FaixaDiasUteis({ passados, restantes, total }: FaixaDiasUteisProps) {
  const pct = total > 0 ? Math.min((passados / total) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-x-4 gap-y-2 flex-wrap px-3 py-2 rounded-lg border border-border/60 bg-muted/20">
      <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />

      <Item valor={passados}  rotulo="dias úteis passados" />
      <span className="text-border" aria-hidden>·</span>
      <Item valor={restantes} rotulo="restantes" />
      <span className="text-border" aria-hidden>·</span>
      <Item valor={total}     rotulo="no mês" />

      {/* Barra do progresso do mês — o único acento de cor da faixa. */}
      <div className="flex-1 min-w-[80px] h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/70 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
