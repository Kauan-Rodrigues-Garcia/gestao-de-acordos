/**
 * DashboardOperadorCards — bloco de cards do dashboard do operador.
 *
 * Grid uniforme e alinhado (sem blocos esticados), estética do Gestão de Acordos
 * (Card shadcn + tokens de tema, claro/escuro): Total recebido, Direto/Extra
 * (quando o setor usa a lógica), Projeção (anel), Valor esperado, Diferença,
 * Posição no ranking (compacto e vívido), Análise por Quartil, Recebido na baixa
 * anterior e Meta de hoje — todos do MESMO tamanho. Abaixo, o gráfico "Sua
 * Evolução Diária" + "Projeção Diária".
 *
 * Toda a matemática vem de useMetaOperador (mesma fonte do MetaProgressoHeader),
 * chamado uma única vez aqui e repassado ao gráfico.
 */

import { motion } from 'framer-motion';
import { Target, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { DonutChart } from '@/components/AnalyticsPanel/SubComponents';
import { useMetaOperador } from '@/hooks/useMetaOperador';
import { formatBRL } from '@/lib/money';
import { corProjecao, COR_QUARTIL } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import type { Acordo } from '@/lib/supabase';
import { EvolucaoDiaria } from './EvolucaoDiaria';

interface DashboardOperadorCardsProps {
  temDiretoExtra: boolean;
  acordosMes: Acordo[];
}

/** Cor vívida do card de ranking conforme a posição. */
function estiloRanking(pos: number): { from: string; to: string; medalha: string; sub: string } {
  if (pos === 1) return { from: '#f59e0b', to: '#eab308', medalha: '🥇', sub: 'Líder!' };
  if (pos === 2) return { from: '#64748b', to: '#94a3b8', medalha: '🥈', sub: 'Quase lá!' };
  if (pos === 3) return { from: '#ea580c', to: '#f97316', medalha: '🥉', sub: 'Pódio!' };
  if (pos <= 10) return { from: '#4f46e5', to: '#6366f1', medalha: '🏆', sub: 'Top 10!' };
  return { from: '#0f766e', to: '#14b8a6', medalha: '⭐', sub: 'Subindo!' };
}

/** Card base uniforme (mesma altura para todos). */
function CardBase({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <Card className={cn('border-border', className)} style={style}>
      <CardContent className="p-3.5 flex flex-col items-center text-center justify-center gap-1 h-full min-h-[118px]">
        {children}
      </CardContent>
    </Card>
  );
}

function Rotulo({ children, claro }: { children: React.ReactNode; claro?: boolean }) {
  return <p className={cn('text-[10.5px] font-semibold uppercase tracking-wide', claro ? 'opacity-90' : 'text-muted-foreground')}>{children}</p>;
}

export function DashboardOperadorCards({ temDiretoExtra, acordosMes }: DashboardOperadorCardsProps) {
  const m = useMetaOperador();

  if (!m.ativo || !m.carregado) return null;

  const pagos = acordosMes.filter(a => a.status === 'pago');
  const valorDireto = pagos.filter(a => a.tipo_vinculo !== 'extra').reduce((s, a) => s + (Number(a.valor) || 0), 0);
  const valorExtra  = pagos.filter(a => a.tipo_vinculo === 'extra').reduce((s, a) => s + (Number(a.valor) || 0), 0);

  const corProj = corProjecao(m.projecaoPct);
  const corQ = m.quartil ? (COR_QUARTIL[m.quartil.quartil] ?? '#6366f1') : '#6366f1';
  const diffPos = m.diferenca >= 0;
  const percHoje = m.metaDiaria > 0 ? Math.min(Math.round((m.recebidoHoje / m.metaDiaria) * 100), 100) : 0;
  const faltaHoje = Math.max(0, m.metaDiaria - m.recebidoHoje);
  const rk = m.posicaoRanking !== null ? estiloRanking(m.posicaoRanking) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {/* Grid uniforme — todos os cards do mesmo tamanho */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total recebido */}
        <CardBase>
          <Rotulo>Total recebido</Rotulo>
          <p className="text-xl font-extrabold font-mono tabular-nums text-primary leading-tight">{formatBRL(m.recebidoMes)}</p>
          {m.metaValor ? <p className="text-[10.5px] text-muted-foreground">Meta: {formatBRL(m.metaValor)}</p> : null}
        </CardBase>

        {temDiretoExtra && (
          <>
            <CardBase>
              <Rotulo>Recebimento Direto</Rotulo>
              <p className="text-xl font-extrabold font-mono tabular-nums text-primary leading-tight">{formatBRL(valorDireto)}</p>
            </CardBase>
            <CardBase>
              <Rotulo>Recebimento Extra</Rotulo>
              <p className="text-xl font-extrabold font-mono tabular-nums text-amber-500 leading-tight">{formatBRL(valorExtra)}</p>
            </CardBase>
          </>
        )}

        {/* Projeção — anel compacto */}
        {m.temMeta && (
          <CardBase>
            <Rotulo>Projeção</Rotulo>
            <DonutChart percent={m.projecaoPct} label={`${m.projecaoPct}%`} color={corProj} size={78} />
          </CardBase>
        )}

        {/* Valor esperado */}
        {m.temMeta && (
          <CardBase>
            <Rotulo>Valor esperado</Rotulo>
            <p className="text-xl font-extrabold font-mono tabular-nums text-primary leading-tight">{formatBRL(m.esperadoAteHoje)}</p>
            <p className="text-[10.5px] text-muted-foreground">{m.diasUteisDecorridos} de {m.diasUteisTotais} dias úteis</p>
          </CardBase>
        )}

        {/* Diferença */}
        {m.temMeta && (
          <CardBase>
            <Rotulo>Diferença p/ projeção</Rotulo>
            <p className="text-xl font-extrabold font-mono tabular-nums leading-tight" style={{ color: diffPos ? '#22c55e' : '#ef4444' }}>
              {diffPos ? '+ ' : '− '}{formatBRL(Math.abs(m.diferenca))}
            </p>
            <p className="text-[10.5px] text-muted-foreground">{diffPos ? 'Acima da projeção' : 'Abaixo da projeção'}</p>
          </CardBase>
        )}

        {/* Posição no ranking — compacto e vívido */}
        {rk && (
          <CardBase className="border-0 text-white" style={{ background: `linear-gradient(135deg, ${rk.from}, ${rk.to})` }}>
            <Rotulo claro><span className="inline-flex items-center gap-1"><Trophy className="w-3 h-3" /> Ranking</span></Rotulo>
            <p className="text-3xl font-extrabold font-mono leading-none">{rk.medalha} #{m.posicaoRanking}</p>
            <p className="text-[10.5px] opacity-90">{rk.sub}</p>
          </CardBase>
        )}

        {/* Análise por Quartil — compacto e colorido */}
        {m.quartil && (
          <CardBase className="border-0 text-white" style={{ background: `linear-gradient(135deg, ${corQ}, ${corQ}bb)` }}>
            <Rotulo claro>Análise por Quartil</Rotulo>
            <p className="text-base font-bold leading-tight">{m.quartil.quartil}º Quartil</p>
            <p className="text-[10.5px] opacity-95 leading-snug">
              {m.percMeta}% da meta{m.quartil.quartil === 1 && m.percMeta >= 100 ? ' — excelente!' : m.proximoQuartilCfg ? ` · suba ao ${m.proximoQuartilCfg.quartil}º` : ''}
            </p>
          </CardBase>
        )}

        {/* Recebido na baixa anterior */}
        {m.temMeta && (
          <CardBase className="bg-muted/30">
            <Rotulo>Baixa anterior</Rotulo>
            <p className="text-xl font-extrabold font-mono tabular-nums text-cyan-600 dark:text-cyan-400 leading-tight">{formatBRL(m.baixaAnterior.valor)}</p>
            <p className="text-[10.5px] text-muted-foreground leading-snug">{m.baixaAnterior.labelDias} · {m.baixaAnterior.qtd} reg.</p>
          </CardBase>
        )}

        {/* Meta de hoje — compacto com mini progresso */}
        {m.temMeta && (
          <CardBase className="!items-stretch !text-left relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
            <div className="flex items-center justify-between">
              <Rotulo><span className="inline-flex items-center gap-1"><Target className="w-3 h-3 text-primary" /> Meta de hoje</span></Rotulo>
              <span className="text-[10.5px] text-muted-foreground tabular-nums">{percHoje}%</span>
            </div>
            <p className="text-lg font-extrabold font-mono tabular-nums text-foreground leading-tight">{formatBRL(m.metaDiaria)}</p>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all" style={{ width: `${Math.max(percHoje, 4)}%` }} />
            </div>
            <p className="text-[10.5px] text-muted-foreground tabular-nums">
              {faltaHoje > 0 ? `Faltam ${formatBRL(faltaHoje)}` : <span className="text-emerald-500 font-semibold">Batida hoje! ✅</span>}
            </p>
          </CardBase>
        )}
      </div>

      {/* Sua Evolução Diária + Projeção Diária */}
      {m.temMeta && (
        <EvolucaoDiaria
          recebidoPorDia={m.recebidoPorDia}
          metaDiaria={m.metaDiaria}
          recebidoMes={m.recebidoMes}
          metaValor={m.metaValor}
          diasUteisTotais={m.diasUteisTotais}
          diasUteisDecorridos={m.diasUteisDecorridos}
        />
      )}
    </motion.div>
  );
}
