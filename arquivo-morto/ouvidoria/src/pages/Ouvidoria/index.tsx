/**
 * pages/Ouvidoria/index.tsx — aba Ouvidoria (PaguePlay)
 * ─────────────────────────────────────────────────────────────────────────
 * Demandas de suporte ao cliente (reclamações/sugestões): tabular, acompanhar
 * por urgência (prazo de 2 dias úteis), resolver com registro de como foi
 * resolvido, e gerenciar quem acessa a aba (cargo ouvidoria + admins).
 *
 * Acesso: useOuvidoriaAcesso (espelha as policies da migration 20260717b).
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  LifeBuoy, Plus, Search, X, RefreshCw, Clock, AlertTriangle, Flame,
  CheckCircle2, Smartphone, Mail, Link2, User, MapPin, Hash, FileText,
  ShieldCheck, Trash2, Eye, Pencil, Undo2, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useOuvidoriaAcesso } from '@/hooks/useOuvidoriaAcesso';
import { useProfissional } from '@/hooks/useProfissional';
import { supabase } from '@/lib/supabase';
import { ESTADOS_BRASIL, PERFIL_LABELS, formatarTelefonePP } from '@/lib/index';
import { cn } from '@/lib/utils';
import {
  OuvidoriaAtendimento, OuvidoriaAcesso, OuvidoriaTipo, OuvidoriaNivel, Urgencia,
  fetchAtendimentos, criarAtendimento, atualizarAtendimento, resolverAtendimento,
  reabrirAtendimento, excluirAtendimento, fetchAcessos, concederAcesso, revogarAcesso,
  urgenciaAtendimento, diasUteisRestantes,
} from '@/services/ouvidoria.service';

const SEM_ESTADO = '__sem_estado__';

const TIPO_LABEL: Record<OuvidoriaTipo, string> = {
  reclamacao: 'Reclamação',
  sugestao:   'Sugestão',
};

const URGENCIA_INFO: Record<Urgencia, { label: string; cls: string; icon: React.ReactNode }> = {
  no_prazo: {
    label: 'No prazo',
    cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    icon: <Clock className="w-3 h-3" />,
  },
  atencao: {
    label: 'Atenção — falta 1 dia',
    cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  urgente: {
    label: 'Urgente — prazo estourado',
    cls: 'bg-red-500/10 text-red-500 border-red-500/30',
    icon: <Flame className="w-3 h-3" />,
  },
};

function dataHora(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

interface FormState {
  tipo: OuvidoriaTipo;
  nomeCliente: string;
  estadoUf: string;
  whatsapp: string;
  email: string;
  link: string;
  codigo: string;
  descricao: string;
}

const FORM_VAZIO: FormState = {
  tipo: 'reclamacao', nomeCliente: '', estadoUf: '', whatsapp: '',
  email: '', link: '', codigo: '', descricao: '',
};

export default function Ouvidoria() {
  const { perfil }  = useAuth();
  const { empresa } = useEmpresa();
  const acesso      = useOuvidoriaAcesso();

  const [itens, setItens]     = useState<OuvidoriaAtendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState('');
  const [filtroStatus, setFiltroStatus]     = useState<'todos' | 'pendente' | 'resolvido'>('pendente');
  const [filtroUrgencia, setFiltroUrgencia] = useState<'todas' | Urgencia>('todas');

  // Modais
  const [formAberto, setFormAberto]   = useState(false);
  const [editando, setEditando]       = useState<OuvidoriaAtendimento | null>(null);
  const [form, setForm]               = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando]       = useState(false);
  const [detalhe, setDetalhe]         = useState<OuvidoriaAtendimento | null>(null);
  const [resolvendo, setResolvendo]   = useState<OuvidoriaAtendimento | null>(null);
  const [resolucao, setResolucao]     = useState('');
  const [excluindo, setExcluindo]     = useState<OuvidoriaAtendimento | null>(null);
  const [acessosAberto, setAcessosAberto] = useState(false);

  // Auto-preenche nome/estado a partir do Código (mesma base dos acordos)
  const { profissional } = useProfissional(formAberto ? form.codigo : '', empresa?.id);
  useEffect(() => {
    if (!profissional) return;
    setForm(f => ({
      ...f,
      nomeCliente: f.nomeCliente.trim() ? f.nomeCliente : (profissional.nome ?? ''),
      estadoUf:    f.estadoUf || (profissional.estado_uf ?? ''),
    }));
  }, [profissional]);

  const carregar = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      setItens(await fetchAtendimentos(empresa.id));
    } finally {
      setLoading(false);
    }
  }, [empresa?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Derivados ───────────────────────────────────────────────────────────
  const comUrgencia = useMemo(
    () => itens.map(i => ({ item: i, urgencia: urgenciaAtendimento(i) })),
    [itens],
  );

  const stats = useMemo(() => ({
    pendentes:  comUrgencia.filter(c => c.item.status === 'pendente').length,
    atencao:    comUrgencia.filter(c => c.urgencia === 'atencao').length,
    urgentes:   comUrgencia.filter(c => c.urgencia === 'urgente').length,
    resolvidos: comUrgencia.filter(c => c.item.status === 'resolvido').length,
  }), [comUrgencia]);

  const ordemUrgencia: Record<string, number> = { urgente: 0, atencao: 1, no_prazo: 2 };
  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return comUrgencia
      .filter(({ item, urgencia }) => {
        if (filtroStatus !== 'todos' && item.status !== filtroStatus) return false;
        if (filtroUrgencia !== 'todas' && urgencia !== filtroUrgencia) return false;
        if (!b) return true;
        return (
          item.nome_cliente.toLowerCase().includes(b) ||
          (item.codigo ?? '').toLowerCase().includes(b) ||
          (item.email ?? '').toLowerCase().includes(b) ||
          (item.whatsapp ?? '').toLowerCase().includes(b) ||
          (item.descricao ?? '').toLowerCase().includes(b)
        );
      })
      .sort((a, z) => {
        // Pendentes antes de resolvidos; entre pendentes, mais urgente e mais
        // antigo primeiro; resolvidos, mais recente primeiro.
        if (a.item.status !== z.item.status) return a.item.status === 'pendente' ? -1 : 1;
        if (a.item.status === 'pendente') {
          const ua = ordemUrgencia[a.urgencia ?? 'no_prazo'];
          const uz = ordemUrgencia[z.urgencia ?? 'no_prazo'];
          if (ua !== uz) return ua - uz;
          return a.item.iniciado_em.localeCompare(z.item.iniciado_em);
        }
        return (z.item.resolvido_em ?? '').localeCompare(a.item.resolvido_em ?? '');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comUrgencia, busca, filtroStatus, filtroUrgencia]);

  // ── Ações ───────────────────────────────────────────────────────────────
  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setFormAberto(true);
  }

  function abrirEdicao(item: OuvidoriaAtendimento) {
    setEditando(item);
    setForm({
      tipo:        item.tipo,
      nomeCliente: item.nome_cliente,
      estadoUf:    item.estado_uf ?? '',
      whatsapp:    item.whatsapp ?? '',
      email:       item.email ?? '',
      link:        item.link ?? '',
      codigo:      item.codigo ?? '',
      descricao:   item.descricao ?? '',
    });
    setFormAberto(true);
  }

  async function salvarForm() {
    if (!empresa?.id || !perfil?.id) return;
    if (!form.nomeCliente.trim()) { toast.error('Informe o nome do cliente'); return; }
    setSalvando(true);
    try {
      const whatsappFmt = form.whatsapp.trim() ? formatarTelefonePP(form.whatsapp) : '';
      if (editando) {
        const { ok, error } = await atualizarAtendimento(editando.id, {
          tipo:         form.tipo,
          nome_cliente: form.nomeCliente.trim(),
          estado_uf:    form.estadoUf || null,
          whatsapp:     whatsappFmt || null,
          email:        form.email.trim() || null,
          link:         form.link.trim() || null,
          codigo:       form.codigo.trim() || null,
          descricao:    form.descricao.trim() || null,
        });
        if (!ok) { toast.error('Erro ao salvar: ' + error); return; }
        toast.success('Atendimento atualizado!');
      } else {
        const { ok, error } = await criarAtendimento({
          empresaId:     empresa.id,
          criadoPor:     perfil.id,
          criadoPorNome: perfil.nome ?? perfil.email ?? '—',
          tipo:          form.tipo,
          nomeCliente:   form.nomeCliente,
          estadoUf:      form.estadoUf,
          whatsapp:      whatsappFmt,
          email:         form.email,
          link:          form.link,
          codigo:        form.codigo,
          descricao:     form.descricao,
        });
        if (!ok) { toast.error('Erro ao salvar: ' + error); return; }
        toast.success('Atendimento registrado como pendente!');
      }
      setFormAberto(false);
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarResolver() {
    if (!resolvendo || !perfil?.id) return;
    if (!resolucao.trim()) { toast.error('Descreva como o caso foi resolvido'); return; }
    setSalvando(true);
    try {
      const { ok, error } = await resolverAtendimento({
        id: resolvendo.id,
        resolucao,
        resolvidoPor: perfil.id,
        resolvidoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao resolver: ' + error); return; }
      toast.success('Caso marcado como resolvido!');
      setResolvendo(null);
      setResolucao('');
      setDetalhe(null);
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function reabrir(item: OuvidoriaAtendimento) {
    const { ok, error } = await reabrirAtendimento(item.id);
    if (!ok) { toast.error('Erro ao reabrir: ' + error); return; }
    toast.success('Caso reaberto como pendente.');
    setDetalhe(null);
    await carregar();
  }

  async function confirmarExcluir() {
    if (!excluindo) return;
    const { ok, error } = await excluirAtendimento(excluindo.id);
    if (!ok) { toast.error('Erro ao excluir: ' + error); return; }
    toast.success('Atendimento excluído.');
    setExcluindo(null);
    setDetalhe(null);
    await carregar();
  }

  // ── Gate ────────────────────────────────────────────────────────────────
  if (acesso.loading) {
    return (
      <div className="p-6 space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }
  if (!acesso.podeVer) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <p className="text-muted-foreground text-sm">Acesso restrito à Ouvidoria.</p>
      </div>
    );
  }

  const statsCards = [
    { label: 'Pendentes',  value: stats.pendentes,  cls: 'from-sky-500/20 to-sky-600/10 border-sky-500/20',       iconBg: 'bg-sky-500/15 text-sky-400',       icon: <Clock className="w-4 h-4" /> },
    { label: 'Atenção',    value: stats.atencao,    cls: 'from-amber-500/20 to-amber-600/10 border-amber-500/20', iconBg: 'bg-amber-500/15 text-amber-400',   icon: <AlertTriangle className="w-4 h-4" /> },
    { label: 'Urgentes',   value: stats.urgentes,   cls: 'from-red-500/20 to-red-600/10 border-red-500/20',       iconBg: 'bg-red-500/15 text-red-400',       icon: <Flame className="w-4 h-4" /> },
    { label: 'Resolvidos', value: stats.resolvidos, cls: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20', iconBg: 'bg-emerald-500/15 text-emerald-400', icon: <CheckCircle2 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen">
      <div className="h-1 w-full bg-gradient-to-r from-teal-500 via-cyan-400 to-sky-400 opacity-80" />

      <div className="p-6 max-w-[1280px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-600/10 border border-teal-500/20 flex items-center justify-center shadow-md flex-shrink-0">
              <LifeBuoy className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight leading-tight">Ouvidoria</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reclamações e sugestões de clientes — prazo de <strong className="text-foreground/70">2 dias úteis</strong> para resolver.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={carregar} disabled={loading}
              className="gap-1.5 h-8 text-xs rounded-lg">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar
            </Button>
            {acesso.podeGerenciarAcessos && (
              <Button variant="outline" size="sm" onClick={() => setAcessosAberto(true)}
                className="gap-1.5 h-8 text-xs rounded-lg">
                <ShieldCheck className="w-3.5 h-3.5" /> Acessos
              </Button>
            )}
            {acesso.podeEditar && (
              <Button size="sm" onClick={abrirNovo} className="gap-1.5 h-8 text-xs rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Novo Atendimento
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statsCards.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}>
                <div className={cn('rounded-xl border bg-gradient-to-br p-3.5 flex items-center gap-3', s.cls)}>
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', s.iconBg)}>{s.icon}</div>
                  <div>
                    <p className="text-xl font-bold leading-none text-foreground">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70 pointer-events-none" />
            <Input placeholder="Buscar por cliente, código, e-mail, descrição..."
              value={busca} onChange={e => setBusca(e.target.value)}
              className="pl-10 pr-9 h-10 text-sm rounded-xl" />
            {busca && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setBusca('')}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={filtroStatus} onValueChange={v => setFiltroStatus(v as typeof filtroStatus)}>
              <SelectTrigger className="h-9 w-36 text-xs rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="resolvido">Resolvidos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroUrgencia} onValueChange={v => setFiltroUrgencia(v as typeof filtroUrgencia)}>
              <SelectTrigger className="h-9 w-44 text-xs rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Toda urgência</SelectItem>
                <SelectItem value="no_prazo">No prazo</SelectItem>
                <SelectItem value="atencao">Atenção</SelectItem>
                <SelectItem value="urgente">Urgentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-5 space-y-2.5">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : visiveis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border/50 flex items-center justify-center">
                <LifeBuoy className="w-7 h-7 opacity-30" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-sm text-foreground/70">Nenhum atendimento</p>
                <p className="text-xs text-muted-foreground/70">
                  {busca || filtroStatus !== 'todos' || filtroUrgencia !== 'todas'
                    ? 'Nenhum resultado para os filtros atuais.'
                    : 'Registre o primeiro atendimento pelo botão acima.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/20">
                    {['Cliente', 'Código', 'Tipo', 'Contato', 'Iniciado em', 'Prazo', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground/80 uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(({ item, urgencia }, i) => {
                    const uInfo = urgencia ? URGENCIA_INFO[urgencia] : null;
                    const restantes = diasUteisRestantes(item);
                    return (
                      <motion.tr key={item.id}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.3), duration: 0.25 }}
                        onClick={() => setDetalhe(item)}
                        className={cn(
                          'border-b border-border/30 group cursor-pointer transition-colors hover:bg-accent/20',
                          urgencia === 'urgente' && 'bg-red-500/[0.04]',
                          urgencia === 'atencao' && 'bg-amber-500/[0.04]',
                        )}>
                        <td className="px-4 py-3 max-w-[180px]">
                          <span className="font-semibold text-foreground truncate block">{item.nome_cliente}</span>
                          {item.estado_uf && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                              <MapPin className="w-2.5 h-2.5" /> {item.estado_uf}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-foreground/80">{item.codigo || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn('text-[10px] font-medium',
                            item.tipo === 'reclamacao'
                              ? 'bg-orange-500/10 text-orange-500 border-orange-500/30'
                              : 'bg-violet-500/10 text-violet-500 border-violet-500/30')}>
                            {TIPO_LABEL[item.tipo]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            {item.whatsapp && <span title={item.whatsapp}><Smartphone className="w-3.5 h-3.5" /></span>}
                            {item.email    && <span title={item.email}><Mail className="w-3.5 h-3.5" /></span>}
                            {item.link     && <span title={item.link}><Link2 className="w-3.5 h-3.5" /></span>}
                            {!item.whatsapp && !item.email && !item.link && '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{dataHora(item.iniciado_em)}</td>
                        <td className="px-4 py-3">
                          {uInfo ? (
                            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border', uInfo.cls)}>
                              {uInfo.icon}
                              {urgencia === 'no_prazo'
                                ? `${restantes} dia${restantes !== 1 ? 's' : ''} útil${restantes !== 1 ? 'eis' : ''}`
                                : uInfo.label}
                            </span>
                          ) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {item.status === 'pendente' ? (
                            <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-500 border-sky-500/30">Pendente</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">Resolvido</Badge>
                          )}
                        </td>
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button title="Ver detalhes" onClick={() => setDetalhe(item)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {acesso.podeEditar && item.status === 'pendente' && (
                              <>
                                <button title="Editar" onClick={() => abrirEdicao(item)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button title="Marcar como resolvido"
                                  onClick={() => { setResolvendo(item); setResolucao(''); }}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {acesso.podeGerenciarAcessos && (
                              <button title="Excluir" onClick={() => setExcluindo(item)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
        </div>

        {/* ── Modal: novo/editar atendimento ── */}
        <Dialog open={formAberto} onOpenChange={o => { if (!o) setFormAberto(false); }}>
          <DialogContent className="max-w-lg" aria-describedby="ouv-form-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <LifeBuoy className="w-4 h-4 text-teal-400" />
                {editando ? 'Editar Atendimento' : 'Novo Atendimento'}
              </DialogTitle>
              <DialogDescription id="ouv-form-desc" className="text-xs">
                {editando
                  ? 'Ajuste os dados do atendimento.'
                  : 'A data/hora de início é registrada automaticamente ao salvar. Todo atendimento nasce como pendente.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium flex items-center gap-1"><Hash className="w-3 h-3" /> Código</Label>
                <Input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                  placeholder="Código do profissional" className="h-9 text-sm font-mono" />
                {profissional && (
                  <p className="text-[10px] text-emerald-500">Profissional encontrado — nome/estado preenchidos.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as OuvidoriaTipo }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reclamacao">Reclamação</SelectItem>
                    <SelectItem value="sugestao">Sugestão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-medium flex items-center gap-1"><User className="w-3 h-3" /> Nome completo *</Label>
                <Input value={form.nomeCliente} onChange={e => setForm(f => ({ ...f, nomeCliente: e.target.value }))}
                  placeholder="Nome do cliente" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium flex items-center gap-1"><MapPin className="w-3 h-3" /> Estado</Label>
                <Select value={form.estadoUf || SEM_ESTADO}
                  onValueChange={v => setForm(f => ({ ...f, estadoUf: v === SEM_ESTADO ? '' : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_ESTADO}>Nenhum</SelectItem>
                    {ESTADOS_BRASIL.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium flex items-center gap-1"><Smartphone className="w-3 h-3" /> WhatsApp</Label>
                <Input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                  placeholder="(00) 00000-0000" className="h-9 text-sm font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium flex items-center gap-1"><Mail className="w-3 h-3" /> E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="cliente@email.com" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium flex items-center gap-1"><Link2 className="w-3 h-3" /> Link</Label>
                <Input value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                  placeholder="https://..." className="h-9 text-sm" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-medium flex items-center gap-1"><FileText className="w-3 h-3" /> Detalhes da reclamação/sugestão</Label>
                <Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Descreva o assunto tratado com o cliente..." className="text-sm resize-none" rows={3} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setFormAberto(false)} disabled={salvando}>Cancelar</Button>
              <Button size="sm" onClick={salvarForm} disabled={salvando} className="gap-1.5">
                {salvando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {salvando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Registrar Atendimento'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Modal: detalhes ── */}
        <Dialog open={!!detalhe} onOpenChange={o => { if (!o) setDetalhe(null); }}>
          <DialogContent className="max-w-[520px] p-0 overflow-hidden" aria-describedby="ouv-det-desc">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 bg-muted/20">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                <LifeBuoy className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold leading-none">Detalhes do Atendimento</DialogTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Registrado por {detalhe?.criado_por_nome ?? '—'} em {dataHora(detalhe?.iniciado_em ?? null)}
                </p>
              </div>
            </div>
            <DialogDescription id="ouv-det-desc" className="sr-only">Detalhes completos do atendimento</DialogDescription>
            {detalhe && (
              <>
                <ScrollArea className="max-h-[480px]">
                  <div className="p-5 space-y-4 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cn('text-[10px]',
                        detalhe.tipo === 'reclamacao'
                          ? 'bg-orange-500/10 text-orange-500 border-orange-500/30'
                          : 'bg-violet-500/10 text-violet-500 border-violet-500/30')}>
                        {TIPO_LABEL[detalhe.tipo]}
                      </Badge>
                      {detalhe.status === 'pendente' ? (
                        <>
                          <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-500 border-sky-500/30">Pendente</Badge>
                          {(() => {
                            const u = urgenciaAtendimento(detalhe);
                            return u ? (
                              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border', URGENCIA_INFO[u].cls)}>
                                {URGENCIA_INFO[u].icon} {URGENCIA_INFO[u].label}
                              </span>
                            ) : null;
                          })()}
                        </>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30">Resolvido</Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <div><p className="text-muted-foreground mb-0.5">Cliente</p><p className="font-semibold text-foreground">{detalhe.nome_cliente}</p></div>
                      <div><p className="text-muted-foreground mb-0.5">Código</p><p className="font-mono font-semibold text-foreground">{detalhe.codigo || '—'}</p></div>
                      <div><p className="text-muted-foreground mb-0.5">Estado</p><p className="font-semibold text-foreground">{detalhe.estado_uf || '—'}</p></div>
                      <div><p className="text-muted-foreground mb-0.5">WhatsApp</p><p className="font-mono text-foreground">{detalhe.whatsapp || '—'}</p></div>
                      <div><p className="text-muted-foreground mb-0.5">E-mail</p><p className="text-foreground break-all">{detalhe.email || '—'}</p></div>
                      <div>
                        <p className="text-muted-foreground mb-0.5">Link</p>
                        {detalhe.link ? (
                          <a href={detalhe.link.startsWith('http') ? detalhe.link : `https://${detalhe.link}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-primary hover:underline break-all">{detalhe.link}</a>
                        ) : <p className="text-foreground">—</p>}
                      </div>
                    </div>

                    {detalhe.descricao && (
                      <div>
                        <p className="text-muted-foreground mb-1">Detalhes do caso</p>
                        <p className="text-foreground bg-muted/30 rounded-lg p-3 whitespace-pre-wrap">{detalhe.descricao}</p>
                      </div>
                    )}

                    {detalhe.status === 'resolvido' && (
                      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-1.5">
                        <p className="text-emerald-500 font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Como foi resolvido
                        </p>
                        <p className="text-foreground/90 whitespace-pre-wrap">{detalhe.resolucao || '—'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Por {detalhe.resolvido_por_nome ?? '—'} em {dataHora(detalhe.resolvido_em)}
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
                {acesso.podeEditar && (
                  <div className="px-5 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-end gap-2">
                    {detalhe.status === 'pendente' ? (
                      <>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                          onClick={() => abrirEdicao(detalhe)}>
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </Button>
                        <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => { setResolvendo(detalhe); setResolucao(''); }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como Resolvido
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                        onClick={() => reabrir(detalhe)}>
                        <Undo2 className="w-3.5 h-3.5" /> Reabrir como Pendente
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Modal: resolver ── */}
        <Dialog open={!!resolvendo} onOpenChange={o => { if (!o) setResolvendo(null); }}>
          <DialogContent className="max-w-md" aria-describedby="ouv-res-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm text-emerald-500">
                <CheckCircle2 className="w-4 h-4" /> Concluir Atendimento
              </DialogTitle>
              <DialogDescription id="ouv-res-desc" className="text-xs">
                Descreva como o caso de <strong className="text-foreground">{resolvendo?.nome_cliente}</strong> foi
                resolvido. Esse registro fica salvo no histórico do atendimento.
              </DialogDescription>
            </DialogHeader>
            <Textarea value={resolucao} onChange={e => setResolucao(e.target.value)}
              placeholder="Ex.: cliente orientado sobre o parcelamento; acordo reagendado para..." rows={4}
              className="text-sm resize-none" autoFocus />
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setResolvendo(null)} disabled={salvando}>Cancelar</Button>
              <Button size="sm" onClick={confirmarResolver} disabled={salvando || !resolucao.trim()}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                {salvando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Confirmar Resolução
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Modal: confirmar exclusão ── */}
        <Dialog open={!!excluindo} onOpenChange={o => { if (!o) setExcluindo(null); }}>
          <DialogContent className="max-w-sm" aria-describedby="ouv-del-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm text-destructive">
                <Trash2 className="w-4 h-4" /> Excluir Atendimento
              </DialogTitle>
              <DialogDescription id="ouv-del-desc" className="text-xs">
                O atendimento de <strong className="text-foreground">{excluindo?.nome_cliente}</strong> será excluído
                permanentemente. Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setExcluindo(null)}>Cancelar</Button>
              <Button size="sm" variant="destructive" onClick={confirmarExcluir} className="gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Modal: gestão de acessos ── */}
        {acesso.podeGerenciarAcessos && empresa?.id && perfil?.id && (
          <ModalAcessos
            open={acessosAberto}
            onClose={() => setAcessosAberto(false)}
            empresaId={empresa.id}
            meuId={perfil.id}
            meuNome={perfil.nome ?? perfil.email ?? '—'}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Modal de gestão de acessos: quem (além da ouvidoria e admins) vê/edita a aba
// ═══════════════════════════════════════════════════════════════════════════
interface UsuarioLinha { id: string; nome: string; email: string; perfil: string; }

function ModalAcessos({ open, onClose, empresaId, meuId, meuNome }: {
  open: boolean; onClose: () => void; empresaId: string; meuId: string; meuNome: string;
}) {
  const [usuarios, setUsuarios] = useState<UsuarioLinha[]>([]);
  const [acessos, setAcessos]   = useState<OuvidoriaAcesso[]>([]);
  const [loading, setLoading]   = useState(false);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [buscaUser, setBuscaUser]   = useState('');

  const carregarTudo = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: perfis }, listaAcessos] = await Promise.all([
        supabase.from('perfis')
          .select('id, nome, email, perfil')
          .eq('empresa_id', empresaId)
          .order('nome'),
        fetchAcessos(empresaId),
      ]);
      // Ouvidoria/admins já têm acesso por cargo — não aparecem na lista
      setUsuarios(((perfis ?? []) as UsuarioLinha[])
        .filter(u => !['ouvidoria', 'administrador', 'super_admin'].includes(u.perfil)));
      setAcessos(listaAcessos);
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { if (open) carregarTudo(); }, [open, carregarTudo]);

  const acessoDe = (usuarioId: string) => acessos.find(a => a.usuario_id === usuarioId);

  async function definirNivel(u: UsuarioLinha, nivel: OuvidoriaNivel | 'nenhum') {
    setSalvandoId(u.id);
    try {
      const atual = acessoDe(u.id);
      if (nivel === 'nenhum') {
        if (!atual) return;
        const { ok, error } = await revogarAcesso(atual.id);
        if (!ok) { toast.error('Erro ao revogar: ' + error); return; }
        toast.success(`Acesso de ${u.nome} removido.`);
      } else {
        const { ok, error } = await concederAcesso({
          empresaId, usuarioId: u.id, nivel,
          concedidoPor: meuId, concedidoPorNome: meuNome,
        });
        if (!ok) { toast.error('Erro ao conceder: ' + error); return; }
        toast.success(`${u.nome}: ${nivel === 'ver' ? 'somente visualizar' : 'visualizar e editar'}.`);
      }
      await carregarTudo();
    } finally {
      setSalvandoId(null);
    }
  }

  const filtrados = usuarios.filter(u => {
    const b = buscaUser.trim().toLowerCase();
    if (!b) return true;
    return u.nome?.toLowerCase().includes(b) || u.email?.toLowerCase().includes(b);
  });

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" aria-describedby="ouv-acc-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-teal-400" /> Acessos à Ouvidoria
          </DialogTitle>
          <DialogDescription id="ouv-acc-desc" className="text-xs">
            Ouvidoria e administradores sempre têm acesso total. Aqui você libera a aba para
            outros usuários: <strong>Visualizar</strong> (só leitura) ou <strong>Editar</strong> (leitura + escrita).
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
          <Input placeholder="Buscar usuário..." value={buscaUser} onChange={e => setBuscaUser(e.target.value)}
            className="pl-9 h-9 text-sm" />
        </div>
        <ScrollArea className="max-h-[340px] -mx-1 px-1">
          {loading ? (
            <div className="space-y-2 py-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : filtrados.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhum usuário encontrado.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {filtrados.map(u => {
                const atual = acessoDe(u.id);
                const valor = atual?.nivel ?? 'nenhum';
                return (
                  <div key={u.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{u.nome}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {PERFIL_LABELS[u.perfil] ?? u.perfil} · {u.email}
                      </p>
                    </div>
                    {atual && (
                      <UserPlus className="w-3.5 h-3.5 text-teal-400 shrink-0" aria-label="Acesso concedido" />
                    )}
                    <Select value={valor} disabled={salvandoId === u.id}
                      onValueChange={v => definirNivel(u, v as OuvidoriaNivel | 'nenhum')}>
                      <SelectTrigger className="h-8 w-36 text-xs shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum">Sem acesso</SelectItem>
                        <SelectItem value="ver">Visualizar</SelectItem>
                        <SelectItem value="editar">Editar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
