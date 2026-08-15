/**
 * FaixaOperacao — «como está o meu trabalho», a partir dos acordos.
 *
 * Duas perguntas, e só duas:
 *
 *   o que venceu hoje, e em que pé está  → a barra de três estados
 *   quanto entrou de novo hoje           → formalizados
 *
 * A taxa de eficiência da versão 1.0 saiu daqui. Ela dividia pagos por
 * agendados, o que fazia um acordo aguardando conferência derrubar o número
 * exatamente como um calote derrubaria. No lugar entrou a conversão sobre o que
 * JÁ foi conferido — e ela some quando nada foi, porque `0/0` não é 0%.
 */

import { FileText } from 'lucide-react';
import { BarraEstados } from './BarraEstados';
import { ValorAnimado } from './ValorAnimado';
import type { BarraEstados as Estados } from '@/lib/desempenhoDia';

interface FaixaOperacaoProps {
  estados: Estados;
  formalizados: number;
  valorPago: number;
}

export function FaixaOperacao({ estados, formalizados, valorPago }: FaixaOperacaoProps) {
  return (
    <section className="space-y-2.5 rounded-xl border border-border/60 bg-card/60 px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Minha operação
          <span className="ml-1 font-normal normal-case opacity-70">· acordos tabulados</span>
        </p>
        <span className="font-mono text-sm font-bold tabular-nums">
          {estados.total}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
            {estados.total === 1 ? 'agendado' : 'agendados'}
          </span>
        </span>
      </div>

      <BarraEstados estados={estados} valorPago={valorPago} />

      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileText className="h-3 w-3" />
          Formalizados hoje
        </span>
        <ValorAnimado
          valor={formalizados}
          formatar={v => String(Math.round(v))}
          className="font-mono text-sm font-bold tabular-nums"
        />
      </div>

      {estados.conversao !== null && (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground">
            Conversão
            <span className="ml-1 opacity-70">· do que já foi conferido</span>
          </span>
          <span className="font-mono font-semibold tabular-nums">{estados.conversao}%</span>
        </div>
      )}
    </section>
  );
}
