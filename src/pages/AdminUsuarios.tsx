import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Plus, Edit, Shield, RefreshCw, Save, Building2, ArrowRightLeft, Camera, X, Trash2, KeyRound, Users2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AdminEquipes from '@/pages/AdminEquipes';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { usePresence } from '@/hooks/usePresence';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { supabase, Perfil, PerfilUsuario, Setor, Empresa } from '@/lib/supabase';
import { buildAuthRedirectUrl } from '@/lib/tenant';
import { fetchEmpresas } from '@/services/empresas.service';
import { PERFIL_LABELS, TODAS_EMPRESAS_SELECT_VALUE, PERFIL_NIVEL, PERFIL_COLORS } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Cores dos cargos — centralizadas em PERFIL_COLORS (lib/index.ts)
const PERFIL_BADGE = PERFIL_COLORS;

interface UserForm {
  nome:       string;
  email:      string;
  usuario:    string;
  senha:      string;
  perfil:     PerfilUsuario;
  setor_id:   string;
  empresa_id: string;
}

export default function AdminUsuarios() {
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') ?? 'usuarios';
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
  const [form,        setForm]        = useState<UserForm>({ nome: '', email: '', usuario: '', senha: '', perfil: 'operador', setor_id: '', empresa_id: '' });

  // ── Mover usuário entre setores ─────────────────────────────────────────
  const [moverDialog, setMoverDialog]       = useState(false);
  const [moverUsuario, setMoverUsuario]     = useState<Perfil | null>(null);
  const [moverSetorId, setMoverSetorId]     = useState('');
  const [moverSaving, setMoverSaving]       = useState(false);
  // Online/Offline — lê do PresenceProvider (canal singleton global)
  const { onlineIds } = usePresence();
  // Foto expandida
  const [fotoExpandida,   setFotoExpandida]   = useState<{ url: string; nome: string } | null>(null);
  // Upload de foto pelo líder/admin para outro operador
  const [uploadTarget,    setUploadTarget]    = useState<Perfil | null>(null);
  const [uploadando,      setUploadando]      = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Alterar senha de operador
  const [senhaTarget,     setSenhaTarget]     = useState<Perfil | null>(null);
  const [novaSenha,       setNovaSenha]       = useState('');
  const [salvandoSenha,   setSalvandoSenha]   = useState(false);

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
        .select('*, setores(id,nome), empresas(id,nome), foto_url')
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
          .select('*, setores(id,nome), foto_url')
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
      usuario: '',
      senha: '',
      perfil: 'operador',
      setor_id: setores[0]?.id ?? '',
      empresa_id: empresaAtual?.id ?? '',
    });
    setDialogOpen(true);
  }

  function abrirEditar(u: Perfil) {
    setEditando(u);
    setForm({ nome: u.nome, email: u.email, usuario: u.usuario ?? '', senha: '', perfil: u.perfil, setor_id: u.setor_id ?? '', empresa_id: u.empresa_id ?? '' });
    setDialogOpen(true);
  }

  function abrirMover(u: Perfil) {
    setMoverUsuario(u);
    setMoverSetorId(u.setor_id ?? setores[0]?.id ?? '');
    setMoverDialog(true);
  }

  async function salvar() {
    const empresaId = isSuperAdmin ? form.empresa_id : (empresaAtual?.id ?? form.empresa_id);
    if (!form.nome || (!form.email && !form.usuario)) { toast.error('Preencha nome e e-mail ou nome de usuário'); return; }
    if (!empresaId) { toast.error('Não foi possível identificar a empresa. Recarregue a página.'); return; }
    setSaving(true);
    try {
      if (editando) {
        const updatePayload: Record<string, unknown> = {
          nome:       form.nome,
          perfil:     form.perfil,
          setor_id:   form.setor_id || null,
          empresa_id: empresaId,
        };
        if (form.usuario.trim()) {
          updatePayload.usuario = form.usuario.trim().toLowerCase();
        }
        const { data: linhasAtualizadas, error } = await supabase.from('perfis')
          .update(updatePayload)
          .eq('id', editando.id)
          .select('id');
        if (error) throw error;
        if (!linhasAtualizadas || linhasAtualizadas.length === 0) {
          throw new Error('Sem permissão para editar este usuário');
        }
        toast.success('Usuário atualizado!');
      } else {
        if (!form.senha) { toast.error('Senha obrigatória para novo usuário'); setSaving(false); return; }
        const authRedirectUrl = buildAuthRedirectUrl();
        // Use real email if provided, otherwise generate synthetic one from username
        const resolvedEmail = form.email.trim().toLowerCase().includes('@')
          ? form.email.trim().toLowerCase()
          : `${(form.usuario.trim() || form.email.trim()).toLowerCase()}@interno.sistema`;
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: resolvedEmail,
          password: form.senha,
          options: {
            ...(authRedirectUrl ? { emailRedirectTo: authRedirectUrl } : {}),
            data: {
              nome: form.nome.trim(),
              perfil: form.perfil,
              usuario: form.usuario.trim() ? form.usuario.trim().toLowerCase() : null,
              setor_id: form.setor_id || null,
              empresa_id: empresaId,
              empresa_slug: empresas.find(e => e.id === empresaId)?.slug ?? empresaAtual?.slug,
            }
          }
        });
        if (error) {
          if (error.message.toLowerCase().includes('database error')) {
            throw new Error('Erro interno ao criar conta. Tente novamente em alguns instantes ou entre em contato com o suporte.');
          }
          throw error;
        }
        // FIX: Se o Supabase criou uma sessão automática (email confirmation desabilitado),
        // fazer signOut imediatamente para não substituir a sessão do admin logado.
        if (signUpData?.session) {
          await supabase.auth.signOut();
          toast.success('Usuário criado com sucesso!');
          setDialogOpen(false);
          fetchDados();
          return;
        }
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

  async function fazerUploadFotoParaUsuario(targetId: string, file: File) {
    setUploadando(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `avatars/${targetId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('perfis').upload(path, file, { upsert: true });
      if (upErr) { toast.error(`Erro no upload: ${upErr.message}`); return; }
      const { data: { publicUrl } } = supabase.storage.from('perfis').getPublicUrl(path);
      const urlFinal = `${publicUrl}?t=${Date.now()}`;
      const { error: dbErr } = await supabase.from('perfis').update({ foto_url: urlFinal } as any).eq('id', targetId);
      if (dbErr) { toast.error(`Erro ao salvar foto: ${dbErr.message}`); return; }
      toast.success('Foto atualizada com sucesso!');
      setUploadTarget(null);
      fetchDados();
    } finally { setUploadando(false); }
  }

  async function excluirFotoDeUsuario(u: Perfil) {
    if (!u.foto_url) return;
    // Tentar remover do storage (path convencional)
    const urlPath = u.foto_url.split('/object/public/perfis/')[1]?.split('?')[0];
    if (urlPath) {
      await supabase.storage.from('perfis').remove([urlPath]);
    }
    const { error } = await supabase.from('perfis').update({ foto_url: null } as any).eq('id', u.id);
    if (error) { toast.error(`Erro ao excluir foto: ${error.message}`); return; }
    toast.success('Foto removida com sucesso!');
    fetchDados();
  }

  async function alterarSenhaOperador() {
    if (!senhaTarget || !novaSenha.trim()) { toast.error('Preencha a nova senha'); return; }
    if (novaSenha.length < 6) { toast.error('A senha deve ter pelo menos 6 caracteres'); return; }
    setSalvandoSenha(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-change-password', {
        body: { p_user_id: senhaTarget.id, p_new_password: novaSenha.trim() },
      });
      if (error || data?.error) { toast.error(`Erro: ${error?.message ?? data?.error}`); return; }
      toast.success(`Senha de ${senhaTarget.nome} alterada com sucesso!`);
      setSenhaTarget(null);
      setNovaSenha('');
    } finally { setSalvandoSenha(false); }
  }

  async function toggleAtivo(u: Perfil) {
    const { error } = await supabase.from('perfis').update({ ativo: !u.ativo }).eq('id', u.id);
    if (!error) { toast.success(u.ativo ? 'Usuário desativado' : 'Usuário ativado'); fetchDados(); }
    else toast.error('Erro ao alterar status');
  }

  const nomeSetor = (u: Perfil) => (u.setores as { nome?: string } | undefined)?.nome ?? '—';
  const nomeEmpresa = (u: Perfil) => (u.empresas as { nome?: string } | undefined)?.nome ?? '—';

  // ── Filtro de acesso por cargo ──────────────────────────────────────────────
  // Abaixo de Gerência (operador, líder, elite): vê apenas usuários do próprio setor
  // Gerência/Diretoria: vê todos da empresa, mas apenas com cargo igual ou superior
  // Admin/SuperAdmin: vê todos sem restrição
  const nivelAtual = PERFIL_NIVEL[perfilAtual?.perfil ?? ''] ?? 0;

  const aplicarFiltroAcesso = (lista: Perfil[]): Perfil[] => {
    if (isSuperAdmin || isAdmin) return lista;
    const p = perfilAtual?.perfil ?? '';
    if (['operador', 'lider', 'elite'].includes(p)) {
      return lista.filter(u => u.setor_id === perfilAtual?.setor_id);
    }
    if (['gerencia', 'diretoria'].includes(p)) {
      return lista.filter(u => (PERFIL_NIVEL[u.perfil] ?? 0) >= nivelAtual);
    }
    return lista;
  };

  const usuariosFiltrados = aplicarFiltroAcesso(
    isSuperAdmin && filtroEmpresa
      ? usuarios.filter(u => u.empresa_id === filtroEmpresa)
      : usuarios
  );

  // ── Agrupamento por setor ────────────────────────────────────────────────────
  const usuariosPorSetor = usuariosFiltrados.reduce<Record<string, { nomeSetor: string; lista: Perfil[] }>>((acc, u) => {
    const sid = u.setor_id ?? '__sem_setor__';
    const snome = nomeSetor(u);
    if (!acc[sid]) acc[sid] = { nomeSetor: snome, lista: [] };
    acc[sid].lista.push(u);
    return acc;
  }, {});

  const setoresOrdenados = Object.entries(usuariosPorSetor).sort(([, a], [, b]) =>
    a.nomeSetor.localeCompare(b.nomeSetor)
  );

  return (
    <div className="h-full flex flex-col">
      {/* Cabeçalho */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Usuários
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gestão de usuários e equipes</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={tabFromUrl} className="flex-1 flex flex-col">
        <div className="px-6 border-b border-border">
          <TabsList className="h-10 bg-transparent p-0 gap-0">
            <TabsTrigger
              value="usuarios"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
            >
              <Users className="w-4 h-4" /> Usuários
            </TabsTrigger>
            <TabsTrigger
              value="equipes"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
            >
              <Users2 className="w-4 h-4" /> Equipes
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Aba: Usuários ─────────────────────────────────────────── */}
        <TabsContent value="usuarios" className="flex-1 overflow-y-auto p-6 mt-0">
        <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-end mb-4 gap-2">
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

      {/* ── Tabela agrupada por setor ── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Carregando...</div>
      ) : setoresOrdenados.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Nenhum usuário encontrado.</div>
      ) : (
        <div className="space-y-4">
          {setoresOrdenados.map(([sid, grupo]) => (
            <div key={sid}>
              {/* Cabeçalho do setor */}
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <Building2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  {grupo.nomeSetor === '—' ? 'Sem Setor' : grupo.nomeSetor}
                </span>
                <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0">
                  {grupo.lista.length} {grupo.lista.length === 1 ? 'usuário' : 'usuários'}
                </span>
              </div>
              <Card className="border-border">
                <CardContent className="p-0">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-sm table-fixed min-w-[700px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs w-[26%]">USUÁRIO</th>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs w-[22%]">E-MAIL</th>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs w-[14%]">CARGO</th>
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs w-[13%]">EMPRESA</th>
                          <th className="text-center px-3 py-2 font-semibold text-muted-foreground text-xs w-[9%]">ATIVO</th>
                          <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs w-[16%]">AÇÕES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.lista.map((u, i) => (
                          <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                            className={cn('border-b border-border/50 hover:bg-accent/40 transition-colors', i % 2 === 0 && 'bg-muted/10')}>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="relative flex-shrink-0">
                                  <button
                                    type="button"
                                    className="relative"
                                    onClick={() => { if (u.foto_url) setFotoExpandida({ url: u.foto_url, nome: u.nome }); }}
                                    title={u.foto_url ? 'Ver foto em tamanho maior' : undefined}
                                  >
                                    <Avatar className="w-8 h-8">
                                      {u.foto_url && <AvatarImage src={u.foto_url} alt={u.nome} />}
                                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                        {u.nome.split(' ').map((n: string) => n[0]).slice(0,2).join('')}
                                      </AvatarFallback>
                                    </Avatar>
                                  </button>
                                  <span className={cn(
                                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background',
                                    onlineIds.has(u.id) ? 'bg-success' : 'bg-muted-foreground/40'
                                  )} title={onlineIds.has(u.id) ? 'Online' : 'Offline'} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1">
                                    <p className="font-medium text-foreground text-xs truncate">{u.nome}</p>
                                    {u.id === perfilAtual?.id && (
                                      <span className="text-[9px] bg-primary/15 text-primary border border-primary/30 rounded px-1 py-0 font-bold">Você</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {u.usuario && <p className="text-[10px] text-muted-foreground font-mono truncate">{u.usuario}</p>}
                                    <span className={cn('text-[9px] font-medium', onlineIds.has(u.id) ? 'text-success' : 'text-muted-foreground/50')}>
                                      {onlineIds.has(u.id) ? '● Online' : '○ Offline'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono truncate max-w-0">
                              <span className="block truncate" title={u.email}>{u.email}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium border', PERFIL_BADGE[u.perfil] ?? 'bg-muted/10 text-muted-foreground border-border')}>
                                <Shield className="w-2.5 h-2.5" /> {PERFIL_LABELS[u.perfil] ?? u.perfil}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1 truncate">
                                <Building2 className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{nomeEmpresa(u)}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {(isAdmin || isSuperAdmin)
                                ? <Switch checked={u.ativo} onCheckedChange={() => toggleAtivo(u)} />
                                : <span className={cn('inline-flex w-2 h-2 rounded-full', u.ativo ? 'bg-green-500' : 'bg-muted-foreground')} />
                              }
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                {(isAdmin || isSuperAdmin || perfilAtual?.perfil === 'lider') && u.id !== perfilAtual?.id && (
                                  <>
                                    <Button variant="ghost" size="icon" className="w-7 h-7"
                                      title="Alterar foto de perfil"
                                      onClick={() => { setUploadTarget(u); fileInputRef.current?.click(); }}>
                                      <Camera className="w-3.5 h-3.5" />
                                    </Button>
                                    {u.foto_url && (
                                      <Button variant="ghost" size="icon"
                                        className="w-7 h-7 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                                        title="Remover foto de perfil" onClick={() => excluirFotoDeUsuario(u)}>
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                    <Button variant="ghost" size="icon" className="w-7 h-7"
                                      title="Alterar senha do usuário"
                                      onClick={() => { setSenhaTarget(u); setNovaSenha(''); }}>
                                      <KeyRound className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                )}
                                <Button variant="ghost" size="icon" className="w-7 h-7"
                                  title="Mover para outro setor" onClick={() => abrirMover(u)}>
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
            </div>
          ))}
        </div>
      )}
        </div>
        </TabsContent>

        {/* ─── Aba: Equipes ──────────────────────────────────────────── */}
        <TabsContent value="equipes" className="flex-1 overflow-y-auto mt-0">
          <AdminEquipes />
        </TabsContent>

      </Tabs>

      {/* ── Dialog editar/criar usuário ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" aria-describedby="modal-usuario-desc">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            <DialogDescription id="modal-usuario-desc" className="sr-only">
              {editando ? 'Editar dados do usuário' : 'Criar novo usuário'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Login (usuário)</Label>
              <Input value={form.usuario} onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))} placeholder="kauan_teixeira" className="h-9 text-sm font-mono" />
              <p className="text-xs text-muted-foreground">Usado para login sem e-mail. Opcional se usar e-mail.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail {!editando && <span className="text-muted-foreground font-normal">(opcional se definir usuário)</span>}</Label>
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
                   <SelectItem value="elite">Elite</SelectItem>
                   <SelectItem value="gerencia">Gerência</SelectItem>
                   <SelectItem value="diretoria">Diretoria</SelectItem>
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
        <DialogContent className="max-w-md" aria-describedby="modal-mover-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              Mover para outro setor
            </DialogTitle>
            <DialogDescription id="modal-mover-desc" className="sr-only">
              Selecionar novo setor para o usuário
            </DialogDescription>
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

      {/* Input file oculto para upload de foto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || !uploadTarget) return;
          await fazerUploadFotoParaUsuario(uploadTarget.id, file);
          e.target.value = '';
        }}
      />

      {/* Modal alterar senha de operador */}
      <Dialog open={!!senhaTarget} onOpenChange={v => !v && setSenhaTarget(null)}>
        <DialogContent className="max-w-sm" aria-describedby="modal-senha-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound className="w-4 h-4 text-primary" />
              Alterar Senha
            </DialogTitle>
            <DialogDescription id="modal-senha-desc" className="sr-only">
              Definir nova senha para o usuário selecionado
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              Definir nova senha para <span className="font-semibold text-foreground">{senhaTarget?.nome}</span>
            </p>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Nova senha *</Label>
              <Input
                type="password"
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="h-9 text-sm"
                onKeyDown={e => e.key === 'Enter' && alterarSenhaOperador()}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              O usuário precisará usar esta senha no próximo login.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setSenhaTarget(null)} disabled={salvandoSenha}>
              Cancelar
            </Button>
            <Button size="sm" onClick={alterarSenhaOperador} disabled={salvandoSenha || novaSenha.length < 6} className="gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              {salvandoSenha ? 'Salvando...' : 'Salvar senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal foto expandida */}
      {fotoExpandida && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setFotoExpandida(null)}
        >
          <div className="relative max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <img
              src={fotoExpandida.url}
              alt={fotoExpandida.nome}
              className="w-full rounded-2xl shadow-2xl object-cover"
            />
            <p className="text-white text-center mt-3 font-medium text-sm">{fotoExpandida.nome}</p>
            <button
              onClick={() => setFotoExpandida(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shadow-lg hover:bg-accent"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}