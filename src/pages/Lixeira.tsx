/**
 * Lixeira.tsx
 * Exibe acordos excluídos (manual ou transferência de NR) armazenados em lixeira_acordos.
 * Acessível por líder e administrador via /admin/lixeira
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Trash2, RefreshCw, Search, Clock, ArrowRightLeft,
  User, Building2, Calendar, DollarSign, Info, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { fetchLixeira, LixeiraAcordo } from '@/services/lixeira.service';
import { formatCurrency, formatDate } from '@/lib/index';
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
      <Badge variant="outline" className="gap-1 border-warning/50 text-warning bg-warning/10 text-xs">
        <ArrowRightLeft className="w-3 h-3" /> Transferência de NR
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive bg-destructive/10 text-xs">
      <Trash2 className="w-3 h-3" /> Exclusão Manual
    </Badge>
  );
}

export default function Lixeira() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();

  const [itens, setItens]         = useState<LixeiraAcordo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [busca, setBusca]         = useState('');
  const [detalhe, setDetalhe]     = useState<LixeiraAcordo | null>(null);

  const isAdminOuLider =
    perfil?.perfil === 'administrador' ||
    perfil?.perfil === 'super_admin' ||
    perfil?.perfil === 'lider';

  async function carregar() {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      const data = await fetchLixeira(empresa.id, 200);
      setItens(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, [empresa?.id]);

  const itensFiltrados = itens.filter(item => {
    if (!busca.trim()) return true;
    const b = busca.toLowerCase();
    return (
      item.nr_cliente?.toLowerCase().includes(b) ||
      item.nome_cliente?.toLowerCase().includes(b) ||
      item.operador_nome?.toLowerCase().includes(b) ||
      item.transferido_para_nome?.toLowerCase().includes(b)
    );
  });

  if (!isAdminOuLider) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground text-sm">Acesso restrito a líderes e administradores.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2 text-foreground">
            <Trash2 className="w-5 h-5 text-destructive" /> Lixeira de Acordos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Acordos excluídos manualmente ou transferidos. Retidos por 30 dias.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* Busca */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar por NR, nome, operador..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
        {busca && (
          <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setBusca('')}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Contadores */}
      {!loading && (
        <div className="flex gap-4 mb-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{itensFiltrados.length}</strong> registro(s)</span>
          <span>·</span>
          <span>
            <strong className="text-warning">{itens.filter(i => i.motivo === 'transferencia_nr').length}</strong> transferências
          </span>
          <span>·</span>
          <span>
            <strong className="text-destructive">{itens.filter(i => i.motivo === 'exclusao_manual').length}</strong> exclusões manuais
          </span>
        </div>
      )}

      {/* Tabela */}
      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Trash2 className="w-10 h-10 opacity-20" />
              <p className="font-medium">Lixeira vazia</p>
              <p className="text-xs">Nenhum acordo excluído nos últimos 30 dias</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">NR / INSCRIÇÃO</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">CLIENTE</th>
                    <th className="text-right px-4 py-3 font-semibold text-muted-foreground">VALOR</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">MOTIVO</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">ERA DO OPERADOR</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">TRANSFERIDO PARA</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">EXCLUÍDO EM</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">EXPIRA EM</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {itensFiltrados.map((item, i) => (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.015, 0.3) }}
                      className={cn(
                        'border-b border-border/40 hover:bg-accent/30 transition-colors',
                        i % 2 === 0 && 'bg-muted/10'
                      )}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-foreground">
                        {item.nr_cliente || item.instituicao || '—'}
                      </td>
                      <td className="px-4 py-3 text-foreground/80 max-w-[160px] truncate">
                        {item.nome_cliente || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {item.valor ? formatCurrency(item.valor) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {badgeMotivo(item.motivo)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.operador_nome || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.transferido_para_nome
                          ? <span className="text-primary font-medium">{item.transferido_para_nome}</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono">
                        {item.excluido_em
                          ? new Date(item.excluido_em).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center gap-1 text-xs font-medium',
                          tempoRestante(item.expira_em) === 'Expirado'
                            ? 'text-destructive'
                            : 'text-warning'
                        )}>
                          <Clock className="w-3 h-3" />
                          {tempoRestante(item.expira_em)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground"
                          title="Ver detalhes"
                          onClick={() => setDetalhe(item)}
                        >
                          <Info className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de detalhes */}
      <Dialog open={!!detalhe} onOpenChange={open => { if (!open) setDetalhe(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Trash2 className="w-5 h-5 text-destructive" />
              Detalhes do Acordo Excluído
            </DialogTitle>
          </DialogHeader>
          {detalhe && (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-4 pr-2">
                {/* Identificação */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dados do Acordo</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">NR / Inscrição:</span><br />
                      <strong className="font-mono">{detalhe.nr_cliente || detalhe.instituicao || '—'}</strong>
                    </div>
                    <div><span className="text-muted-foreground">Cliente:</span><br />
                      <strong>{detalhe.nome_cliente || '—'}</strong>
                    </div>
                    <div><span className="text-muted-foreground">Valor:</span><br />
                      <strong className="text-green-600">{detalhe.valor ? formatCurrency(detalhe.valor) : '—'}</strong>
                    </div>
                    <div><span className="text-muted-foreground">Vencimento:</span><br />
                      <strong>{detalhe.vencimento ? formatDate(detalhe.vencimento) : '—'}</strong>
                    </div>
                    <div><span className="text-muted-foreground">Status anterior:</span><br />
                      <strong>{detalhe.status || '—'}</strong>
                    </div>
                    <div><span className="text-muted-foreground">Tipo:</span><br />
                      <strong>{detalhe.tipo || '—'}</strong>
                    </div>
                  </div>
                </div>

                {/* Motivo */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Motivo da Exclusão</p>
                  <div className="flex items-center gap-2">{badgeMotivo(detalhe.motivo)}</div>
                  {detalhe.motivo === 'transferencia_nr' && (
                    <div className="space-y-1 text-sm mt-1">
                      <p><span className="text-muted-foreground">Operador anterior:</span>{' '}
                        <strong>{detalhe.operador_nome || '—'}</strong></p>
                      <p><span className="text-muted-foreground">Transferido para:</span>{' '}
                        <strong className="text-primary">{detalhe.transferido_para_nome || '—'}</strong></p>
                      <p><span className="text-muted-foreground">Autorizado por:</span>{' '}
                        <strong className="text-warning">{detalhe.autorizado_por_nome || '—'}</strong></p>
                    </div>
                  )}
                </div>

                {/* Datas */}
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Retenção</p>
                  <p><span className="text-muted-foreground">Excluído em:</span>{' '}
                    <strong>{detalhe.excluido_em ? new Date(detalhe.excluido_em).toLocaleString('pt-BR') : '—'}</strong></p>
                  <p><span className="text-muted-foreground">Expira em:</span>{' '}
                    <strong className="text-warning">{detalhe.expira_em ? new Date(detalhe.expira_em).toLocaleString('pt-BR') : '—'}</strong></p>
                  <p><span className="text-muted-foreground">Tempo restante:</span>{' '}
                    <strong className="text-warning">{tempoRestante(detalhe.expira_em)}</strong></p>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
