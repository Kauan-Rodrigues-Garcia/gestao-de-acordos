/**
 * PixRankingSetor.tsx — ranking de Pix automático do setor no mês.
 *
 * Considera o SETOR inteiro (ex.: Receptivo): o líder já carrega apenas os
 * acordos do próprio setor, então o que chega aqui é o recorte certo — o
 * ranking do Receptivo não mistura Play 1 nem Digital.
 *
 * A ordenação e as somas moram em `rankingPixSetor` (pura, com teste).
 */
import { motion } from 'framer-motion';
import { Trophy, Medal, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { LinhaRankingPix } from './pixAutomaticoView';

/** Cor da posição: pódio se destaca, o resto fica neutro de propósito. */
const CLS_POSICAO: Record<number, string> = {
  1: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  2: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
  3: 'bg-orange-600/15 text-orange-400 border-orange-600/30',
};

export interface PixRankingSetorProps {
  linhas: LinhaRankingPix[];
  /** Nome do setor no cabeçalho. */
  nomeSetor?: string;
  /** Destaca a linha de quem está olhando. */
  destacarOperadorId?: string | null;
}

export function PixRankingSetor({ linhas, nomeSetor, destacarOperadorId }: PixRankingSetorProps) {
  if (linhas.length === 0) return null;

  return (
    <Card className="border-border">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold text-foreground">
            Ranking Pix Automático{nomeSetor ? ` · ${nomeSetor}` : ''}
          </h3>
          <span className="text-[11px] text-muted-foreground ml-auto">
            acordos feitos no mês
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="px-3 py-2.5 w-10 text-left font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">#</th>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Operador</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Acordos</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Valor</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const posicao = i + 1;
                const ehVoce = destacarOperadorId != null && l.operadorId === destacarOperadorId;
                return (
                  <motion.tr
                    key={l.operadorId}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.25 }}
                    className={cn(
                      'border-b border-border/30 transition-colors hover:bg-accent/20',
                      ehVoce && 'bg-violet-500/[0.07]',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <span className={cn(
                        'inline-flex items-center justify-center w-6 h-6 rounded-lg border text-[10px] font-bold',
                        CLS_POSICAO[posicao] ?? 'bg-muted/40 text-muted-foreground border-border',
                      )}>
                        {posicao <= 3 ? <Medal className="w-3 h-3" /> : posicao}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-foreground/90 max-w-[200px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{l.nome}</span>
                        {ehVoce && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-500/40 text-violet-400 shrink-0">
                            você
                          </Badge>
                        )}
                        {l.dobrou && (
                          <span title="Bateu a meta de acordos — comissão dobrada" className="shrink-0">
                            <Zap className="w-3 h-3 text-amber-400" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-foreground">{l.acordos}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{formatCurrency(l.valor)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-violet-400">{formatCurrency(l.comissao)}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
