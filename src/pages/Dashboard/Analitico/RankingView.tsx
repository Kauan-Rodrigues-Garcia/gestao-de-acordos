/**
 * RankingView — pódio do ranking de recebimento por operador.
 *
 * Top 3 em pódio, 4º–10º em lista com barra de progresso e demais (11+)
 * em lista compacta. Usado tanto na visão do líder quanto na do operador.
 *
 * `destaqueOperadorId` (opcional): destaca a linha/card do operador atual,
 * útil na visão do operador para ele se localizar no ranking.
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';

interface RankingViewProps {
  resumos: ResumoOperadorAnalitico[];
  destaqueOperadorId?: string | null;
}

export function RankingView({ resumos, destaqueOperadorId }: RankingViewProps) {
  const max   = resumos[0]?.total_recebido || 1;
  const top3  = resumos.slice(0, 3);
  const meio  = resumos.slice(3, 10);
  const resto = resumos.slice(10);

  const ehVoce = (id: string) => !!destaqueOperadorId && id === destaqueOperadorId;

  const PODIO_STYLE = [
    {
      border: 'border-yellow-400/60', bg: 'bg-yellow-50/60 dark:bg-yellow-950/20',
      medal: '🥇', text: 'text-yellow-700 dark:text-yellow-400',
    },
    {
      border: 'border-slate-400/60',  bg: 'bg-slate-50/60 dark:bg-slate-900/20',
      medal: '🥈', text: 'text-slate-600 dark:text-slate-400',
    },
    {
      border: 'border-amber-700/40',  bg: 'bg-orange-50/40 dark:bg-orange-950/10',
      medal: '🥉', text: 'text-amber-700 dark:text-amber-500',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Pódio — top 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {top3.map((r, i) => {
          const acima = i > 0 ? resumos[i - 1] : null;
          const gap   = acima ? acima.total_recebido - r.total_recebido : 0;
          const prox  = acima && acima.total_recebido > 0
            ? Math.min(100, Math.round((r.total_recebido / acima.total_recebido) * 100))
            : 100;
          const s = PODIO_STYLE[i];
          const voce = ehVoce(r.operador_id);
          return (
            <Card key={r.operador_id} className={cn('border-2', s.border, s.bg, voce && 'ring-2 ring-primary ring-offset-1')}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{s.medal}</span>
                  <Badge variant="outline" className={cn('text-xs font-bold', s.text)}>
                    {i + 1}º lugar
                  </Badge>
                </div>
                <div>
                  <p className="font-bold text-sm leading-tight flex items-center gap-1.5">
                    {r.operador_nome ?? r.operador_usuario}
                    {voce && <span className="text-[10px] font-bold uppercase text-primary bg-primary/10 rounded-full px-1.5 py-0.5">Você</span>}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">{r.operador_usuario}</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-primary font-mono">{formatBRL(r.total_recebido)}</p>
                  <p className="text-xs text-muted-foreground">{r.total_pagamentos} pagamentos</p>
                </div>
                {i === 0 ? (
                  <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400">★ Líder do ranking</p>
                ) : gap > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Faltam <strong>{formatBRL(gap)}</strong> p/ ultrapassar
                    </p>
                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full bg-primary/50 transition-all"
                        style={{ width: `${prox}%` }} />
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 4º ao 10º */}
      {meio.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">4º ao 10º lugar</p>
          <Card className="border-border">
            <CardContent className="p-0">
              {meio.map((r, i) => {
                const pos   = i + 4;
                const w     = Math.max(4, Math.round((r.total_recebido / max) * 100));
                const acima = resumos[pos - 2];
                const gap   = acima ? acima.total_recebido - r.total_recebido : 0;
                const voce  = ehVoce(r.operador_id);
                return (
                  <div key={r.operador_id} className={cn(
                    'flex items-center gap-3 px-3 py-2.5 transition-colors',
                    voce ? 'bg-primary/10' : 'hover:bg-muted/30',
                    i > 0 && 'border-t border-border',
                  )}>
                    <span className="text-sm font-bold text-muted-foreground w-6 text-right shrink-0">{pos}º</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{r.operador_nome ?? r.operador_usuario}</span>
                        {voce && <span className="text-[10px] font-bold uppercase text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0">Você</span>}
                        {gap > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0">faltam {formatBRL(gap)}</span>
                        )}
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full bg-primary/40" style={{ width: `${w}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-bold text-primary">{formatBRL(r.total_recebido)}</p>
                      <p className="text-xs text-muted-foreground">{r.total_pagamentos} pgtos.</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}

      {/* Demais (11+) */}
      {resto.length > 0 && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Demais operadores</p>
          <Card className="border-border">
            <CardContent className="p-0">
              {resto.map((r, i) => {
                const voce = ehVoce(r.operador_id);
                return (
                  <div key={r.operador_id} className={cn(
                    'flex items-center gap-3 px-3 py-2 transition-colors text-xs',
                    voce ? 'bg-primary/10' : 'hover:bg-muted/20',
                    i > 0 && 'border-t border-border',
                  )}>
                    <span className="font-bold text-muted-foreground w-8 text-right shrink-0">{i + 11}º</span>
                    <span className="flex-1 truncate font-medium flex items-center gap-1.5">
                      {r.operador_nome ?? r.operador_usuario}
                      {voce && <span className="text-[10px] font-bold uppercase text-primary bg-primary/10 rounded-full px-1.5 py-0.5 shrink-0">Você</span>}
                    </span>
                    <span className="font-mono font-semibold text-primary shrink-0">{formatBRL(r.total_recebido)}</span>
                    <span className="text-muted-foreground shrink-0">{r.total_pagamentos} pgtos.</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
