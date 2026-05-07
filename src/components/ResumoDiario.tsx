/**
 * ResumoDiario.tsx — Resumo diário por operador (PaguePLAY only)
 * Exibe métricas do dia atual: valor recebido, H.O., acordos formalizados/pagos,
 * taxa de eficiência e recebimento por tags.
 */
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, BarChart2, Percent, Tag, RefreshCw,
  ChevronDown, User,
} from 'lucide-react';
import { useResumoDia } from '@/hooks/useResumoDia';
import { useEmpresaTags } from '@/hooks/useEmpresaTags';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { formatCurrency, isPerfilAdmin, isPerfilLider } from '@/lib/index';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ─── Metric card ──────────────────────────────────────────────────────────────

interface MiniCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  accentColor?: string;
}

function MiniCard({ label, value, sub, icon, accentColor = '#6366f1' }: MiniCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex flex-col gap-1.5 rounded-xl border border-border/70 bg-card p-4 overflow-hidden shadow-sm"
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ background: accentColor }}
      />
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </span>
        <span style={{ color: accentColor + 'aa' }}>{icon}</span>
      </div>
      <div className="text-xl font-bold leading-tight tracking-tight pl-1 font-mono tabular-nums">
        {value}
      </div>
      {sub && (
        <span className="text-[11px] text-muted-foreground pl-1 leading-snug">{sub}</span>
      )}
    </motion.div>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-muted/20 p-4 animate-pulse h-20" />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ResumoDiarioProps {
  temLogicaDiretoExtra?: boolean;
  operadorFiltroExterno?: string | null;
}

export function ResumoDiario({ temLogicaDiretoExtra = false, operadorFiltroExterno }: ResumoDiarioProps) {
  const { perfil } = useAuth();
  const { temPermissao } = useCargoPermissoes();
  const { tags } = useEmpresaTags();

  // Quem pode ver o seletor de operador
  const _isAdmin = isPerfilAdmin(perfil?.perfil ?? '');
  const _isLider = isPerfilLider(perfil?.perfil ?? '');
  const _isDiretoria = perfil?.perfil === 'diretoria';
  const podeVerTodos = _isAdmin || _isLider || _isDiretoria || temPermissao('ver_acordos_gerais');

  const [selectedOperadorId, setSelectedOperadorId] = useState<string | null>(
    operadorFiltroExterno ?? null,
  );

  const { data, operadores, loading, refetch } = useResumoDia({
    selectedOperadorId,
    temLogicaDiretoExtra,
    tags,
  });

  const eficienciaColor =
    data.taxaEficiencia >= 70
      ? '#22c55e'
      : data.taxaEficiencia >= 40
      ? '#f59e0b'
      : '#ef4444';

  const operadorAtual = useMemo(
    () => operadores.find(o => o.id === selectedOperadorId),
    [operadores, selectedOperadorId],
  );

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <div className="rounded-xl border border-border/70 bg-card/50 p-4 space-y-4 shadow-sm">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/10 shrink-0">
              <BarChart2 className="w-3.5 h-3.5 text-violet-500" />
            </div>
            <div>
              <span className="text-sm font-semibold leading-none">Resumo do Dia</span>
              {selectedOperadorId && operadorAtual && (
                <p className="text-[11px] text-muted-foreground leading-none mt-0.5 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {operadorAtual.nome}
                </p>
              )}
              {!selectedOperadorId && podeVerTodos && (
                <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
                  Todos os operadores
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Seletor de operador (admin/lider/diretoria) */}
            {podeVerTodos && operadores.length > 0 && (
              <Select
                value={selectedOperadorId ?? '__todos'}
                onValueChange={v => setSelectedOperadorId(v === '__todos' ? null : v)}
              >
                <SelectTrigger className="h-7 text-xs w-44 rounded-lg border-border/70">
                  <SelectValue placeholder="Todos os operadores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos">Todos</SelectItem>
                  {operadores.map(op => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg"
              onClick={refetch}
              disabled={loading}
              title="Atualizar"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* ── Conteúdo ── */}
        <AnimatePresence mode="wait">
          {loading ? (
            <SkeletonRow key="loading" />
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* ── Grupo 1: H.O. ── */}
              <div className={cn(
                'grid gap-3',
                temLogicaDiretoExtra
                  ? 'grid-cols-2 sm:grid-cols-3'
                  : 'grid-cols-2 sm:grid-cols-3',
              )}>
                {temLogicaDiretoExtra && (
                  <MiniCard
                    label="H.O. Direto"
                    icon={<DollarSign className="w-4 h-4" />}
                    accentColor="#10b981"
                    value={<span className="text-emerald-500">{formatCurrency(data.valorHODireto)}</span>}
                    sub={`Bruto direto: ${formatCurrency(data.valorDireto)}`}
                  />
                )}
                {temLogicaDiretoExtra && (
                  <MiniCard
                    label="H.O. Extra"
                    icon={<DollarSign className="w-4 h-4" />}
                    accentColor="#7c3aed"
                    value={<span className="text-violet-500">{formatCurrency(data.valorHOExtra)}</span>}
                    sub={`Bruto extra: ${formatCurrency(data.valorExtra)}`}
                  />
                )}
                <MiniCard
                  label="H.O. Total recebido hoje"
                  icon={<DollarSign className="w-4 h-4" />}
                  accentColor="#22c55e"
                  value={<span className="text-emerald-500">{formatCurrency(data.valorHO)}</span>}
                  sub={`Bruto: ${formatCurrency(data.valorRecebido)}`}
                />
              </div>

              {/* ── Grupo 2: Acordos + Eficiência ── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MiniCard
                  label="Acordos formalizados hoje"
                  icon={<BarChart2 className="w-4 h-4" />}
                  accentColor="#3b82f6"
                  value={String(data.qtdFormalizados)}
                  sub="criados hoje"
                />
                <MiniCard
                  label="Acordos pagos hoje"
                  icon={<BarChart2 className="w-4 h-4" />}
                  accentColor="#22c55e"
                  value={<span className="text-emerald-500">{String(data.qtdPagos)}</span>}
                  sub={`de ${data.totalHoje} com vencimento hoje`}
                />
                <MiniCard
                  label="Taxa de eficiência"
                  icon={<Percent className="w-4 h-4" />}
                  accentColor={eficienciaColor}
                  value={
                    <span style={{ color: eficienciaColor }}>
                      {data.taxaEficiencia}%
                    </span>
                  }
                  sub={`${data.qtdPagos} pagos / ${data.totalHoje} agendados`}
                />
              </div>

              {/* ── Tags ── */}
              {data.porTag.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Recebido por tag
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {data.porTag.map((t, i) => {
                      const pct = data.valorRecebido > 0
                        ? Math.round((t.valor / data.valorRecebido) * 100)
                        : 0;
                      return (
                        <motion.div
                          key={t.tagId}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05, duration: 0.25 }}
                          className="space-y-1"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ background: t.cor }}
                              />
                              <span className="font-medium truncate max-w-[120px]">{t.nome}</span>
                              <span className="text-muted-foreground">{t.qtd} ac.</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono tabular-nums font-semibold">
                                {formatCurrency(t.valor)}
                              </span>
                              <span
                                className="text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded"
                                style={{
                                  background: t.cor + '20',
                                  color: t.cor,
                                }}
                              >
                                {pct}%
                              </span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.55, ease: 'easeOut', delay: i * 0.06 }}
                              className="h-full rounded-full"
                              style={{ background: `linear-gradient(90deg, ${t.cor}99, ${t.cor})` }}
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Estado vazio */}
              {data.totalHoje === 0 && data.qtdFormalizados === 0 && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Nenhum acordo registrado para hoje.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
