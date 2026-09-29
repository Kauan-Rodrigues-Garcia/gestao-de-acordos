import { useEffect, useState } from 'react';
import { useSubAbaUso } from '@/providers/RastreioUsoProvider';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/index';
import { motion } from 'framer-motion';
import { Settings, MessageSquare, Plus, Save, Trash2, Edit, Building2, ShieldCheck, ArrowLeftRight, Tag, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase, ModeloMensagem } from '@/lib/supabase';
import { toast } from 'sonner';
import { useEmpresa } from '@/hooks/useEmpresa';
import { produtoDaEmpresa } from '@/lib/produto';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AdminPermissoes from '@/pages/AdminPermissoes';
import AdminDiretoExtra from '@/pages/AdminDiretoExtra';
import AdminTags from '@/components/admin/AdminTags';
import AcessoMultiempresa from '@/components/admin/AcessoMultiempresa';
import LiberacaoChat from '@/components/admin/LiberacaoChat';
import AdminDocumentacoes from '@/pages/AdminDocumentacoes';

export default function AdminConfiguracoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') ?? 'geral';
  const [modelos, setModelos] = useState<ModeloMensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<ModeloMensagem | null>(null);
  const [form, setForm] = useState({ nome: '', conteudo: '' });
  const [saving, setSaving] = useState(false);
  const { empresa, tenantSlug } = useEmpresa();
  const { perfil } = useAuth();
  const { temPermissao } = useCargoPermissoes();
  // Aba "Multiempresa": só super_admin. Esconder aqui é conveniência — quem
  // decide são as RPCs e o trigger em `perfis` (migration 20260818300000).
  const ehSuperAdmin = perfil?.perfil === 'super_admin';

  /*
   * Configurações é de toda operação, mas duas abas de dentro NÃO são.
   *
   * «Direto e Extra» classifica recebimento de acordo; «Tags» são rótulos de
   * acordo. As duas apareciam sem condição nenhuma, e o Comercial abria
   * Configurações e encontrava vocabulário de cobrança — vazio, porque o dado é
   * isolado por empresa, mas presente.
   *
   * O cabeçalho de `AdminDiretoExtra.tsx` chegava a dizer que a aba «é exibida
   * para todas as empresas». Era verdade quando «todas» eram BookPlay e
   * PaguePlay. A Fase 0 cuidou das abas do MENU; estas vivem um nível abaixo,
   * dentro da tela, e nenhuma régua as alcançava.
   */
  const ehCobranca = produtoDaEmpresa(empresa, tenantSlug) === 'cobranca';
  const podeVerGeral = temPermissao('config_sub_geral');
  const podeVerPermissoes = temPermissao('config_sub_permissoes');
  const podeVerDiretoExtra = ehCobranca && temPermissao('config_sub_direto_extra');
  const podeVerTags = ehCobranca && temPermissao('config_sub_tags');
  const podeVerDocumentacoes = temPermissao('config_sub_documentacoes');
  const podeVerMultiempresa = temPermissao('config_sub_multiempresa');
  /*
   * Mapa de Abas (29/09/2026): Geral, Tags e Multiempresa viraram a aba
   * «Empresa» — são todas configuração da empresa, e três abas para isso
   * era a régua mais longa do sistema. Cada seção de dentro continua atrás da
   * chave dela. Logs saiu para Administração › Auditoria, e o banco de dados e
   * a restauração de tabulações para Administração › Dados.
   *
   * A chave de URL da aba continua `geral`, e `tags`/`multiempresa` caem nela:
   * link antigo não vira aba vazia.
   */
  const podeVerEmpresa = podeVerGeral || podeVerTags || podeVerMultiempresa;
  const abasVisiveis = [
    podeVerEmpresa && 'geral',
    podeVerDiretoExtra && 'direto_extra',
    podeVerPermissoes && 'permissoes',
    podeVerDocumentacoes && 'documentacoes',
  ].filter((aba): aba is string => Boolean(aba));
  const tabPedida = tabFromUrl === 'tags' || tabFromUrl === 'multiempresa' ? 'geral' : tabFromUrl;
  const tabAtiva = abasVisiveis.includes(tabPedida) ? tabPedida : abasVisiveis[0];
  // Monitoramento de uso: a aba aberta. As de dentro (Logs, Permissões…) vêm no nível 2.
  useSubAbaUso(tabAtiva);
  const selecionarAba = (aba: string) => {
    if (!abasVisiveis.includes(aba)) return;
    const novosParametros = new URLSearchParams(searchParams);
    novosParametros.set('tab', aba);
    setSearchParams(novosParametros, { replace: true });
  };

  async function fetchModelos(empresaId?: string) {
    if (!empresaId) {
      console.warn('[AdminConfiguracoes] empresa do site indisponível durante carregamento dos modelos');
      setModelos([]);
      setLoading(false);
      return;
    }

    const query = supabase
      .from('modelos_mensagem')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('criado_em');
    const { data } = await query;
    setModelos((data as ModeloMensagem[]) || []);
    setLoading(false);
  }

  useEffect(() => { fetchModelos(empresa?.id); }, [empresa?.id]);

  function abrirCriar() {
    setEditando(null);
    setForm({ nome: '', conteudo: '' });
    setDialogOpen(true);
  }

  function abrirEditar(m: ModeloMensagem) {
    setEditando(m);
    setForm({ nome: m.nome, conteudo: m.conteudo });
    setDialogOpen(true);
  }

  async function salvar() {
    if (!form.nome || !form.conteudo) { toast.error('Preencha todos os campos'); return; }
    setSaving(true);
    if (editando) {
      const { error } = await supabase.from('modelos_mensagem').update({ nome: form.nome, conteudo: form.conteudo }).eq('id', editando.id);
      if (!error) toast.success('Modelo atualizado!'); else toast.error('Erro ao atualizar');
    } else {
      const { error } = await supabase.from('modelos_mensagem').insert({
        nome: form.nome,
        conteudo: form.conteudo,
        empresa_id: empresa?.id ?? null,
      });
      if (!error) toast.success('Modelo criado!'); else toast.error('Erro ao criar');
    }
    setSaving(false);
    setDialogOpen(false);
    fetchModelos(empresa?.id);
  }

  async function toggleAtivo(m: ModeloMensagem) {
    await supabase.from('modelos_mensagem').update({ ativo: !m.ativo }).eq('id', m.id);
    fetchModelos(empresa?.id);
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este modelo?')) return;
    await supabase.from('modelos_mensagem').delete().eq('id', id);
    toast.success('Modelo excluído');
    fetchModelos(empresa?.id);
  }

  const variaveis = ['{{nome_cliente}}', '{{nr_cliente}}', '{{valor}}', '{{vencimento}}'];

  // Logs virou Administração › Auditoria. Link antigo continua caindo lá.
  if (tabFromUrl === 'logs') return <Navigate to={ROUTE_PATHS.ADMIN_AUDITORIA} replace />;

  return (
    <div className="h-full flex flex-col">
      {/* Cabeçalho */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> Configurações
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Empresa, Direto e Extra, permissões e documentações</p>
            {empresa && (
              <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                Configurações de <span className="font-medium text-foreground">{empresa.nome}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Abas internas */}
      {tabAtiva ? <Tabs value={tabAtiva} onValueChange={selecionarAba} className="flex-1 flex flex-col">
        <div className="px-6 border-b border-border">
          <TabsList className="h-10 bg-transparent p-0 gap-0">
            {podeVerEmpresa && <TabsTrigger value="geral" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2">
              <Building2 className="w-4 h-4" /> Empresa
            </TabsTrigger>}
            {podeVerDiretoExtra && <TabsTrigger value="direto_extra" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2">
              <ArrowLeftRight className="w-4 h-4" /> Direto e Extra
            </TabsTrigger>}
            {podeVerPermissoes && <TabsTrigger value="permissoes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2">
              <ShieldCheck className="w-4 h-4" /> Permissões e menu
            </TabsTrigger>}
            {podeVerDocumentacoes && <TabsTrigger value="documentacoes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2">
              <FileText className="w-4 h-4" /> Documentações
            </TabsTrigger>}
          </TabsList>
        </div>

        {/* ─── Aba: Geral ──────────────────────────────────────────────── */}
        {podeVerEmpresa && <TabsContent value="geral" className="flex-1 overflow-y-auto p-6 mt-0">
          <div className="max-w-4xl mx-auto space-y-6">
          {podeVerGeral && <>

          {/* ── Chat interno ─────────────────────────────────────────────
              A trava de LANÇAMENTO, que é outra coisa das permissões: ela
              segura até o administrador, e o painel de Cargos só passa a
              mandar depois que ela abre. Só super_admin vira — a policy
              `chat_config_update` confere de novo no banco. */}
          {ehSuperAdmin && <LiberacaoChat />}

          {/* O card do banco de dados (migrations) e o «Importar acordos» foram
              para Administração › Dados (Mapa de Abas, 29/09/2026): são
              ferramentas de dado, não configuração da empresa. */}

          {/* Modelos de mensagem */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" /> Modelos de Mensagem WhatsApp
                </CardTitle>
                <Button size="sm" onClick={abrirCriar}>
                  <Plus className="w-4 h-4 mr-2" /> Novo Modelo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Variáveis disponíveis */}
              <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-2">Variáveis disponíveis para personalização:</p>
                <div className="flex flex-wrap gap-2">
                  {variaveis.map(v => (
                    <code key={v} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono">{v}</code>
                  ))}
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
              ) : (
                <div className="space-y-3">
                  {modelos.map(m => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border border-border rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold text-foreground">{m.nome}</p>
                            {m.ativo && <span className="text-xs bg-success/10 text-success px-1.5 py-0.5 rounded-full">Ativo</span>}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{m.conteudo}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Switch checked={m.ativo} onCheckedChange={() => toggleAtivo(m)} />
                          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => abrirEditar(m)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:bg-destructive/10" onClick={() => excluir(m.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </>}

          {/* Tags e Multiempresa — eram abas próprias. */}
          {podeVerTags && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Tag className="w-4 h-4 text-primary" /> Tags</h2>
              <AdminTags />
            </section>
          )}
          {podeVerMultiempresa && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Building2 className="w-4 h-4 text-primary" /> Multiempresa</h2>
              <AcessoMultiempresa />
            </section>
          )}

          </div>
        </TabsContent>}

        {/* ─── Aba: Permissões ─────────────────────────────────────────── */}
        {podeVerPermissoes && <TabsContent value="permissoes" className="flex-1 overflow-y-auto mt-0">
          <AdminPermissoes />
        </TabsContent>}

        {/* ─── Aba: Direto e Extra ─────────────────────────────────────── */}
        {podeVerDiretoExtra && (
        <TabsContent value="direto_extra" className="flex-1 overflow-y-auto mt-0">
          <AdminDiretoExtra />
        </TabsContent>
        )}

        {/* ─── Aba: Documentações LGPD ─────────────────────────────────── */}
        {podeVerDocumentacoes && <TabsContent value="documentacoes" className="flex-1 overflow-y-auto mt-0">
          <AdminDocumentacoes />
        </TabsContent>}

      </Tabs> : (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Nenhuma aba interna de Configurações foi liberada para este cargo.
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" aria-describedby="cfg-modelo-desc">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Modelo' : 'Novo Modelo de Mensagem'}</DialogTitle>
            <DialogDescription id="cfg-modelo-desc" className="sr-only">{editando ? 'Editar modelo de mensagem' : 'Criar novo modelo de mensagem WhatsApp'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do Modelo *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Lembrete Padrão" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem *</Label>
              <Textarea value={form.conteudo} onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
                placeholder="Use {{nome_cliente}}, {{nr_cliente}}, {{valor}}, {{vencimento}}"
                className="text-sm resize-none" rows={5} />
            </div>
            <div className="flex flex-wrap gap-2">
              {variaveis.map(v => (
                <button key={v} type="button"
                  onClick={() => setForm(f => ({ ...f, conteudo: f.conteudo + v }))}
                  className="text-xs bg-primary/10 text-primary hover:bg-primary/20 px-2 py-1 rounded font-mono transition-colors"
                >{v}</button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={salvar} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
