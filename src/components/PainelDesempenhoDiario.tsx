import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart2, DollarSign, Percent, Tag, RefreshCw,
  X, TrendingUp, Users, ChevronLeft, ChevronRight,
  Calendar,
} from 'lucide-react';
import { useResumoDia } from '@/hooks/useResumoDia';
import { useEmpresaTags } from '@/hooks/useEmpresaTags';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useDiretoExtraConfig } from '@/hooks/useDiretoExtraConfig';
import { useTenant } from '@/lib/tenant-config';
import { DatePickerField } from '@/components/DatePickerField';
import { formatCurrency, getTodayISO, isPerfilAdmin, isPerfilLider } from '@/lib/index';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Perfil } from '@/lib/supabase';

// ─── Mini card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
}

function StatCard({ label, value, sub, icon, accent = '#6366f1' }: StatCardProps) {
  return (
    <div className="relative flex flex-col gap-1.5 rounded-xl border border-border/70 bg-card/80 p-3.5 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl" style={{ background: accent }} />
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-none">
          {label}
        </span>
        <span style={{ color: accent + 'bb' }}>{icon}</span>
      </div>
      <div className="text-lg font-bold leading-tight tracking-tight pl-1 font-mono tabular-nums">
        {value}
      </div>
      {sub && (
        <span className="text-[10px] text-muted-foreground pl-1 leading-snug">{sub}</span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PainelDesempenhoDiarioProps {
  aberto: boolean;
  onClose: () => void;
}

export function PainelDesempenhoDiario({ aberto, onClose }: PainelDesempenhoDiarioProps) {
  const { perfil } = useAuth();
  const { temPermissao } = useCargoPermissoes();
  const { tags } = useEmpresaTags();
  const tenant = useTenant();
  const { isAtivoParaUsuario } = useDiretoExtraConfig();

  const temLogicaDiretoExtra = tenant.isPaguePlay && isAtivoParaUsuario(
    perfil?.id ?? '',
    perfil?.setor_id ?? null,
    (perfil as (Perfil & { equipe_id?: string | null }) | null)?.equipe_id ?? null,
  );

  const [selectedDate, setSelectedDate] = useState(getTodayISO());
  const [selectedOperadorId, setSelectedOperadorId] = useState<string | null>(null);

  const isToday = selectedDate === getTodayISO();

  const _isAdmin = isPerfilAdmin(perfil?.perfil ?? '');
  const _isLider = isPerfilLider(perfil?.perfil ?? '');
  const _isDiretoria = perfil?.perfil === 'diretoria';
  const podeVerTodos = _isAdmin || _isLider || _isDiretoria || temPermissao('ver_acordos_gerais');

  const { data, operadores, loading, refetch } = useResumoDia({
    selectedOperadorId,
    temLogicaDiretoExtra,
    tags,
    selectedDate,
  });

  const ticketMedio = data.qtdPagos > 0 ? data.valorRecebido / data.qtdPagos : 0;

  const eficienciaColor =
    data.taxaEficiencia >= 70 ? '#22c55e'
    : data.taxaEficiencia >= 40 ? '#f59e0b'
    : '#ef4444';

  const operadorAtual = useMemo(
    () => operadores.find(o => o.id === selectedOperadorId),
    [operadores, selectedOperadorId],
  );

  function shiftDay(delta: number) {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + delta);
    const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    setSelectedDate(iso);
  }

  return (
    <AnimatePresence>
      {aberto && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
            onClick={onClose}
          />

          {/* Panel — slide up from bottom-left */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed bottom-4 left-4 z-40 w-[390px] max-w-[calc(100vw-2rem)] max-h-[85vh] flex flex-col rounded-2xl border border-border/80 bg-card shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-violet-500/10">
                  <BarChart2 className="w-4 h-4 text-violet-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-none">Desempenho Diário</p>
                  {selectedOperadorId && operadorAtual && (
                    <p className="text-[11px] text-muted-foreground leading-none mt-0.5 flex items-center gap-1">
                      <Users className="w-3 h-3" /> {operadorAtual.nome}
                    </p>
                  )}
                  {!selectedOperadorId && podeVerTodos && (
                    <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Todos os operadores</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 rounded-lg"
                  onClick={refetch} disabled={loading} title="Atualizar"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', loading && 'animate-spin')} />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 rounded-lg"
                  onClick={onClose}
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="px-5 py-3 border-b border-border/60 shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="icon" className="h-7 w-7 rounded-lg shrink-0"
                  onClick={() => shiftDay(-1)} title="Dia anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <div className="flex-1">
                  <DatePickerField value={selectedDate} onChange={setSelectedDate} size="sm" />
                </div>
                <Button
                  variant="outline" size="icon" className="h-7 w-7 rounded-lg shrink-0"
                  onClick={() => shiftDay(1)} disabled={isToday} title="Próximo dia"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
                {!isToday && (
                  <Button
                    variant="outline" size="sm"
                    className="h-7 text-xs px-2.5 rounded-lg gap-1 text-violet-500 border-violet-500/30 hover:bg-violet-500/10 shrink-0"
                    onClick={() => setSelectedDate(getTodayISO())}
                  >
                    <Calendar className="w-3 h-3" /> Hoje
                  </Button>
                )}
              </div>

              {podeVerTodos && operadores.length > 0 && (
                <Select
                  value={selectedOperadorId ?? '__todos'}
                  onValueChange={v => setSelectedOperadorId(v === '__todos' ? null : v)}
                >
                  <SelectTrigger className="h-7 text-xs rounded-lg border-border/70 w-full">
                    <SelectValue placeholder="Todos os operadores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todos">Todos os operadores</SelectItem>
                    {operadores.map(op => (
                      <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="grid grid-cols-2 gap-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="rounded-xl border border-border bg-muted/20 p-4 animate-pulse h-20" />
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    {/* Recebimento */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <StatCard
                        label="Valor recebido"
                        icon={<DollarSign className="w-3.5 h-3.5" />}
                        accent="#10b981"
                        value={<span className="text-emerald-500">{formatCurrency(data.valorRecebido)}</span>}
                        sub={`${data.qtdPagos} acordo${data.qtdPagos !== 1 ? 's' : ''} pago${data.qtdPagos !== 1 ? 's' : ''}`}
                      />
                      <StatCard
                        label="H.O. Total"
                        icon={<TrendingUp className="w-3.5 h-3.5" />}
                        accent="#22c55e"
                        value={<span className="text-emerald-400">{formatCurrency(data.valorHO)}</span>}
                        sub={`Bruto: ${formatCurrency(data.valorRecebido)}`}
                      />
                    </div>

                    {temLogicaDiretoExtra && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <StatCard
                          label="H.O. Direto"
                          icon={<DollarSign className="w-3.5 h-3.5" />}
                          accent="#3b82f6"
                          value={<span className="text-blue-500">{formatCurrency(data.valorHODireto)}</span>}
                          sub={`Bruto: ${formatCurrency(data.valorDireto)}`}
                        />
                        <StatCard
                          label="H.O. Extra"
                          icon={<DollarSign className="w-3.5 h-3.5" />}
                          accent="#7c3aed"
                          value={<span className="text-violet-500">{formatCurrency(data.valorHOExtra)}</span>}
                          sub={`Bruto: ${formatCurrency(data.valorExtra)}`}
                        />
                      </div>
                    )}

                    {/* Acordos */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <StatCard
                        label="Acordos formalizados"
                        icon={<BarChart2 className="w-3.5 h-3.5" />}
                        accent="#3b82f6"
                        value={String(data.qtdFormalizados)}
                        sub="criados no dia"
                      />
                      <StatCard
                        label="Ticket médio"
                        icon={<DollarSign className="w-3.5 h-3.5" />}
                        accent="#f59e0b"
                        value={
                          <span className={ticketMedio > 0 ? 'text-amber-500' : 'text-muted-foreground'}>
                            {ticketMedio > 0 ? formatCurrency(ticketMedio) : '—'}
                          </span>
                        }
                        sub={data.qtdPagos > 0 ? `${data.qtdPagos} pagamentos` : 'sem pagamentos'}
                      />
                    </div>

                    {/* Eficiência */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <StatCard
                        label="Agendados no dia"
                        icon={<BarChart2 className="w-3.5 h-3.5" />}
                        accent="#6366f1"
                        value={String(data.totalHoje)}
                        sub={`${data.qtdPagos} pagos · ${Math.max(0, data.totalHoje - data.qtdPagos)} pendentes`}
                      />
                      <StatCard
                        label="Taxa de eficiência"
                        icon={<Percent className="w-3.5 h-3.5" />}
                        accent={eficienciaColor}
                        value={<span style={{ color: eficienciaColor }}>{data.taxaEficiencia}%</span>}
                        sub={`${data.qtdPagos} pagos / ${data.totalHoje} agendados`}
                      />
                    </div>

                    {/* Tags */}
                    {data.porTag.length > 0 && (
                      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Tag className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                                transition={{ delay: i * 0.05, duration: 0.22 }}
                                className="space-y-1"
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.cor }} />
                                    <span className="font-medium truncate max-w-[110px]">{t.nome}</span>
                                    <span className="text-muted-foreground">{t.qtd}ac.</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="font-mono tabular-nums font-semibold text-[11px]">
                                      {formatCurrency(t.valor)}
                                    </span>
                                    <span
                                      className="text-[10px] font-bold tabular-nums px-1 py-0.5 rounded"
                                      style={{ background: t.cor + '22', color: t.cor }}
                                    >
                                      {pct}%
                                    </span>
                                  </div>
                                </div>
                                <div className="h-1 w-full rounded-full bg-muted/50 overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.05 }}
                                    className="h-full rounded-full"
                                    style={{ background: `linear-gradient(90deg, ${t.cor}88, ${t.cor})` }}
                                  />
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {data.totalHoje === 0 && data.qtdFormalizados === 0 && data.qtdPagos === 0 && (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        Nenhum registro encontrado para este dia.
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
