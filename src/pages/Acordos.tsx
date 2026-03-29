import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, MessageSquare, Edit, Eye,
  Filter, RefreshCw, X, CheckCircle2, Hash,
  Send, Copy, ChevronDown, ChevronUp, AlertCircle,
  Trash2, ChevronLeft, ChevronRight, CheckCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAcordos } from '@/hooks/useAcordos';
import { useAuth } from '@/hooks/useAuth';
import { supabase, Acordo } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  ROUTE_PATHS, STATUS_LABELS, STATUS_COLORS, TIPO_LABELS, TIPO_COLORS,
  formatCurrency, formatDate, getTodayISO, isAtrasado, gerarLinkWhatsapp
} from '@/lib/index';
import { cn } from '@/lib/utils';

// ─── Fila de envio WhatsApp ────────────────────────────────────────────────
interface ItemFila {
  id: string;
  nome_cliente: string;
  nr_cliente: string;
  whatsapp: string;
  valor: number;
  vencimento: string;
  mensagem: string;
  link: string;
  enviado: boolean;
}

function buildMensagem(a: Acordo): string {
  return `Olá *${a.nome_cliente}*, passando para lembrar do seu acordo *NR ${a.nr_cliente}*, no valor de *${formatCurrency(a.valor)}*, com vencimento em *${formatDate(a.vencimento)}*. Qualquer dúvida, estamos à disposição. 😊`;
}

// ─── Modal de fila de lembretes ────────────────────────────────────────────
function ModalFilaWhatsApp({
  fila,
  onClose,
}: {
  fila: ItemFila[];
  onClose: () => void;
}) {
  const [filaLocal, setFilaLocal] = useState<ItemFila[]>(fila);
  const [enviadosCount, setEnviadosCount] = useState(0);
  const [expandido, setExpandido] = useState<string | null>(null);

  const total     = filaLocal.length;
  const enviados  = filaLocal.filter(i => i.enviado).length;
  const restantes = total - enviados;

  function abrirProximo() {
    const pendentes = filaLocal.filter(i => !i.enviado);
    if (pendentes.length === 0) { toast.success('Todos os lembretes foram enviados!'); onClose(); return; }
    const item = pendentes[0];
    window.open(item.link, '_blank');
    setFilaLocal(prev => prev.map(i => i.id === item.id ? { ...i, enviado: true } : i));
    setEnviadosCount(prev => prev + 1);
  }

  function marcarEnviado(id: string) {
    setFilaLocal(prev => prev.map(i => i.id === id ? { ...i, enviado: true } : i));
  }

  function copiarMensagem(msg: string) {
    navigator.clipboard.writeText(msg).then(() => toast.success('Mensagem copiada!'));
  }

  function copiarTodasMensagens() {
    const texto = filaLocal
      .map((i, idx) => `[${idx + 1}/${total}] ${i.nome_cliente} (NR ${i.nr_cliente})\n${i.mensagem}`)
      .join('\n\n---\n\n');
    navigator.clipboard.writeText(texto).then(() => toast.success(`${total} mensagens copiadas!`));
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="w-4 h-4 text-success" />
            Fila de Lembretes WhatsApp
          </DialogTitle>
        </DialogHeader>

        {/* Progresso */}
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">{enviados} enviado(s)</span>
              <span className="font-medium text-foreground">{total} total</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-success transition-all duration-300 rounded-full"
                style={{ width: total > 0 ? `${(enviados / total) * 100}%` : '0%' }}
              />
            </div>
          </div>
          <span className="text-sm font-bold text-success tabular-nums">{enviados}/{total}</span>
        </div>

        {/* Botão de ação principal */}
        <div className="flex gap-2">
          {restantes > 0 ? (
            <Button onClick={abrirProximo} className="flex-1 gap-2 bg-success hover:bg-success/90">
              <Send className="w-4 h-4" />
              Abrir próximo no WhatsApp
              <Badge variant="secondary" className="ml-1">{restantes} restante(s)</Badge>
            </Button>
          ) : (
            <Button onClick={onClose} className="flex-1 gap-2" variant="outline">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Todos enviados! Fechar
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={copiarTodasMensagens} title="Copiar todas as mensagens">
            <Copy className="w-4 h-4" />
          </Button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filaLocal.map((item, idx) => (
            <div
              key={item.id}
              className={cn(
                'border rounded-lg transition-colors',
                item.enviado
                  ? 'border-success/30 bg-success/5 opacity-70'
                  : 'border-border bg-card'
              )}
            >
              <div className="flex items-center gap-3 p-3">
                {/* Número na fila */}
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  item.enviado ? 'bg-success text-white' : 'bg-muted text-muted-foreground'
                )}>
                  {item.enviado ? '✓' : idx + 1}
                </div>

                {/* Info do cliente */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-primary">#{item.nr_cliente}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs font-medium text-foreground truncate">{item.nome_cliente}</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {formatCurrency(item.valor)} · Vence {formatDate(item.vencimento)}
                  </p>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7"
                    onClick={() => copiarMensagem(item.mensagem)}
                    title="Copiar mensagem"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-success hover:bg-success/10"
                    onClick={() => { window.open(item.link, '_blank'); marcarEnviado(item.id); }}
                    title="Abrir no WhatsApp"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7"
                    onClick={() => setExpandido(expandido === item.id ? null : item.id)}
                  >
                    {expandido === item.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Mensagem expandida */}
              <AnimatePresence>
                {expandido === item.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 pt-0">
                      <div className="p-2.5 bg-muted/40 rounded text-xs text-muted-foreground leading-relaxed border border-border/50">
                        {item.mensagem}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tabela Skeleton ────────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      ))}
    </div>
  );
}

const PER_PAGE = 20;

export default function Acordos() {
  const { perfil } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Estados locais sincronizados com URL
  const [busca, setBusca]           = useState(searchParams.get('busca') || '');
  const [filtroStatus, setFiltroStatus] = useState(searchParams.get('status') || '');
  const [filtroTipo, setFiltroTipo] = useState(searchParams.get('tipo') || '');
  const [filtroData, setFiltroData] = useState(searchParams.get('data') || '');
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get('page')) || 1);

  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [atualizandoStatus, setAtualizandoStatus] = useState<string | null>(null);
  const [filaAberta, setFilaAberta] = useState(false);
  const [filaWhatsApp, setFilaWhatsApp] = useState<ItemFila[]>([]);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<Acordo | null>(null);
  const [confirmandoExclusaoLote, setConfirmandoExclusaoLote] = useState(false);

  // Debounce para busca
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (busca) params.set('busca', busca); else params.delete('busca');
      if (filtroStatus) params.set('status', filtroStatus); else params.delete('status');
      if (filtroTipo) params.set('tipo', filtroTipo); else params.delete('tipo');
      if (filtroData) params.set('data', filtroData); else params.delete('data');
      params.set('page', currentPage.toString());
      setSearchParams(params);
    }, 400);
    return () => clearTimeout(timer);
  }, [busca, filtroStatus, filtroTipo, filtroData, currentPage, setSearchParams]);

  const { acordos, totalCount, loading, refetch } = useAcordos({
    busca:       busca || undefined,
    status:      filtroStatus || undefined,
    tipo:        filtroTipo || undefined,
    vencimento:  filtroData || undefined,
    operador_id: perfil?.perfil === 'operador' ? perfil.id : undefined,
    page:        currentPage,
    perPage:     PER_PAGE,
  });

  const totalPages = Math.ceil(totalCount / PER_PAGE);
  const hoje = getTodayISO();
  const temFiltros = !!(busca || filtroStatus || filtroTipo || filtroData);

  function limparFiltros() {
    setBusca(''); setFiltroStatus(''); setFiltroTipo(''); setFiltroData(''); setCurrentPage(1);
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }

  function selecionarTodos() {
    if (selecionados.length === acordos.length) setSelecionados([]);
    else setSelecionados(acordos.map(a => a.id));
  }

  async function marcarComoPago(id: string) {
    setAtualizandoStatus(id);
    const { error } = await supabase.from('acordos').update({ status: 'pago' }).eq('id', id);
    if (error) toast.error('Erro ao atualizar status');
    else { toast.success('Acordo marcado como Pago!'); refetch(); }
    setAtualizandoStatus(null);
  }

  // ── Preparar fila de lembretes ─────────────────────────────────────────
  function prepararFila(listaAcordos: Acordo[]) {
    const comWhats = listaAcordos.filter(a => a.whatsapp);
    const semWhats = listaAcordos.filter(a => !a.whatsapp);

    if (comWhats.length === 0) {
      toast.warning('Nenhum acordo selecionado possui WhatsApp cadastrado');
      return;
    }
    if (semWhats.length > 0) {
      toast.info(`${semWhats.length} acordo(s) sem WhatsApp serão ignorados`);
    }

    const fila: ItemFila[] = comWhats.map(a => ({
      id: a.id,
      nome_cliente: a.nome_cliente,
      nr_cliente: a.nr_cliente,
      whatsapp: a.whatsapp!,
      valor: a.valor,
      vencimento: a.vencimento,
      mensagem: buildMensagem(a),
      link: `https://wa.me/55${a.whatsapp!.replace(/\D/g,'')}?text=${encodeURIComponent(buildMensagem(a))}`,
      enviado: false,
    }));

    setFilaWhatsApp(fila);
    setFilaAberta(true);
  }

  function enviarLembretesHoje() {
    const lista = acordos.filter(a => a.vencimento === hoje);
    if (lista.length === 0) { toast.info('Nenhum acordo vence hoje'); return; }
    prepararFila(lista);
  }

  async function excluirAcordo(a: Acordo) {
    setConfirmandoExclusao(null);
    setExcluindoId(a.id);
    const { error } = await supabase.from('acordos').delete().eq('id', a.id);
    if (error) toast.error('Erro ao excluir acordo: ' + error.message);
    else {
      // Registrar log de exclusão (best-effort — não bloqueia em caso de falha)
      supabase.from('logs_sistema').insert({
        usuario_id: perfil?.id ?? null,
        acao: 'exclusao_acordo',
        tabela: 'acordos',
        registro_id: a.id,
        detalhes: {
          nome_cliente: a.nome_cliente,
          nr_cliente: a.nr_cliente,
          excluido_por: perfil?.nome ?? perfil?.email ?? null,
          excluido_em: new Date().toISOString(),
        },
      }).then(({ error: logError }) => {
        if (logError) console.warn('[excluirAcordo] log error:', logError.message);
      });
      toast.success(`Acordo #${a.nr_cliente} excluído!`);
      refetch();
    }
    setExcluindoId(null);
  }

  async function excluirSelecionados() {
    setConfirmandoExclusaoLote(false);
    setLoading(true);
    try {
      const { error } = await supabase.from('acordos').delete().in('id', selecionados);
      if (error) throw error;
      toast.success(`${selecionados.length} acordos excluídos com sucesso!`);
      setSelecionados([]);
      refetch();
    } catch (err) {
      toast.error('Erro ao excluir acordos em lote');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function enviarUmWhatsapp(a: Acordo) {
    if (!a.whatsapp) { toast.warning('WhatsApp não cadastrado'); return; }
    const mensagem = buildMensagem(a);
    window.open(`https://wa.me/55${a.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(mensagem)}`, '_blank');
  }

  const acordosHoje = useMemo(() => acordos.filter(a => a.vencimento === hoje), [acordos, hoje]);

  return (
    <div className="p-6">
      <div className="max-w-[1400px] mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Acordos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? 'Carregando...' : `${totalCount} acordo(s) no total`}
              {selecionados.length > 0 && (
                <span className="ml-2 text-primary font-medium">· {selecionados.length} selecionado(s)</span>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {acordosHoje.length > 0 && selecionados.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-success/40 text-success hover:bg-success/10"
                onClick={enviarLembretesHoje}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Lembretes do dia ({acordosHoje.length})
              </Button>
            )}
            <Button variant="outline" size="icon" className="w-8 h-8" onClick={refetch}>
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </Button>
            <Button asChild size="sm">
              <Link to={ROUTE_PATHS.ACORDO_NOVO}>
                <Plus className="w-4 h-4 mr-1.5" /> Novo Acordo
              </Link>
            </Button>
          </div>
        </div>

        {/* ── Filtros ── */}
        <Card className="border-border mb-4">
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar NR, nome, WhatsApp..."
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setCurrentPage(1); }}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Select value={filtroStatus} onValueChange={(v) => { setFiltroStatus(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroTipo} onValueChange={(v) => { setFiltroTipo(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-32 h-8 text-sm"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Tipos</SelectItem>
                  {Object.entries(TIPO_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <input
                type="date"
                value={filtroData}
                onChange={e => { setFiltroData(e.target.value); setCurrentPage(1); }}
                className="h-8 text-sm bg-background border border-input rounded-md px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {temFiltros && (
                <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-8 text-xs gap-1">
                  <X className="w-3 h-3" /> Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Tabela ── */}
        <Card className="border-border">
          <CardContent className="p-0">
            {loading ? <TableSkeleton /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={selecionados.length === acordos.length && acordos.length > 0}
                          onChange={selecionarTodos}
                        />
                      </th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground">NR</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground">CLIENTE</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground">VENCIMENTO</th>
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground">VALOR</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground">TIPO</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground">PARCELAS</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground">STATUS</th>
                      <th className="text-left px-3 py-3 font-semibold text-muted-foreground">OPERADOR</th>
                      <th className="text-right px-3 py-3 font-semibold text-muted-foreground">
                        <div className="flex items-center justify-end gap-2">
                          {selecionados.length > 1 && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2 text-[10px] gap-1 animate-in fade-in slide-in-from-right-2"
                              onClick={() => setConfirmandoExclusaoLote(true)}
                            >
                              <Trash2 className="w-3 h-3" /> Excluir ({selecionados.length})
                            </Button>
                          )}
                          AÇÕES
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {acordos.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Filter className="w-8 h-8 opacity-30" />
                            <p className="font-medium">Nenhum acordo encontrado</p>
                            <p className="text-xs">Ajuste os filtros ou cadastre um novo acordo</p>
                          </div>
                        </td>
                      </tr>
                    ) : acordos.map((a, i) => {
                      const atrasado  = isAtrasado(a.vencimento, a.status);
                      const venceHoje = a.vencimento === hoje;
                      const sel       = selecionados.includes(a.id);
                      return (
                        <motion.tr
                          key={a.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: Math.min(i * 0.015, 0.3) }}
                          className={cn(
                            'border-b border-border/50 hover:bg-accent/40 transition-colors',
                            i % 2 === 0 && 'bg-muted/10',
                            atrasado  && 'bg-destructive/5',
                            venceHoje && a.status !== 'pago' && 'bg-warning/5',
                            sel && 'bg-primary/5 border-primary/20'
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              className="rounded border-border"
                              checked={sel}
                              onChange={() => toggleSelecionado(a.id)}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-primary text-[11px] bg-primary/8 border border-primary/20 px-1.5 py-0.5 rounded">
                              <Hash className="w-2.5 h-2.5" />{a.nr_cliente}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-foreground leading-none">{a.nome_cliente}</p>
                            {a.whatsapp && (
                              <p className="font-mono text-muted-foreground/70 text-[10px] mt-0.5">{a.whatsapp}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn('font-mono', atrasado && 'text-destructive font-semibold', venceHoje && 'text-warning font-semibold')}>
                              {formatDate(a.vencimento)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                            {formatCurrency(a.valor)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', TIPO_COLORS[a.tipo])}>
                              {TIPO_LABELS[a.tipo]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                            {['boleto', 'cartao_recorrente'].includes(a.tipo) ? a.parcelas : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border', STATUS_COLORS[a.status])}>
                              {STATUS_LABELS[a.status]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground text-[11px]">
                            {(a.perfis as { nome?: string } | undefined)?.nome?.split(' ')[0] || '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-0.5">
                              {a.status !== 'pago' && a.status !== 'nao_pago' && (
                                <Button
                                  variant="ghost" size="icon" className="w-6 h-6 text-success hover:bg-success/10"
                                  title="Marcar como Pago"
                                  disabled={atualizandoStatus === a.id}
                                  onClick={() => marcarComoPago(a.id)}
                                >
                                  <CheckCircle className="w-3 h-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost" size="icon"
                                className={cn('w-6 h-6', a.whatsapp ? 'text-success hover:bg-success/10' : 'text-muted-foreground/30')}
                                title={a.whatsapp ? 'Enviar WhatsApp' : 'Sem WhatsApp'}
                                onClick={() => enviarUmWhatsapp(a)}
                              >
                                <MessageSquare className="w-3 h-3" />
                              </Button>
                              <Button asChild variant="ghost" size="icon" className="w-6 h-6">
                                <Link to={`/acordos/${a.id}`} title="Ver detalhe"><Eye className="w-3 h-3" /></Link>
                              </Button>
                              <Button asChild variant="ghost" size="icon" className="w-6 h-6">
                                <Link to={`/acordos/${a.id}/editar`} title="Editar"><Edit className="w-3 h-3" /></Link>
                              </Button>
                              {(perfil?.perfil === 'administrador' || perfil?.perfil === 'lider') && (
                                <Button
                                  variant="ghost" size="icon"
                                  className="w-6 h-6 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                                  title="Excluir acordo"
                                  disabled={excluindoId === a.id}
                                  onClick={() => setConfirmandoExclusao(a)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Paginação */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">Página {currentPage} de {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="w-4 h-4 mr-1" /> Anterior</Button>
              <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Próximo <ChevronRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal confirmação exclusão ── */}
      {confirmandoExclusao && (
        <Dialog open onOpenChange={() => setConfirmandoExclusao(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" /> Confirmar exclusão
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-4">
              <div className="text-sm text-foreground">
                <p>Tem certeza que deseja excluir o acordo abaixo?</p>
                <p>Esta ação não pode ser desfeita.</p>
              </div>
              
              <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">NR: <span className="text-primary font-mono font-bold">#{confirmandoExclusao.nr_cliente}</span></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cliente: <span className="text-foreground font-bold">{confirmandoExclusao.nome_cliente.toUpperCase()}</span></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor: <span className="text-foreground font-bold">{formatCurrency(confirmandoExclusao.valor)}</span></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vencimento: <span className="text-foreground">{formatDate(confirmandoExclusao.vencimento)}</span></span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <Button variant="outline" onClick={() => setConfirmandoExclusao(null)}>
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                className="bg-destructive hover:bg-destructive/90 text-white gap-2"
                onClick={() => excluirAcordo(confirmandoExclusao)}
              >
                <Trash2 className="w-4 h-4" /> Excluir definitivamente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Modal confirmação exclusão lote ── */}
      {confirmandoExclusaoLote && (
        <Dialog open onOpenChange={() => setConfirmandoExclusaoLote(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-4 h-4" /> Excluir {selecionados.length} acordos
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-2">
              <p className="text-sm text-foreground">
                Tem certeza que deseja excluir os <strong>{selecionados.length}</strong> acordos selecionados? Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmandoExclusaoLote(false)}>Cancelar</Button>
              <Button
                variant="destructive" size="sm"
                className="gap-1.5"
                onClick={excluirSelecionados}
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir Tudo
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Modal fila WhatsApp ── */}
      {filaAberta && (
        <ModalFilaWhatsApp
          fila={filaWhatsApp}
          onClose={() => { setFilaAberta(false); setSelecionados([]); }}
        />
      )}
    </div>
  );
}
