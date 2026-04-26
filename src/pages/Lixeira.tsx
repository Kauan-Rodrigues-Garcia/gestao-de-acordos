/**
 * Lixeira.tsx
 * Exibe acordos excluídos (manual ou transferência de NR) armazenados em lixeira_acordos.
 * Acessível por líder e administrador via /admin/lixeira
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2, RefreshCw, Search, Clock, ArrowRightLeft,
  AlertTriangle, X, Info, ShieldAlert, FileX2, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { fetchLixeira, esvaziarLixeira, purgarExpirados, LixeiraAcordo } from '@/services/lixeira.service';
import { formatCurrency, formatDate } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function tempoRestante(expiraEm?: string): string {
  if (!expiraEm) return '—';
  const diff = new Date(expiraEm).getTime() - Date.now();
  if (diff <= 0) return 'Expirado';
  const dias = Math.floor(diff / 86_400_000);
  if (dias > 1) return `${dias} dias`;
  const horas = Math.floor(diff / 3_600_000);
  if (horas > 0) return `${horas}h`;
  return 'Menos de 1h';
}

function badgeMotivo(motivo: string) {
  if (motivo === 'transferencia_nr') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border border-amber-400/30 bg-amber-400/10 text-amber-500 shadow-[0_0_8px_rgba(251,191,36,0.12)]">
        <ArrowRightLeft className="w-3 h-3" /> Transferência de NR
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border border-red-500/30 bg-red-500/10 text-red-500 shadow-[0_0_8px_rgba(239,68,68,0.12)]">
      <Trash2 className="w-3 h-3" /> Exclusão Manual
    </span>
  );
}

function tempoUrgencia(expiraEm?: string): 'green' | 'yellow' | 'red' | 'gray' {
  if (!expiraEm) return 'gray';
  const diff = new Date(expiraEm).getTime() - Date.now();
  if (diff <= 0) return 'red';
  if (diff < 86_400_000) return 'red';
  if (diff < 2 * 86_400_000) return 'yellow';
  return 'green';
}

function AvatarInitials({ name }: { name?: string | null }) {
  if (!name) return <span className="text-muted-foreground">—</span>;
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <span className="text-[9px] font-bold text-primary">{initials}</span>
      </div>
      <span className="text-muted-foreground truncate max-w-[110px]">{name}</span>
    </div>
  );
}

export default function Lixeira() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [itens, setItens]               = useState<LixeiraAcordo[]>([]);
  const [loading, setLoading]           = useState(true);
  const [busca, setBusca]               = useState('');
  const [detalhe, setDetalhe]           = useState<LixeiraAcordo | null>(null);
  const [confirmEsvaziar, setConfirmEsvaziar] = useState(false);
  const [esvaziando, setEsvaziando]     = useState(false);

  const podeAcessar =
    perfil?.perfil === 'administrador' ||
    perfil?.perfil === 'super_admin' ||
    perfil?.perfil === 'lider' ||
    perfil?.perfil === 'operador';

  const podeEsvaziar = podeAcessar;

  async function carregar() {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      // Purga lazy: antes de listar, remove permanentemente os itens cujo
      // expira_em já passou (prazo padrão de 3 dias). Evita que o usuário
      // veja itens com status "expirado" que já deveriam ter sido excluídos.
      // Idealmente deveria existir um job pg_cron no Supabase; aqui fica
      // como garantia de funcionalidade client-side.
      await purgarExpirados(empresa.id);
      // #8: operador só vê os próprios acordos excluídos. Elite/Líder/Gerência/Diretoria/Admin veem tudo.
      const ehOperador = perfil?.perfil === 'operador';
      const data = await fetchLixeira(
        empresa.id,
        ehOperador && perfil?.id ? { operadorId: perfil.id } : undefined,
      );
      setItens(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleEsvaziar() {
    if (!empresa?.id) return;
    setEsvaziando(true);
    const { ok, error } = await esvaziarLixeira(empresa.id);
    setEsvaziando(false);
    setConfirmEsvaziar(false);
    if (ok) {
      setItens([]);
      toast.success('Lixeira esvaziada com sucesso!');
    } else {
      toast.error('Erro ao esvaziar lixeira: ' + error);
    }
  }

  useEffect(() => { carregar(); }, [empresa?.id]);

  const itensFiltrados = itens.filter(item => {
    // Defesa em profundidade: se por qualquer motivo a purga server-side
    // falhou, não mostra itens cujo expira_em já passou.
    if (item.expira_em && new Date(item.expira_em).getTime() < Date.now()) return false;
    if (!busca.trim()) return true;
    const b = busca.toLowerCase();
    return (
      item.nr_cliente?.toLowerCase().includes(b) ||
      item.nome_cliente?.toLowerCase().includes(b) ||
      item.operador_nome?.toLowerCase().includes(b) ||
      item.transferido_para_nome?.toLowerCase().includes(b)
    );
  });

  if (!podeAcessar) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground text-sm">Acesso restrito.</p>
      </div>
    );
  }

  const totalTransferencias = itens.filter(i => i.motivo === 'transferencia_nr').length;
  const totalExclusoes = itens.filter(i => i.motivo === 'exclusao_manual').length;

  const statsCards = [
    {
      label: 'Total na Lixeira',
      value: itensFiltrados.length,
      icon: <Trash2 className="w-4 h-4" />,
      color: 'from-slate-500/20 to-slate-600/10 border-slate-500/20',
      iconBg: 'bg-slate-500/15 text-slate-400',
      valueColor: 'text-foreground',
    },
    {
      label: 'Transferências de NR',
      value: totalTransferencias,
      icon: <ArrowRightLeft className="w-4 h-4" />,
      color: 'from-amber-500/20 to-amber-600/10 border-amber-500/20',
      iconBg: 'bg-amber-500/15 text-amber-400',
      valueColor: 'text-amber-400',
    },
    {
      label: 'Exclusões Manuais',
      value: totalExclusoes,
      icon: <FileX2 className="w-4 h-4" />,
      color: 'from-red-500/20 to-red-600/10 border-red-500/20',
      iconBg: 'bg-red-500/15 text-red-400',
      valueColor: 'text-red-400',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Gradient accent strip at top */}
      <div className="h-1 w-full bg-gradient-to-r from-red-500 via-rose-400 to-orange-400 opacity-80" />

      <div className="p-6 max-w-[1280px] mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500/20 to-rose-600/10 border border-red-500/20 flex items-center justify-center shadow-md flex-shrink-0">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight leading-tight">
                Lixeira de Acordos
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Acordos excluídos ou transferidos — retidos por <strong className="text-foreground/70">3 dias</strong> antes da exclusão definitiva.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={carregar}
              disabled={loading}
              className="gap-1.5 h-8 text-xs rounded-lg border-border/60 hover:bg-accent/50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              Atualizar
            </Button>
            {podeEsvaziar && itens.length > 0 && (
              <Button
                size="sm"
                onClick={() => setConfirmEsvaziar(true)}
                className="gap-1.5 h-8 text-xs rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:text-red-300 shadow-none"
                variant="ghost"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Esvaziar Lixeira
              </Button>
            )}
          </div>
        </div>

        {/* ── Stats Cards ── */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3">
            {statsCards.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.35, ease: 'easeOut' }}
              >
                <div className={cn(
                  'rounded-xl border bg-gradient-to-br p-3.5 flex items-center gap-3 backdrop-blur-sm',
                  stat.color
                )}>
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', stat.iconBg)}>
                    {stat.icon}
                  </div>
                  <div>
                    <p className={cn('text-xl font-bold leading-none', stat.valueColor)}>{stat.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Search Bar ── */}
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
          <Input
            placeholder="Buscar por NR, cliente, operador ou destino..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-10 pr-9 h-10 text-sm rounded-xl border-border/60 shadow-sm bg-background/80 focus-visible:ring-1 focus-visible:ring-primary/40"
          />
          <AnimatePresence>
            {busca && (
              <motion.button
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15 }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setBusca('')}
              >
                <X className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ── Table Card ── */}
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-5 space-y-2.5">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-center">
                <Trash2 className="w-7 h-7 opacity-30" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-sm text-foreground/70">Lixeira vazia</p>
                <p className="text-xs text-muted-foreground/70">
                  {busca ? 'Nenhum resultado para a busca atual.' : 'Nenhum acordo excluído nos últimos 3 dias.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">
                      NR / Inscrição
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">
                      Cliente
                    </th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">
                      Valor
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">
                      Motivo
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">
                      Operador Anterior
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">
                      Transferido Para
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">
                      Excluído Em
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">
                      Expira Em
                    </th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {itensFiltrados.map((item, i) => {
                    const urgencia = tempoUrgencia(item.expira_em);
                    const urgenciaColors = {
                      green:  'text-emerald-400',
                      yellow: 'text-amber-400',
                      red:    'text-red-400',
                      gray:   'text-muted-foreground',
                    };
                    return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.025, 0.4), duration: 0.28, ease: 'easeOut' }}
                        className={cn(
                          'border-b border-border/30 transition-colors duration-150 group cursor-default',
                          'hover:bg-accent/20',
                          i % 2 === 1 && 'bg-muted/5'
                        )}
                      >
                        {/* NR / Inscrição */}
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-foreground text-xs">
                            {item.nr_cliente || item.instituicao || '—'}
                          </span>
                        </td>

                        {/* Cliente */}
                        <td className="px-4 py-3 max-w-[160px]">
                          <span className="text-foreground/80 truncate block">
                            {item.nome_cliente || '—'}
                          </span>
                        </td>

                        {/* Valor */}
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono font-semibold text-emerald-400">
                            {item.valor ? formatCurrency(item.valor) : '—'}
                          </span>
                        </td>

                        {/* Motivo */}
                        <td className="px-4 py-3">
                          {badgeMotivo(item.motivo)}
                        </td>

                        {/* Operador */}
                        <td className="px-4 py-3">
                          <AvatarInitials name={item.operador_nome} />
                        </td>

                        {/* Transferido para */}
                        <td className="px-4 py-3">
                          {item.transferido_para_nome ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-[9px] font-bold text-primary">
                                  {item.transferido_para_nome.split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase()}
                                </span>
                              </div>
                              <span className="text-primary font-medium truncate max-w-[110px]">
                                {item.transferido_para_nome}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>

                        {/* Excluído em */}
                        <td className="px-4 py-3 font-mono text-muted-foreground">
                          {item.excluido_em
                            ? new Date(item.excluido_em).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>

                        {/* Expira em */}
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex items-center gap-1 font-semibold',
                            urgenciaColors[urgencia]
                          )}>
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            {tempoRestante(item.expira_em)}
                          </span>
                        </td>

                        {/* Detalhes */}
                        <td className="px-3 py-3">
                          <button
                            title="Ver detalhes"
                            onClick={() => setDetalhe(item)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all duration-150 opacity-0 group-hover:opacity-100"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Detail Modal ── */}
        <Dialog open={!!detalhe} onOpenChange={open => { if (!open) setDetalhe(null); }}>
          <DialogContent className="max-w-[520px] p-0 overflow-hidden rounded-2xl border border-border/60 shadow-2xl" aria-describedby="lixeira-dlg-desc">
            {/* Modal header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 bg-muted/20">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold text-foreground leading-none">
                  Detalhes do Acordo Excluído
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Registro retido temporariamente na lixeira
                </p>
              </div>
            </div>
            <DialogDescription id="lixeira-dlg-desc" className="sr-only">Detalhes completos do acordo excluído</DialogDescription>

            {detalhe && (
              <ScrollArea className="max-h-[520px]">
                <div className="p-5 space-y-4">

                  {/* Section: Dados do Acordo */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="px-4 py-2.5 bg-muted/30 border-b border-border/40 flex items-center gap-2">
                      <div className="w-1 h-4 rounded-full bg-primary" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Dados do Acordo
                      </p>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                      <div>
                        <p className="text-muted-foreground mb-0.5">NR / Inscrição</p>
                        <p className="font-mono font-bold text-foreground">{detalhe.nr_cliente || detalhe.instituicao || '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Cliente</p>
                        <p className="font-semibold text-foreground">{detalhe.nome_cliente || '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Valor</p>
                        <p className="font-mono font-bold text-emerald-400">{detalhe.valor ? formatCurrency(detalhe.valor) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Vencimento</p>
                        <p className="font-semibold text-foreground">{detalhe.vencimento ? formatDate(detalhe.vencimento) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Status anterior</p>
                        <p className="font-semibold text-foreground">{detalhe.status || '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Tipo</p>
                        <p className="font-semibold text-foreground">{detalhe.tipo || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Section: Motivo */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="px-4 py-2.5 bg-muted/30 border-b border-border/40 flex items-center gap-2">
                      <div className="w-1 h-4 rounded-full bg-amber-400" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Motivo da Exclusão
                      </p>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>{badgeMotivo(detalhe.motivo)}</div>

                      {detalhe.motivo === 'transferencia_nr' && (
                        /* Visual transfer chain */
                        <div className="mt-2 space-y-0">
                          {[
                            { label: 'Operador anterior', value: detalhe.operador_nome, color: 'bg-slate-500/15 text-slate-400 border-slate-500/20' },
                            { label: 'Transferido para', value: detalhe.transferido_para_nome, color: 'bg-primary/10 text-primary border-primary/20' },
                            { label: 'Autorizado por', value: detalhe.autorizado_por_nome, color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
                          ].map((step, idx, arr) => (
                            <div key={step.label} className="flex flex-col items-start">
                              <div className={cn(
                                'w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs',
                                step.color
                              )}>
                                <div className="w-5 h-5 rounded-full bg-current/10 flex items-center justify-center flex-shrink-0 opacity-70">
                                  <span className="text-[9px] font-bold">{idx + 1}</span>
                                </div>
                                <div>
                                  <p className="opacity-70 text-[10px]">{step.label}</p>
                                  <p className="font-semibold">{step.value || '—'}</p>
                                </div>
                              </div>
                              {idx < arr.length - 1 && (
                                <div className="ml-4 w-px h-3 bg-border/60" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section: Retenção */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="px-4 py-2.5 bg-muted/30 border-b border-border/40 flex items-center gap-2">
                      <div className="w-1 h-4 rounded-full bg-red-400" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Período de Retenção
                      </p>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                      <div>
                        <p className="text-muted-foreground mb-0.5">Excluído em</p>
                        <p className="font-semibold text-foreground">
                          {detalhe.excluido_em ? new Date(detalhe.excluido_em).toLocaleString('pt-BR') : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Expira em</p>
                        <p className="font-semibold text-amber-400">
                          {detalhe.expira_em ? new Date(detalhe.expira_em).toLocaleString('pt-BR') : '—'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground mb-1">Tempo restante</p>
                        <div className={cn(
                          'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold text-xs',
                          tempoUrgencia(detalhe.expira_em) === 'green' && 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
                          tempoUrgencia(detalhe.expira_em) === 'yellow' && 'bg-amber-500/10 border-amber-500/25 text-amber-400',
                          tempoUrgencia(detalhe.expira_em) === 'red' && 'bg-red-500/10 border-red-500/25 text-red-400',
                          tempoUrgencia(detalhe.expira_em) === 'gray' && 'bg-muted border-border text-muted-foreground',
                        )}>
                          <Clock className="w-3.5 h-3.5" />
                          {tempoRestante(detalhe.expira_em)}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Empty Trash Confirmation Modal ── */}
        <Dialog open={confirmEsvaziar} onOpenChange={setConfirmEsvaziar}>
          <DialogContent className="max-w-[420px] p-0 overflow-hidden rounded-2xl border border-border/60 shadow-2xl" aria-describedby="dlg-esvaziar-desc">
            {/* Dramatic red gradient header */}
            <div className="bg-gradient-to-br from-red-600/25 via-red-500/15 to-rose-600/10 border-b border-red-500/20 px-6 py-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold text-foreground">
                  Esvaziar Lixeira
                </DialogTitle>
                <p className="text-xs text-red-400/80 mt-0.5 font-medium">
                  Esta ação é permanente e irreversível
                </p>
              </div>
            </div>

            <div className="px-6 py-5 space-y-3">
              <DialogDescription id="dlg-esvaziar-desc" className="text-xs text-muted-foreground leading-relaxed">
                Você está prestes a excluir permanentemente todos os acordos da lixeira.
                Após a confirmação, <strong className="text-foreground">não será possível recuperar</strong> esses registros.
              </DialogDescription>

              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-xs text-foreground/80">
                  <span className="font-bold text-red-400 text-sm">{itens.length}</span>{' '}
                  acordo{itens.length !== 1 ? 's' : ''} ser{itens.length !== 1 ? 'ão' : 'á'} excluído{itens.length !== 1 ? 's' : ''} permanentemente.
                </p>
              </div>
            </div>

            <DialogFooter className="px-6 pb-5 flex-row gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmEsvaziar(false)}
                disabled={esvaziando}
                className="h-8 text-xs rounded-lg"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleEsvaziar}
                disabled={esvaziando}
                className="h-8 text-xs rounded-lg gap-1.5 bg-red-500 hover:bg-red-600 text-white border-0 shadow-md shadow-red-500/20"
              >
                {esvaziando ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {esvaziando ? 'Esvaziando...' : 'Esvaziar Definitivamente'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
