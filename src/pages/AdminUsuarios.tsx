import { useEffect, useState, useRef, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Plus, Edit, Shield, RefreshCw, Save, Building2, ArrowRightLeft, Camera, X, Trash2, KeyRound, Users2, LogIn, Loader2, Target, PartyPopper, AlertTriangle } from 'lucide-react';
import {
  resumoExclusao, excluirUsuarioComAcordos,
  type ResumoExclusao,
} from '@/services/admin/exclusaoUsuario.service';
import {
  executarTransferencia, type AlvoTransferencia,
} from '@/services/admin/transferenciaUsuario.service';
import { DialogoTransferencia } from '@/components/admin/DialogoTransferencia';
import { HistoricoTransferencias } from '@/components/admin/HistoricoTransferencias';
import { iniciarImpersonacao } from '@/services/impersonacao.service';
import { redefinirSenhaDeUsuario, MIN_SENHA } from '@/services/senha.service';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AdminEquipes from '@/pages/AdminEquipes';
import AdminSetoresAba from '@/pages/AdminSetoresAba';
import MetasConfig from '@/pages/MetasConfig';
import { podeCriarComemoracao } from '@/pages/Comemoracoes/permissoes';
import { useTenant } from '@/lib/tenant-config';
import { aplicarOrdemSetores } from '@/lib/setores-ordem';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { usePresence } from '@/hooks/usePresence';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { supabase, createIsolatedAuthClient, Perfil, PerfilUsuario, Setor, Empresa, SituacaoUsuario } from '@/lib/supabase';
import { definirSituacao, arquivarDesligadosAnteriores } from '@/services/situacaoUsuario.service';
import { buildAuthRedirectUrl } from '@/lib/tenant';
import { fetchEmpresas } from '@/services/empresas.service';
import { PERFIL_LABELS, TODAS_EMPRESAS_SELECT_VALUE, PERFIL_COLORS } from '@/lib/index';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ModalRecortarFoto } from '@/components/ModalRecortarFoto';

// Lazy: a aba Comemorações arrasta o editor de layout, o catálogo de sons e a
// biblioteca de mídia. Enquanto era rota própria, só baixava para quem a abria;
// o carregamento sob demanda mantém esse comportamento agora que virou aba.
const Comemoracoes = lazy(() => import('@/pages/Comemoracoes'));

// Cores dos cargos — centralizadas em PERFIL_COLORS (lib/index.ts)
const PERFIL_BADGE = PERFIL_COLORS;

// Item 5: situação operacional — cor da bolinha e rótulo.
const SITU_DOT: Record<SituacaoUsuario, string> = {
  ativo:     'bg-green-500',
  ferias:    'bg-amber-500',
  desligado: 'bg-red-500',
};
const SITU_LABEL: Record<SituacaoUsuario, string> = {
  ativo:     'Ativo',
  ferias:    'Férias',
  desligado: 'Desligado',
};

interface UserForm {
  nome:       string;
  email:      string;
  usuario:    string;
  senha:      string;
  perfil:     PerfilUsuario;
  setor_id:   string;
  empresa_id: string;
}

/** Perfil exibido na lista; `_cloneDe` marca um clone de OUTRO setor (tag). */
type PerfilComClone = Perfil & { _cloneDe?: string | null };

export default function AdminUsuarios() {
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') ?? 'usuarios';
  const { perfil: perfilAtual } = useAuth();
  const { empresa: empresaAtual } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const tenant = useTenant();
  // Item 6: a aba Metas passa a viver dentro de Usuários (BookPlay e PaguePlay).
  // `tenant` é usado em outras partes; mantém a referência p/ clareza.
  const metasComoAba = tenant.slug === 'bookplay' || tenant.isPaguePlay;
  // Comemorações também virou aba daqui (nos dois tenants). O gate é o mesmo da
  // criação — quem só assiste não precisa da aba, a comemoração chega pelo
  // overlay em qualquer página.
  const podeVerComemoracoes = podeCriarComemoracao(perfilAtual?.perfil);
  const isAdmin = perfilAtual?.perfil === 'administrador';
  const isSuperAdmin = perfilAtual?.perfil === 'super_admin';
  // Item 5: líder+ pode definir a situação (ativo/férias/desligado). A RLS ainda
  // limita o líder ao próprio setor; admin/super atingem qualquer usuário.
  const podeGerenciarSituacao = isAdmin || isSuperAdmin
    || ['lider', 'elite', 'gerencia', 'diretoria'].includes(perfilAtual?.perfil ?? '');
  // Gate para a aba Setores: visível apenas para Gerência ou superior
  // (gerencia, diretoria, administrador, super_admin).
  const podeVerSetores =
    !!perfilAtual?.perfil &&
    ['gerencia', 'diretoria', 'administrador', 'super_admin'].includes(perfilAtual.perfil);
  const [usuarios,    setUsuarios]    = useState<Perfil[]>([]);
  const [setores,     setSetores]     = useState<Setor[]>([]);
  const [empresas,    setEmpresas]    = useState<Empresa[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editando,    setEditando]    = useState<Perfil | null>(null);
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('');
  const [saving,      setSaving]      = useState(false);
  const [form,        setForm]        = useState<UserForm>({ nome: '', email: '', usuario: '', senha: '', perfil: 'operador', setor_id: '', empresa_id: '' });

  // Online/Offline — lê do PresenceProvider (canal singleton global)
  const { onlineIds } = usePresence();
  // Foto expandida
  const [fotoExpandida,   setFotoExpandida]   = useState<{ url: string; nome: string } | null>(null);
  // Upload de foto pelo líder/admin para outro operador
  const [uploadTarget,    setUploadTarget]    = useState<Perfil | null>(null);
  const [uploadando,      setUploadando]      = useState(false);
  // Foto escolhida no input aguardando recorte no modal
  const [fotoParaRecorte, setFotoParaRecorte] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Alterar senha de operador (agora integrado ao modal unificado;
  // `senhaTarget` é mantido como compat para chamadas externas/testes —
  // o fluxo principal usa `editando` + `novaSenha`).
  const [senhaTarget,     setSenhaTarget]     = useState<Perfil | null>(null);
  const [novaSenha,       setNovaSenha]       = useState('');
  // Transferência: mudar Setor/Empresa passa por confirmação própria, porque as
  // consequências (apagar tabulação, liberar NR, tirar de equipe) não cabem no
  // botão "Salvar" junto com trocar o nome.
  const [alvoTransferencia, setAlvoTransferencia] = useState<AlvoTransferencia | null>(null);
  const [salvandoSenha,   setSalvandoSenha]   = useState(false);
  const [impersonando,    setImpersonando]    = useState<string | null>(null);

  // Entrar como (impersonação) — só super_admin. Recarrega ao assumir a sessão.
  async function entrarComo(u: Perfil) {
    if (!perfilAtual?.id || u.id === perfilAtual.id) return;
    setImpersonando(u.id);
    try {
      await iniciarImpersonacao(u.id, perfilAtual.id, perfilAtual.nome ?? 'super_admin');
      // iniciarImpersonacao recarrega a página em caso de sucesso.
    } catch (e) {
      setImpersonando(null);
      toast.error(e instanceof Error ? e.message : 'Falha ao entrar como usuário.');
    }
  }

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
    // Item 5: arquiva desligados de meses anteriores antes de listar (some da lista).
    const empAlvo = (!isSuperAdmin ? empresaAtual?.id : filtroEmpresa) ?? empresaAtual?.id;
    if (empAlvo) { try { await arquivarDesligadosAnteriores(empAlvo); } catch { /* best-effort */ } }
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
    // Arquivados somem da lista padrão (item 5).
    setUsuarios(usuariosData.filter(u => !u.arquivado));
    setSetores(setoresData);
    setEmpresas(emps);
    if (setoresData.length > 0 && !form.setor_id) {
      setForm(f => ({
        ...f,
        setor_id: setoresData.find(s => s.empresa_id === (f.empresa_id || empresaAtual?.id))?.id ?? setoresData[0].id,
      }));
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchDados é recriada a cada render; incluí-la causaria refetch em loop.
  useEffect(() => { fetchDados(); }, [empresaAtual?.id, filtroEmpresa, isSuperAdmin]);

  function abrirCriar() {
    setEditando(null);
    setForm({
      nome: '',
      email: '',
      usuario: '',
      senha: '',
      perfil: 'operador',
      setor_id: setores.find(s => s.empresa_id === (empresaAtual?.id ?? ''))?.id ?? '',
      empresa_id: empresaAtual?.id ?? '',
    });
    setDialogOpen(true);
  }

  function abrirEditar(u: Perfil) {
    setEditando(u);
    setForm({ nome: u.nome, email: u.email, usuario: u.usuario ?? '', senha: '', perfil: u.perfil, setor_id: u.setor_id ?? '', empresa_id: u.empresa_id ?? '' });
    setNovaSenha('');
    setDialogOpen(true);
  }

  // (Mover usuário entre setores agora é feito dentro do modal unificado,
  // ajustando o campo "Setor" e clicando em Salvar. Os handlers dedicados
  // foram removidos em 2026-04-22 junto com o dialog separado.)

  /**
   * Grava os campos que não são vínculo: nome, cargo, login.
   *
   * Setor e empresa NÃO entram aqui de propósito. Mudá-los é uma transferência,
   * e transferência apaga tabulação, libera NR e tira a pessoa de equipe — não
   * pode viajar de carona no mesmo `update` que corrige um nome mal digitado.
   */
  async function salvarCamposBasicos(alvoId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload parcial e heterogêneo p/ update(); tipar exigiria o shape completo de Perfil.
    const updatePayload: Record<string, any> = {
      nome:   form.nome,
      perfil: form.perfil,
    };
    if (form.usuario.trim()) {
      updatePayload.usuario = form.usuario.trim().toLowerCase();
    }
    const { data: linhasAtualizadas, error } = await supabase.from('perfis')
      .update(updatePayload)
      .eq('id', alvoId)
      .select('id');
    if (error) throw error;
    if (!linhasAtualizadas || linhasAtualizadas.length === 0) {
      throw new Error('Sem permissão para editar este usuário');
    }
  }

  async function salvar() {
    const empresaId = isSuperAdmin ? form.empresa_id : (empresaAtual?.id ?? form.empresa_id);
    if (!form.nome || (!form.email && !form.usuario)) { toast.error('Preencha nome e e-mail ou nome de usuário'); return; }
    if (!empresaId) { toast.error('Não foi possível identificar a empresa. Recarregue a página.'); return; }

    // Mudou de setor ou de empresa? Isso é transferência: passa pela confirmação
    // que mostra o que será movido e deixa escolher o destino das tabulações.
    if (editando) {
      const trocouSetor   = (editando.setor_id ?? '') !== (form.setor_id ?? '');
      const trocouEmpresa = !!editando.empresa_id && editando.empresa_id !== empresaId;
      if (trocouSetor || trocouEmpresa) {
        setAlvoTransferencia({
          perfilId:         editando.id,
          nome:             form.nome || editando.nome || 'usuario',
          usuario:          (form.usuario.trim() || editando.usuario || '').toLowerCase() || null,
          origemEmpresaId:  editando.empresa_id ?? empresaId,
          origemSetorId:    editando.setor_id ?? null,
          origemEquipeId:   editando.equipe_id ?? null,
          destinoEmpresaId: empresaId,
          destinoSetorId:   form.setor_id || null,
        });
        return;
      }
    }

    setSaving(true);
    try {
      if (editando) {
        await salvarCamposBasicos(editando.id);
        toast.success('Usuário atualizado!');
      } else {
        if (!form.senha) { toast.error('Senha obrigatória para novo usuário'); setSaving(false); return; }
        const authRedirectUrl = buildAuthRedirectUrl();
        // Use real email if provided, otherwise generate synthetic one from username
        const resolvedEmail = form.email.trim().toLowerCase().includes('@')
          ? form.email.trim().toLowerCase()
          : `${(form.usuario.trim() || form.email.trim()).toLowerCase()}@interno.sistema`;
        // Usa um client isolado (sem persistência de sessão): mesmo que o
        // Supabase crie sessão automática ao cadastrar, ela fica nesse client
        // descartável e NÃO substitui/derruba a sessão do admin logado.
        const signupClient = createIsolatedAuthClient();
        const { data: signUpData, error } = await signupClient.auth.signUp({
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
        // Descarta a sessão em memória do client isolado (defensivo).
        await signupClient.auth.signOut().catch(() => {});
        if (error) {
          if (error.message.toLowerCase().includes('database error')) {
            throw new Error('Erro interno ao criar conta. Tente novamente em alguns instantes ou entre em contato com o suporte.');
          }
          throw error;
        }
        toast.success(signUpData?.session
          ? 'Usuário criado com sucesso!'
          : 'Usuário criado! Ele receberá um e-mail de confirmação.');
      }
      setDialogOpen(false);
      fetchDados();
    } catch (e) {
      // PostgrestError não é instanceof Error — sem este fallback o toast
      // engolia a mensagem real do banco (ex.: violação de CHECK/RLS).
      const msg = e instanceof Error
        ? e.message
        : ((e as { message?: string })?.message ?? 'Erro ao salvar usuário');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  /** Nome do setor para o diálogo — "sem setor" quando não há. */
  function nomeDoSetor(id: string | null): string {
    if (!id) return 'sem setor';
    return setores.find(s => s.id === id)?.nome ?? 'setor desconhecido';
  }

  function nomeDaEmpresa(id: string | null): string {
    if (!id) return 'empresa';
    return empresas.find(e => e.id === id)?.nome ?? empresaAtual?.nome ?? 'empresa';
  }

  /**
   * A transferência confirmada no diálogo.
   *
   * Ordem: campos básicos primeiro, vínculo depois. Se o nome falhar (RLS), a
   * transferência não acontece — o inverso deixaria a pessoa transferida com o
   * cadastro pela metade, e transferir é a parte cara de desfazer.
   */
  async function confirmarTransferencia(levarAcordos: boolean) {
    if (!alvoTransferencia || !editando) return;
    setSaving(true);
    try {
      await salvarCamposBasicos(editando.id);

      const r = await executarTransferencia({
        alvo: alvoTransferencia,
        levarAcordos,
        executadoPorId: perfilAtual?.id ?? null,
      });

      if (r.status === 'falha') { toast.error(r.mensagem); return; }

      const partes: string[] = ['Usuário transferido.'];
      if (r.acordosApagados > 0) {
        partes.push(
          `${r.acordosApagados.toLocaleString('pt-BR')} tabulaç${r.acordosApagados === 1 ? 'ão' : 'ões'} `
          + `apagada${r.acordosApagados === 1 ? '' : 's'}`
          + `${r.relatorio ? ` — relatório salvo em ${r.relatorio}` : ''}.`,
        );
      }
      if (r.acordosMovidos > 0) {
        partes.push(`${r.acordosMovidos.toLocaleString('pt-BR')} tabulações foram junto.`);
      }
      if (r.clonesRemovidos > 0) {
        partes.push(`Removido de ${r.clonesRemovidos} equipe(s) em que era clone.`);
      }
      toast.success(partes.join(' '), { duration: 8000 });

      // Sem registro não há desfazer NEM fantasma. O admin precisa saber agora,
      // não no dia em que tentar desfazer.
      if (r.avisoRegistro) toast.warning(r.avisoRegistro, { duration: 12000 });

      setAlvoTransferencia(null);
      setDialogOpen(false);
      fetchDados();
    } catch (e) {
      const msg = e instanceof Error
        ? e.message
        : ((e as { message?: string })?.message ?? 'Erro ao transferir usuário');
      toast.error(msg);
    } finally {
      setSaving(false);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foto_url ainda não está no tipo gerado de Perfil.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foto_url ainda não está no tipo gerado de Perfil.
    const { error } = await supabase.from('perfis').update({ foto_url: null } as any).eq('id', u.id);
    if (error) { toast.error(`Erro ao excluir foto: ${error.message}`); return; }
    toast.success('Foto removida com sucesso!');
    fetchDados();
  }

  async function alterarSenhaOperador() {
    const alvo = senhaTarget ?? editando;
    if (!alvo || !novaSenha.trim()) { toast.error('Preencha a nova senha'); return; }
    if (novaSenha.length < MIN_SENHA) { toast.error(`A senha deve ter pelo menos ${MIN_SENHA} caracteres`); return; }
    setSalvandoSenha(true);
    try {
      await redefinirSenhaDeUsuario(alvo.id, novaSenha.trim());
      toast.success(`Senha de ${alvo.nome} redefinida! Avise a senha a ela — o sistema vai pedir que troque por uma própria.`);
      setSenhaTarget(null);
      setNovaSenha('');
      fetchDados();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao redefinir a senha.');
    } finally { setSalvandoSenha(false); }
  }

  // Item 5: define a situação (ativo/férias/desligado) com efeitos colaterais.
  async function handleSituacao(u: Perfil, sit: SituacaoUsuario) {
    if ((u.situacao ?? 'ativo') === sit) return;
    const { error } = await definirSituacao(u.id, sit, {
      empresaId:   empresaAtual?.id ?? null,
      isPaguePlay: tenant.isPaguePlay,
    });
    if (error) { toast.error('Erro ao alterar situação'); return; }
    toast.success(
      sit === 'ativo' ? 'Usuário marcado como ativo'
      : sit === 'ferias' ? 'Usuário marcado como férias (sai de ranking e quartil)'
      : 'Usuário desligado (sem acesso; acordos liberados para retabulação)',
    );
    fetchDados();
  }

  // #6: excluir usuário direto do modal Editar.
  // Estratégia: deletar o registro em `perfis` (cascata no banco remove vínculos).
  // Obs.: o auth.user correspondente só pode ser deletado por uma Edge Function com
  // service-role key — se ela existir (admin-delete-user), chamamos; caso contrário
  // removemos só o perfil (o auth.user fica órfão mas sem acesso, pois RLS exige perfil).
  const [excluindoUsuario, setExcluindoUsuario] = useState(false);
  const [confirmExclusaoUser, setConfirmExclusaoUser] = useState(false);

  // Quanto o usuário segura, lido ao abrir a confirmação: a caixa mostra o
  // número em vez de um "tem certeza?" que não diz o que vai embora.
  const [resumoDaExclusao, setResumoDaExclusao] = useState<ResumoExclusao | null>(null);

  async function abrirConfirmacaoExclusao() {
    if (!editando) return;
    setConfirmExclusaoUser(true);
    setResumoDaExclusao(null);
    setResumoDaExclusao(await resumoExclusao(editando.id));
  }

  async function excluirUsuarioEditado() {
    if (!editando) return;
    if (editando.id === perfilAtual?.id) {
      toast.error('Você não pode excluir a si mesmo.');
      return;
    }
    setExcluindoUsuario(true);
    try {
      // As tabulações do usuário vão junto — regra de 05/08/2026 — e o
      // relatório é baixado ANTES de qualquer DELETE. O fallback antigo
      // (`perfis.delete()`) saiu: ele batia na MESMA FK que a RPC, então só
      // produzia um segundo 409 no console e uma mensagem crua na tela.
      const r = await excluirUsuarioComAcordos({
        userId: editando.id,
        nome:   editando.nome ?? 'usuario',
      });

      if (r.status === 'falha') { toast.error(r.mensagem); return; }

      toast.success(
        r.acordosApagados > 0
          ? `Usuário ${editando.nome} excluído. ${r.acordosApagados.toLocaleString('pt-BR')} `
            + `tabulaç${r.acordosApagados === 1 ? 'ão' : 'ões'} apagada${r.acordosApagados === 1 ? '' : 's'}`
            + `${r.relatorio ? ` — relatório salvo em ${r.relatorio}` : ''}. Os NRs voltaram a ficar livres.`
          : `Usuário ${editando.nome} excluído com sucesso!`,
      );
      setConfirmExclusaoUser(false);
      setDialogOpen(false);
      fetchDados();
    } catch (e) {
      // Sem este catch, um throw sai como rejeição não tratada e a tela fica
      // muda — o admin clica de novo e só rebaixa a planilha.
      toast.error(`Erro ao excluir usuário: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExcluindoUsuario(false);
    }
  }

  // Setores disponíveis no formulário: só os da empresa selecionada (evita
  // vincular um usuário a um setor de outra empresa). Super Admin pode trocar
  // a empresa e a lista de setores acompanha.
  const setoresDoForm = useMemo(
    () => (form.empresa_id ? setores.filter(s => s.empresa_id === form.empresa_id) : setores),
    [setores, form.empresa_id],
  );

  const nomeSetor = (u: Perfil) => (u.setores as { nome?: string } | undefined)?.nome ?? '—';
  const nomeEmpresa = (u: Perfil) => (u.empresas as { nome?: string } | undefined)?.nome ?? '—';

  // ── Clones cross-setor (BookPlay) ───────────────────────────────────────────
  // Operador clonado numa equipe de OUTRO setor aparece TAMBÉM no setor destino,
  // com tag "clone de <setor de origem>" — igual à aba Setores (item 12).
  const [clonesCross, setClonesCross] = useState<{ operadorId: string; destinoSetorId: string }[]>([]);
  useEffect(() => {
    if (!empresaAtual?.id || tenant.slug !== 'bookplay') { setClonesCross([]); return; }
    let cancel = false;
    void (async () => {
      const [clones, equipesData] = await Promise.all([
        supabase.from('equipe_operadores_clones').select('operador_id, equipe_id').eq('empresa_id', empresaAtual.id),
        supabase.from('equipes').select('id, setor_id').eq('empresa_id', empresaAtual.id),
      ]);
      if (cancel) return;
      const setorDaEquipe = new Map<string, string | null>();
      for (const e of (equipesData.data as { id: string; setor_id: string | null }[]) ?? []) {
        setorDaEquipe.set(e.id, e.setor_id ?? null);
      }
      const out: { operadorId: string; destinoSetorId: string }[] = [];
      const seen = new Set<string>();
      for (const c of (clones.data as { operador_id: string; equipe_id: string }[]) ?? []) {
        const destino = setorDaEquipe.get(c.equipe_id);
        if (!destino) continue;
        const key = `${c.operador_id}::${destino}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ operadorId: c.operador_id, destinoSetorId: destino });
      }
      setClonesCross(out);
    })();
    return () => { cancel = true; };
  }, [empresaAtual?.id, tenant.slug]);

  // ── Filtro de acesso por cargo ──────────────────────────────────────────────
  // Regras:
  //   • Admin / Super Admin → vê todos sem restrição
  //   • Qualquer cargo abaixo de Admin → NUNCA vê administradores ou super_admins
  //   • Operador / Líder / Elite → vê apenas usuários do próprio setor
  //   • Gerência / Diretoria → vê todos da empresa, exceto admins
  const PERFIS_ADMIN = ['administrador', 'super_admin'];

  const aplicarFiltroAcesso = (lista: Perfil[]): Perfil[] => {
    if (isSuperAdmin || isAdmin) return lista;
    // Para qualquer cargo não-admin: ocultar administradores e super_admins
    const semAdmins = lista.filter(u => !PERFIS_ADMIN.includes(u.perfil));
    const p = perfilAtual?.perfil ?? '';
    if (['operador', 'lider', 'elite'].includes(p)) {
      return semAdmins.filter(u => u.setor_id === perfilAtual?.setor_id);
    }
    if (['gerencia', 'diretoria'].includes(p)) {
      return semAdmins;
    }
    return semAdmins;
  };

  const usuariosFiltrados = aplicarFiltroAcesso(
    isSuperAdmin && filtroEmpresa
      ? usuarios.filter(u => u.empresa_id === filtroEmpresa)
      : usuarios
  );

  // ── Agrupamento por setor ────────────────────────────────────────────────────
  const usuariosPorSetor = usuariosFiltrados.reduce<Record<string, { nomeSetor: string; lista: PerfilComClone[] }>>((acc, u) => {
    const sid = u.setor_id ?? '__sem_setor__';
    const snome = nomeSetor(u);
    if (!acc[sid]) acc[sid] = { nomeSetor: snome, lista: [] };
    acc[sid].lista.push(u);
    return acc;
  }, {});

  // BookPlay: injeta os clones de OUTRO setor no grupo do setor destino, com tag.
  // Respeita o acesso: cargo escopado (operador/líder/elite) só vê o próprio setor
  // — o grupo do setor dele é criado mesmo se for formado só por clones.
  if (tenant.slug === 'bookplay' && clonesCross.length) {
    const escopadoAoSetor = ['operador', 'lider', 'elite'].includes(perfilAtual?.perfil ?? '');
    const perfilPorId = new Map(usuarios.map(p => [p.id, p]));
    const nomeSetorPorId = (id: string) => setores.find(s => s.id === id)?.nome ?? 'Setor';
    for (const c of clonesCross) {
      if (escopadoAoSetor && c.destinoSetorId !== perfilAtual?.setor_id) continue;
      const p = perfilPorId.get(c.operadorId);
      if (!p || !p.setor_id || p.setor_id === c.destinoSetorId) continue;   // só cross-setor
      if (PERFIS_ADMIN.includes(p.perfil) && !(isAdmin || isSuperAdmin)) continue;
      const grupo = (usuariosPorSetor[c.destinoSetorId] ??= { nomeSetor: nomeSetorPorId(c.destinoSetorId), lista: [] });
      if (grupo.lista.some(x => x.id === p.id)) continue;
      grupo.lista.push({ ...p, _cloneDe: nomeSetor(p) });
    }
  }

  const setoresOrdenados = (() => {
    const entries = Object.entries(usuariosPorSetor);
    // Aplica a mesma ordem persistida pelo DnD da aba Setores para manter
    // consistência visual entre as abas Usuários e Setores.
    const empresaId = empresaAtual?.id;
    const ordenados = aplicarOrdemSetores(
      entries.map(([sid, g]) => ({ id: sid, nome: g.nomeSetor })),
      empresaId,
    );
    const byId = new Map(entries);
    return ordenados
      .map(({ id }) => [id, byId.get(id)!] as [string, typeof entries[number][1]])
      .filter(([, g]) => !!g);
  })();

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
            {podeVerSetores && (
              <TabsTrigger
                value="setores"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
              >
                <Building2 className="w-4 h-4" /> Setores
              </TabsTrigger>
            )}
            {temPermissao('ver_equipes') && (
            <TabsTrigger
              value="equipes"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
            >
              <Users2 className="w-4 h-4" /> Equipes
            </TabsTrigger>
            )}
            {metasComoAba && temPermissao('ver_metas') && (
            <TabsTrigger
              value="metas"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
            >
              <Target className="w-4 h-4" /> Metas
            </TabsTrigger>
            )}
            {podeVerComemoracoes && (
            <TabsTrigger
              value="comemoracoes"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
            >
              <PartyPopper className="w-4 h-4" /> Comemorações
            </TabsTrigger>
            )}
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
          {(isAdmin || isSuperAdmin) && temPermissao('editar_usuarios') && <Button size="sm" onClick={abrirCriar}><Plus className="w-4 h-4 mr-2" /> Novo Usuário</Button>}
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
                                    {u._cloneDe && (
                                      <span className="text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded px-1 py-0 font-semibold whitespace-nowrap"
                                        title={`Operador clonado do setor ${u._cloneDe}`}>
                                        clone de {u._cloneDe}
                                      </span>
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
                              {podeGerenciarSituacao && !u._cloneDe ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-accent">
                                      <span className={cn('inline-flex w-2 h-2 rounded-full', SITU_DOT[u.situacao ?? 'ativo'])} />
                                      {SITU_LABEL[u.situacao ?? 'ativo']}
                                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {(['ativo', 'ferias', 'desligado'] as SituacaoUsuario[]).map(sit => (
                                      <DropdownMenuItem key={sit} className="gap-2 text-xs" onClick={() => handleSituacao(u, sit)}>
                                        <span className={cn('inline-flex w-2 h-2 rounded-full', SITU_DOT[sit])} />
                                        {SITU_LABEL[sit]}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <span
                                  title={SITU_LABEL[u.situacao ?? 'ativo']}
                                  className={cn('inline-flex w-2 h-2 rounded-full', SITU_DOT[u.situacao ?? 'ativo'])}
                                />
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                {u._cloneDe && (
                                  <span className="text-[10px] text-muted-foreground italic">gerido no setor de origem</span>
                                )}
                                {!u._cloneDe && isSuperAdmin && u.id !== perfilAtual?.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1.5 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                                    title="Entrar como este usuário (impersonação — super admin)"
                                    disabled={impersonando === u.id}
                                    onClick={() => entrarComo(u)}
                                  >
                                    {impersonando === u.id
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      : <LogIn className="w-3.5 h-3.5" />}
                                    <span className="text-xs">Entrar como</span>
                                  </Button>
                                )}
                                {!u._cloneDe && temPermissao('editar_usuarios') && (((isAdmin || isSuperAdmin || perfilAtual?.perfil === 'lider') && u.id !== perfilAtual?.id) || (isAdmin || isSuperAdmin)) ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1.5 px-2"
                                    title="Editar usuário (dados, foto e senha)"
                                    onClick={() => abrirEditar(u)}
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                    <span className="text-xs">Editar</span>
                                  </Button>
                                ) : null}
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

        {/* ─── Aba: Setores ──────────────────────────────────────────── */}
        {podeVerSetores && (
          <TabsContent value="setores" className="flex-1 overflow-y-auto mt-0">
            <AdminSetoresAba />
          </TabsContent>
        )}

        {/* ─── Aba: Equipes ──────────────────────────────────────────── */}
        {temPermissao('ver_equipes') && (
        <TabsContent value="equipes" className="flex-1 overflow-y-auto mt-0">
          <AdminEquipes />
        </TabsContent>
        )}

        {/* ─── Aba: Metas (BookPlay) ─────────────────────────────────── */}
        {metasComoAba && temPermissao('ver_metas') && (
          <TabsContent value="metas" className="flex-1 overflow-y-auto p-6 mt-0">
            <MetasConfig />
          </TabsContent>
        )}

        {/* ─── Aba: Comemorações ─────────────────────────────────────── */}
        {/* Sem `p-6` aqui: a página já traz o próprio espaçamento, como
            Setores e Equipes. O Suspense é obrigatório — o import é lazy. */}
        {podeVerComemoracoes && (
          <TabsContent value="comemoracoes" className="flex-1 overflow-y-auto mt-0">
            <Suspense fallback={
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            }>
              <Comemoracoes />
            </Suspense>
          </TabsContent>
        )}

      </Tabs>

      {/* ── Dialog unificado: editar/criar usuário (dados + foto + senha) ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" aria-describedby="modal-usuario-desc">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            <DialogDescription id="modal-usuario-desc" className="sr-only">
              {editando ? 'Editar dados, foto e senha do usuário' : 'Criar novo usuário'}
            </DialogDescription>
          </DialogHeader>

          {/* ── Seção: Foto de perfil (só em modo edição) ─────────────── */}
          {editando && (
            <div className="space-y-2 py-1 border-b border-border pb-4">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Foto de perfil
              </Label>
              <div className="flex items-center gap-3">
                <Avatar className="w-14 h-14">
                  {editando.foto_url && <AvatarImage src={editando.foto_url} alt={editando.nome} />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {editando.nome.split(' ').map((n: string) => n[0]).slice(0,2).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={uploadando}
                    onClick={() => { setUploadTarget(editando); fileInputRef.current?.click(); }}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {uploadando ? 'Enviando...' : (editando.foto_url ? 'Trocar foto' : 'Adicionar foto')}
                  </Button>
                  {editando.foto_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => excluirFotoDeUsuario(editando)}
                    >
                      <Trash2 className="w-3 h-3" />
                      Remover foto
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Seção: Dados cadastrais ───────────────────────────────── */}
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
            {/* Cargo: só admin/super_admin definem. Para os demais o campo é
                somente leitura — impede líder de escolher/criar admin. (O banco
                também bloqueia via RLS; isto remove a opção enganosa da tela.) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Perfil *</Label>
              {(isAdmin || isSuperAdmin) ? (
                <Select value={form.perfil} onValueChange={v => setForm(f => ({ ...f, perfil: v as PerfilUsuario }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operador">Operador</SelectItem>
                    <SelectItem value="lider">Líder</SelectItem>
                    <SelectItem value="elite">Elite</SelectItem>
                    <SelectItem value="gerencia">Gerência</SelectItem>
                    <SelectItem value="diretoria">Diretoria</SelectItem>
                    <SelectItem value="ouvidoria">Ouvidoria</SelectItem>
                    <SelectItem value="administrador">Administrador</SelectItem>
                    {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-9 flex items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                  {PERFIL_LABELS[form.perfil] ?? form.perfil}
                  <span className="ml-auto text-[10px] uppercase tracking-wide">só admin altera</span>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Setor</Label>
              <Select value={form.setor_id} onValueChange={v => setForm(f => ({ ...f, setor_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um setor" /></SelectTrigger>
                <SelectContent>
                  {setoresDoForm.length === 0
                    ? <SelectItem value="__none__" disabled>Nenhum setor nesta empresa</SelectItem>
                    : setoresDoForm.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {editando && form.setor_id !== (editando.setor_id ?? '') && (
                <p className="text-[11px] text-primary flex items-center gap-1">
                  <ArrowRightLeft className="w-3 h-3" />
                  Ao salvar, a transferência será confirmada numa tela à parte.
                </p>
              )}
            </div>
             <div className="space-y-1.5">
               <Label className="text-xs">Empresa</Label>
               {isSuperAdmin ? (
                 <Select value={form.empresa_id} onValueChange={v => setForm(f => ({ ...f, empresa_id: v, setor_id: setores.find(s => s.empresa_id === v)?.id ?? '' }))}>
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

          {/* ── Seção: Transferências ──────────────────────────────────────
              Fica aqui, e não numa tela de auditoria, porque é aqui que o admin
              chega quando moveu alguém errado. Some sozinha para quem nunca foi
              transferido, que é a maioria. */}
          {editando && (
            <HistoricoTransferencias
              perfilId={editando.id}
              podeDesfazer={isAdmin || isSuperAdmin}
              nomeDoSetor={nomeDoSetor}
              nomeDaEmpresa={nomeDaEmpresa}
              onDesfeita={() => { setDialogOpen(false); fetchDados(); }}
            />
          )}

          {/* ── Seção: Redefinir senha (edição, só admin/super_admin) ───
              A senha atual não é exibida porque não existe para ser exibida: o
              Supabase guarda o hash bcrypt dela, que não volta a texto. O que
              o admin pode fazer é definir uma nova. */}
          {editando && (isAdmin || isSuperAdmin) && (
            <div className="space-y-2 py-2 border-t border-border pt-4">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Redefinir senha
              </Label>
              <div className="space-y-1.5">
                <Label className="text-xs">Nova senha</Label>
                <Input
                  type="text"
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  placeholder="Deixe em branco para manter a senha atual"
                  className="h-9 text-sm font-mono"
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">
                  Mínimo {MIN_SENHA} caracteres. Deixe em branco para não alterar.
                  A senha atual não pode ser consultada — só substituída. Informe
                  a nova a {editando.nome.split(' ')[0]}; o botão de chave vai
                  aparecer para ela definir uma senha própria.
                </p>
              </div>
              {novaSenha.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1.5 w-full"
                  disabled={salvandoSenha || novaSenha.length < MIN_SENHA}
                  onClick={alterarSenhaOperador}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {salvandoSenha ? 'Salvando senha...' : 'Salvar nova senha'}
                </Button>
              )}
            </div>
          )}

          <DialogFooter className="sm:justify-between">
            {/* #6: excluir usuário — só no modo Editar e não permite auto-exclusão */}
            {editando && editando.id !== perfilAtual?.id ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => { void abrirConfirmacaoExclusao(); }}
                disabled={excluindoUsuario}
              >
                <Trash2 className="w-4 h-4" />
                Excluir usuário
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={salvar} disabled={saving} className="gap-2">
                <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* #6: diálogo de confirmação de exclusão de usuário */}
      <Dialog open={confirmExclusaoUser} onOpenChange={setConfirmExclusaoUser}>
        <DialogContent className="max-w-md" aria-describedby="dlg-excl-user-desc">
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
            <DialogDescription id="dlg-excl-user-desc">
              Tem certeza que deseja excluir{' '}
              <strong>{editando?.nome}</strong>? Esta ação não pode ser desfeita e removerá
              o acesso do usuário ao sistema.
            </DialogDescription>
          </DialogHeader>

          {/* O que exatamente vai embora. Sem isto, "não pode ser desfeita"
              não diz QUANTO se perde — e a exclusão apaga tabulação. */}
          {resumoDaExclusao && resumoDaExclusao.acordos > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 space-y-1.5">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {resumoDaExclusao.acordos.toLocaleString('pt-BR')}{' '}
                {resumoDaExclusao.acordos === 1 ? 'tabulação será apagada' : 'tabulações serão apagadas'}
              </p>
              <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 leading-relaxed">
                Uma planilha com todas elas é baixada antes da exclusão, para conferência.
                Os NRs voltam a ficar livres para outros operadores tabularem.
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                O recebimento do analítico e do diário <strong>não</strong> é apagado — ele
                continua contando nos totais de setor e equipe, sem o nome do operador.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmExclusaoUser(false)} disabled={excluindoUsuario}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={excluirUsuarioEditado}
              disabled={excluindoUsuario}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {excluindoUsuario ? 'Excluindo...' : 'Excluir definitivamente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Input file oculto para upload de foto (usado pelo Dialog unificado) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadTarget) {
            if (!file.type.startsWith('image/')) {
              toast.error('Arquivo inválido. Envie uma imagem.');
            } else {
              // Abre o modal de recorte antes do upload
              setFotoParaRecorte(file);
            }
          }
          e.target.value = '';
        }}
      />

      {/* Transferência: confirmação própria de mudar Setor/Empresa */}
      <DialogoTransferencia
        aberto={!!alvoTransferencia}
        alvo={alvoTransferencia}
        origemSetorNome={nomeDoSetor(alvoTransferencia?.origemSetorId ?? null)}
        destinoSetorNome={nomeDoSetor(alvoTransferencia?.destinoSetorId ?? null)}
        origemEmpresaNome={nomeDaEmpresa(alvoTransferencia?.origemEmpresaId ?? null)}
        destinoEmpresaNome={nomeDaEmpresa(alvoTransferencia?.destinoEmpresaId ?? null)}
        salvando={saving}
        onCancelar={() => setAlvoTransferencia(null)}
        onConfirmar={levar => void confirmarTransferencia(levar)}
      />

      {/* Recorte da foto antes do upload */}
      <ModalRecortarFoto
        arquivo={fotoParaRecorte}
        onCancelar={() => setFotoParaRecorte(null)}
        onConfirmar={async (foto) => {
          setFotoParaRecorte(null);
          if (uploadTarget) await fazerUploadFotoParaUsuario(uploadTarget.id, foto);
        }}
      />

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