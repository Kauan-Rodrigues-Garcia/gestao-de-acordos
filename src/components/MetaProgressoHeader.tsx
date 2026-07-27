/**
 * MetaProgressoHeader — progresso pessoal no cabeçalho do Dashboard (PaguePlay).
 *
 * Aparece logo abaixo da saudação para quem tem meta de operador definida e
 * a config do mês (dias úteis/quartis) preenchida na aba Metas. Mostra:
 *   1. Barra da meta do mês (recebido no ANALÍTICO ÷ meta) + meta diária
 *   2. Posição no ranking + quanto falta para ultrapassar quem está acima
 *   3. Barra de quartil (projeção = recebido ÷ esperado até hoje) + quanto
 *      fazer hoje para subir ao próximo quartil
 *
 * Toda a matemática vem de useMetaOperador (fonte compartilhada com os cards do
 * dashboard do operador). Recalcula quando um novo relatório analítico chega.
 */

import { motion } from 'framer-motion';
import { Target, Trophy, TrendingUp } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { useMetaOperador } from '@/hooks/useMetaOperador';
import { cn } from '@/lib/utils';

export function MetaProgressoHeader() {
  const m = useMetaOperador();

  if (!m.ativo || !m.carregado || !m.dbAtiva || !m.temMeta) return null;

  const corMeta = m.percMeta >= 100 ? '#22c55e'
    : m.percMeta >= 70 ? '#6366f1'
    : m.percMeta >= 40 ? '#f59e0b'
    : '#ef4444';

  const corQuartil = m.quartil?.quartil === 1 ? '#22c55e'
    : m.quartil?.quartil === 2 ? '#6366f1'
    : m.quartil?.quartil === 3 ? '#f59e0b'
    : '#ef4444';

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-3 w-full max-w-xl space-y-2"
      data-tour="meta-progresso"
    >
      {/* 1 — Meta do mês */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
            <Target className="w-3.5 h-3.5" style={{ color: corMeta }} />
            Meta do mês
            <span className="text-[10px] text-muted-foreground/70">
              · {formatBRL(m.metaDiaria)}/dia útil
            </span>
          </span>
          <span className="font-bold tabular-nums font-mono" style={{ color: corMeta }}>
            {m.percMeta}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(m.percMeta, 100)}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${corMeta}99, ${corMeta})` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {formatBRL(m.recebidoMes)} de {formatBRL(m.metaValor ?? 0)}
        </p>
        {/* Metas em cascata (BP): após bater a 1ª, mostra a próxima */}
        {m.metasBatidas > 0 && m.proximaMeta !== null && (
          <p className="text-[11px] tabular-nums">
            <span className="font-semibold text-emerald-500">
              ✅ {m.metasBatidas}ª meta batida!
            </span>{' '}
            <span className="text-muted-foreground">
              Faltam <strong className="text-foreground">{formatBRL(m.proximaMeta - m.recebidoMes)}</strong>{' '}
              para a {m.metasBatidas + 1}ª meta ({formatBRL(m.proximaMeta)})
            </span>
          </p>
        )}
        {m.totalMetas > 1 && m.metasBatidas === m.totalMetas && (
          <p className="text-[11px] font-semibold text-emerald-500">
            🏆 Todas as {m.totalMetas} metas do mês batidas!
          </p>
        )}
      </div>

      {/* 2 — Ranking */}
      {m.posicaoRanking !== null && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          {m.posicaoRanking === 1 ? (
            <span><strong className="text-foreground">1º lugar</strong> — você é o líder do ranking! 🏆</span>
          ) : (
            <span>
              Você está em <strong className="text-foreground">{m.posicaoRanking}º lugar</strong> — faltam{' '}
              <strong className="text-foreground">{formatBRL(m.gapParaAcima)}</strong> para ultrapassar{' '}
              {m.acimaNome}
            </span>
          )}
        </p>
      )}

      {/* 3 — Quartil (projeção diária) */}
      {m.quartil && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: corQuartil }} />
              <span
                className={cn('font-bold px-1.5 py-0.5 rounded text-[11px]')}
                style={{ background: corQuartil + '22', color: corQuartil }}
              >
                {m.quartil.quartil}º quartil
              </span>
              projeção do dia
            </span>
            <span className="font-bold tabular-nums font-mono" style={{ color: corQuartil }}>
              {m.projecaoPct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(m.projecaoPct, 100)}%` }}
              transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${corQuartil}99, ${corQuartil})` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {m.proximoQuartilCfg && m.paraSubirQuartil !== null ? (
              <>Deveria estar com {formatBRL(m.esperadoAteHoje)} — faça{' '}
              <strong className="text-foreground">{formatBRL(m.paraSubirQuartil)}</strong> hoje
              para subir ao {m.proximoQuartilCfg.quartil}º quartil</>
            ) : (
              <>Você está no melhor quartil — mantenha o ritmo! ✨</>
            )}
          </p>
        </div>
      )}
    </motion.div>
  );
}
