import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, Edit, Shield, RefreshCw, Save, Building2, ArrowRightLeft, Filter } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { supabase, Perfil, PerfilUsuario, Setor, Empresa } from '@/lib/supabase';
import { buildAuthRedirectUrl } from '@/lib/tenant';
import { fetchEmpresas } from '@/services/empresas.service';
import { PERFIL_LABELS, TODAS_EMPRESAS_SELECT_VALUE } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PERFIL_BADGE: Record<string, string> = {
  operador:      'bg-primary/10 text-primary border-primary/30',
  lider:         'bg-warning/10 text-warning border-warning/30',
  administrador: 'bg-destructive/10 text-destructive border-destructive/30',
  super_admin:   'bg-chart-1/10 text-chart-1 border-chart-1/30',
};

interface UserForm {
  nome:       string;
  email:      string;
  senha:      string;
  perfil:     PerfilUsuario;
  setor_id:   string;
  empresa_id: string;
}

export default function AdminUsuarios() {
  const { perfil: perfilAtual } = useAuth();
  const { empresa: empresaAtual } = useEmpresa();
  const isAdmin = perfilAtual?.perfil === 'administrador';
  const isSuperAdmin = perfilAtual?.perfil === 'super_admin';
  const [usuarios,    setUsuarios]    = useState<Perfil[]>([]);
  const [setores,     setSetores]     = useState<Setor[]>([]);
  const [empresas,    setEmpresas]    = useState<Empresa[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editando,    setEditando]    = useState<Perfil | null>(null);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('');
  const [saving,      setSaving]      = useState(false);
  const [form,        setForm]        = useState<UserForm>({ nome: '', email: '', senha: '', perfil: 'operador', setor_id: '', empresa_id: '' });

  // ── Mover usuário entre setores ─────────────────────────────────────────
  const [moverDialog, setMoverDialog]       = useState(false);
  const [moverUsuario, setMoverUsuario]     = useState<Perfil | null>(null);
  const [moverSetorId, setMoverSetorId]     = useState('');
  const [moverSaving, setMoverSaving]       = useState(false);

  useEffect(() => {
    if (empresaAtual?.id) {
      setFiltroEmpresa((current) => current || empresaAtual.id);
      setForm((current) => ({
        ...current,
        empresa_id: current.empresa_id || empresaAtual.id,
      }));
    }
  }, [empresaAtual?.id]);

  async function fetchDados() {
    setLoading(true);
    let usuariosData: Perfil[] = [];
    try {
      let usersQuery = supabase
        .from('perfis')
        .select('*, setores(id,nome), empresas(id,nome)')
        .order('nome');
      if (!isSuperAdmin && empresaAtual?.id) {
        usersQuery = usersQuery.eq('empresa_id', empresaAtual.id);
      } else if (filtroEmpresa) {
        usersQuery = usersQuery.eq('empresa_id', filtroEmpresa);
      }
      const { data: uJoin, error: eJoin } = await usersQuery;
      if (eJoin) {
        console.warn('[AdminUsuarios] fetchDados join error, tentando sem join de empresas:', eJoin.message);
        let fallbackQuery = supabase
          .from('perfis')
          .select('*, setores(id,nome)')
          .order('nome');
        if (!isSuperAdmin && empresaAtual?.id) {
          fallbackQuery = fallbackQuery.eq('empresa_id', empresaAtual.id);
        } else if (filtroEmpresa) {
          fallbackQuery = fallbackQuery.eq('empresa_id', filtroEmpresa);
        }
        const { data: uSimple, error: eSimple } = await fallbackQuery;
        if (eSimple) {
          console.warn('[AdminUsuarios] fetchDados fallback error:', eSimple.message);
        }
        usuariosData = (uSimple as Perfil[]) || [];
      } else {
        usuariosData = (uJoin as Perfil[]) || [];
      }
    } catch (err) {
      console.warn('[AdminUsuarios] fetchDados error:', err);
    }
    let setoresData: Setor[] = [];
    let emps: Empresa[] = [];
    try {
      const setoresPromise = (() => {
        let query = supabase.from('setores').select('*').eq('ativo', true).order('nome');
        if (!isSuperAdmin && empresaAtual?.id) {
          query = query.eq('empresa_id', empresaAtual.id);
        } else if (filtroEmpresa) {
          query = query.eq('empresa_id', filtroEmpresa);
        }
        return query;
      })();

      const empresasPromise = isSuperAdmin
        ? fetchEmpresas()
        : Promise.resolve(empresaAtual ? [empresaAtual] : []);

      const [{ data: s }, empresasList] = await Promise.all([setoresPromise, empresasPromise]);
      setoresData = (s as Setor[]) || [];
      emps = empresasList;
    } catch (err) {
      console.warn('[AdminUsuarios] fetchDados setores/empresas error:', err);
    }
    setUsuarios(usuariosData);
    setSetores(setoresData);
    setEmpresas(emps);
    if (setoresData.length > 0 && !form.setor_id) {
      setForm(f => ({ ...f, setor_id: setoresData[0].id }));
    }
    setLoading(false);
  }

  useEffect(() => { fetchDados(); }, [empresaAtual?.id, filtroEmpresa, isSuperAdmin]);

  function abrirCriar() {
    setEditando(null);
    setForm({
      nome: '',
      email: '',
      senha: '',
      perfil: 'operador',
      setor_id: setores[0]?.id ?? '',
      empresa_id: empresaAtual?.id ?? '',
    });
    setDialogOpen(true);
  }

  function abrirEditar(u: Perfil) {
    setEditando(u);
    setForm({ nome: u.nome, email: u.email, senha: '', perfil: u.perfil, setor_id: u.setor_id ?? '', empresa_id: u.empresa_id ?? '' });
    setDialogOpen(true);
  }

  function abrirMover(u: Perfil) {
    setMoverUsuario(u);
    setMoverSetorId(u.setor_id ?? setores[0]?.id ?? '');
    setMoverDialog(true);
  }

  async function salvar() {
    const empresaId = isSuperAdmin ? form.empresa_id : (empresaAtual?.id ?? form.empresa_id);
    if (!form.nome || !form.email) { toast.error('Preencha nome e e-mail'); return; }
    if (!empresaId) { toast.error('Empresa do tenant não carregada.'); return; }
    setSaving(true);
    try {
      if (editando) {
        const { data: linhasAtualizadas, error } = await supabase.from('perfis')
          .update({
            nome:       form.nome,
            perfil:     form.perfil,
            setor_id:   form.setor_id || null,
            empresa_id: empresaId,
          })
          .eq('id', editando.id)
          .select('id');
        if (error) throw error;
        if (!linhasAtualizadas || linhasAtualizadas.length === 0) {
          throw new Error('Sem permissão para editar este usuário');
        }
        toast.success('Usuário atualizado!');
      } else {
        if (!form.senha) { toast.error('Senha obrigatória para novo usuário'); setSaving(false); return; }
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.senha,
          options: {
            emailRedirectTo: buildAuthRedirectUrl(),
            data: {
              nome: form.nome,
              perfil: form.perfil,
              setor_id: form.setor_id,
              empresa_id: empresaId,
              empresa_slug: empresas.find(e => e.id === empresaId)?.slug ?? empresaAtual?.slug,
            }
          }
        });
        if (error) throw error;
        toast.success('Usuário criado! Ele receberá um e-mail de confirmação.');
      }
      setDialogOpen(false);
      fetchDados();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar usuário');
    } finally {
      setSaving(false);
    }
  }

  async function confirmarMover() {
    if (!moverUsuario || !moverSetorId) return;
    setMoverSaving(true);
    try {
      const setorAnterior = (moverUsuario.setores as { nome?: string } | undefined)?.nome ?? '—';
      const setorNovo = setores.find(s => s.id === moverSetorId)?.nome ?? moverSetorId;

      const { data: linhasAtualizadas, error } = await supabase
        .from('perfis')
        .update({ setor_id: moverSetorId })
        .eq('id', moverUsuario.id)
        .select('id');

      if (error) throw error;

      if (!linhasAtualizadas || linhasAtualizadas.length === 0) {
        throw new Error('Sem permissão para mover este usuário. Verifique as políticas de acesso.');
      }

      toast.success(`${moverUsuario.nome} movido de "${setorAnterior}" → "${setorNovo}"`);
      setMoverDialog(false);
      setMoverUsuario(null);
      fetchDados();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao mover usuário');
    } finally {
      setMoverSaving(false);
    }
  }

  async function toggleAtivo(u: Perfil) {
    const { error } = await supabase.from('perfis').update({ ativo: !u.ativo }).eq('id', u.id);
    if (!error) { toast.success(u.ativo ? 'Usuário desativado' : 'Usuário ativado'); fetchDados(); }
    else toast.error('Erro ao alterar status');
  }

  const nomeSetor = (u: Perfil) => (u.setores as { nome?: string } | undefined)?.nome ?? '—';
  const nomeEmpresa = (u: Perfil) => (u.empresas as { nome?: string } | undefined)?.nome ?? '—';
  const usuariosFiltrados = isSuperAdmin && filtroEmpresa
    ? usuarios.filter(u => u.empresa_id === filtroEmpresa)
    : usuarios;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Usuários
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{usuariosFiltrados.length} usuário(s)</p>
        </div>
        <div className="flex gap-2">
          {isSuperAdmin && empresas.length > 1 && (
            <Select
              value={filtroEmpresa || TODAS_EMPRESAS_SELECT_VALUE}
              onValueChange={(value) => setFiltroEmpresa(value === TODAS_EMPRESAS_SELECT_VALUE ? '' : value)}
            >
              <SelectTrigger className="w-40 h-8 text-sm" aria-label="Filtrar por empresa"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_EMPRESAS_SELECT_VALUE}>Todas Empresas</SelectItem>
                {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {!isSuperAdmin && empresaAtual && (
            <Badge variant="outline" className="h-8 px-3 text-xs">{empresaAtual.nome}</Badge>
          )}
          {isSuperAdmin && filtroEmpresa && <Button variant="ghost" size="sm" className="h-8" aria-label="Limpar filtro de empresa" onClick={() => setFiltroEmpresa('')}>Limpar</Button>}
          <Button variant="outline" size="sm" onClick={fetchDados}><RefreshCw className="w-4 h-4" /></Button>
          {(isAdmin || isSuperAdmin) && <Button size="sm" onClick={abrirCriar}><Plus className="w-4 h-4 mr-2" /> Novo Usuário</Button>}
        </div>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">USUÁRIO</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">E-MAIL</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">PERFIL</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">SETOR</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">EMPRESA</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs">ATIVO</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs">AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">Carregando...</td></tr>
                ) : usuariosFiltrados.map((u, i) => (
                  <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className={cn('border-b border-border/50 hover:bg-accent/40 transition-colors', i % 2 === 0 && 'bg-muted/10')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            {u.nome.split(' ').map(n => n[0]).slice(0,2).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground">{u.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', PERFIL_BADGE[u.perfil])}>
                        <Shield className="w-3 h-3" /> {PERFIL_LABELS[u.perfil]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {nomeSetor(u)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {nomeEmpresa(u)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(isAdmin || isSuperAdmin)
                        ? <Switch checked={u.ativo} onCheckedChange={() => toggleAtivo(u)} />
                        : <span className={cn('inline-flex w-2 h-2 rounded-full', u.ativo ? 'bg-green-500' : 'bg-muted-foreground')} />
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost" size="icon" className="w-7 h-7"
                          title="Mover para outro setor"
                          onClick={() => abrirMover(u)}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </Button>
                        {(isAdmin || isSuperAdmin) && (
                          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => abrirEditar(u)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Dialog editar/criar usuário ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail *</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@empresa.com" className="h-9 text-sm font-mono" disabled={!!editando} />
            </div>
            {!editando && (
              <div className="space-y-1.5">
                <Label className="text-xs">Senha *</Label>
                <Input type="password" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} placeholder="••••••••" className="h-9 text-sm" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Perfil *</Label>
               <Select value={form.perfil} onValueChange={v => setForm(f => ({ ...f, perfil: v as PerfilUsuario }))}>
                 <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value="operador">Operador</SelectItem>
                   <SelectItem value="lider">Líder</SelectItem>
                   <SelectItem value="administrador">Administrador</SelectItem>
                   {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                 </SelectContent>
               </Select>
             </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Setor</Label>
              <Select value={form.setor_id} onValueChange={v => setForm(f => ({ ...f, setor_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um setor" /></SelectTrigger>
                <SelectContent>
                  {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
             <div className="space-y-1.5">
               <Label className="text-xs">Empresa</Label>
               {isSuperAdmin ? (
                 <Select value={form.empresa_id} onValueChange={v => setForm(f => ({ ...f, empresa_id: v }))}>
                   <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                   <SelectContent>
                     {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                   </SelectContent>
                 </Select>
               ) : (
                 <Input value={empresaAtual?.nome ?? 'Tenant atual'} readOnly className="h-9 text-sm bg-muted/40" />
               )}
             </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={salvar} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog mover usuário de setor ── */}
      <Dialog open={moverDialog} onOpenChange={v => { if (!v) { setMoverDialog(false); setMoverUsuario(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              Mover para outro setor
            </DialogTitle>
          </DialogHeader>
          {moverUsuario && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/30 rounded-lg border border-border">
                <div className="flex items-center gap-2.5">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {moverUsuario.nome.split(' ').map(n => n[0]).slice(0,2).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{moverUsuario.nome}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      Setor atual: <strong className="text-foreground ml-1">{nomeSetor(moverUsuario)}</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Novo setor *</Label>
                <Select value={moverSetorId} onValueChange={setMoverSetorId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecione o setor destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {setores.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className={cn(s.id === moverUsuario.setor_id && 'font-semibold text-primary')}>
                          {s.nome}{s.id === moverUsuario.setor_id ? ' (atual)' : ''}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {moverSetorId && moverSetorId !== moverUsuario.setor_id && (
                <div className="flex items-center gap-2 p-2.5 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary">
                  <ArrowRightLeft className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    <strong>{moverUsuario.nome}</strong> será movido para{' '}
                    <strong>{setores.find(s => s.id === moverSetorId)?.nome}</strong>.
                    As permissões do novo setor serão aplicadas imediatamente.
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setMoverDialog(false); setMoverUsuario(null); }}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={confirmarMover}
              disabled={moverSaving || !moverSetorId || moverSetorId === moverUsuario?.setor_id}
              className="gap-2"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              {moverSaving ? 'Movendo...' : 'Confirmar Movimentação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
