import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings, MessageSquare, Plus, Save, Trash2, Edit, Check, Database, CheckCircle2, AlertTriangle, Copy, Building2, Bot, ShieldCheck, ClipboardList, ArrowLeftRight } from 'lucide-react';
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
import { useAuth } from '@/hooks/useAuth';
import { isPerfilAdmin } from '@/lib/index';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AdminIA from '@/pages/AdminIA';
import AdminCargos from '@/pages/AdminCargos';
import AdminLogs from '@/pages/AdminLogs';
import AdminDiretoExtra from '@/pages/AdminDiretoExtra';

const MIGRATION_SQL = `ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS instituicao TEXT;

CREATE INDEX IF NOT EXISTS idx_acordos_instituicao
  ON public.acordos(instituicao)
  WHERE instituicao IS NOT NULL;`;

export default function AdminConfiguracoes() {
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') ?? 'geral';
  const [modelos, setModelos] = useState<ModeloMensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<ModeloMensagem | null>(null);
  const [form, setForm] = useState({ nome: '', conteudo: '' });
  const [saving, setSaving] = useState(false);
  const { empresa } = useEmpresa();
  const { perfil } = useAuth();
  // Gate defensivo: card "Banco de Dados / Migrations" só para Admin/Super Admin
  // (defesa em profundidade — além do ProtectedRoute da rota)
  const podeVerBancoDados = isPerfilAdmin(perfil?.perfil ?? '');

  // ── Schema status ─────────────────────────────────────────────────────────
  const [schemaStatus, setSchemaStatus] = useState<'checking' | 'ok' | 'missing'>('checking');
  const [sqlCopiado, setSqlCopiado] = useState(false);

  useEffect(() => {
    // Evita probe desnecessário quando o usuário nem verá o card
    if (!podeVerBancoDados) return;
    (async () => {
      const { error } = await supabase.from('acordos').select('instituicao').limit(0);
      setSchemaStatus(!error ? 'ok' : 'missing');
    })();
  }, [podeVerBancoDados]);

  function copiarSQL() {
    navigator.clipboard.writeText(MIGRATION_SQL).then(() => {
      setSqlCopiado(true);
      setTimeout(() => setSqlCopiado(false), 3000);
    });
  }

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

  return (
    <div className="h-full flex flex-col">
      {/* Cabeçalho */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> Configurações
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configurações do sistema, IA, permissões e logs</p>
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
      <Tabs defaultValue={tabFromUrl} className="flex-1 flex flex-col">
        <div className="px-6 border-b border-border">
          <TabsList className="h-10 bg-transparent p-0 gap-0">
            <TabsTrigger
              value="geral"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
            >
              <Settings className="w-4 h-4" /> Geral
            </TabsTrigger>
            <TabsTrigger
              value="ia"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
            >
              <Bot className="w-4 h-4" /> IA
            </TabsTrigger>
            <TabsTrigger
              value="permissoes"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
            >
              <ShieldCheck className="w-4 h-4" /> Permissões
            </TabsTrigger>
            <TabsTrigger
              value="direto_extra"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
            >
              <ArrowLeftRight className="w-4 h-4" /> Direto e Extra
            </TabsTrigger>
            <TabsTrigger
              value="logs"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 h-10 text-sm gap-2"
            >
              <ClipboardList className="w-4 h-4" /> Logs
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Aba: Geral ──────────────────────────────────────────────── */}
        <TabsContent value="geral" className="flex-1 overflow-y-auto p-6 mt-0">
          <div className="max-w-4xl mx-auto space-y-6">

          {/* ── Status do Banco de Dados ─────────────────────────────── */}
          {/* Gate: visível apenas para Admin e Super Admin (item #8) */}
          {podeVerBancoDados && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" /> Banco de Dados / Migrations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg border border-border">
                {schemaStatus === 'checking' && (
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground border-t-primary animate-spin mt-0.5 flex-shrink-0" />
                )}
                {schemaStatus === 'ok' && (
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                )}
                {schemaStatus === 'missing' && (
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    Coluna <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">acordos.instituicao</code>
                    {schemaStatus === 'ok'   && <span className="ml-2 text-xs text-green-600 font-normal">✓ Disponível</span>}
                    {schemaStatus === 'missing' && <span className="ml-2 text-xs text-amber-600 font-normal">⚠ Pendente</span>}
                  </p>
                  {schemaStatus === 'missing' && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        A coluna <code className="font-mono">instituicao</code> ainda não existe na tabela.
                        Execute o SQL abaixo no <strong>Supabase Dashboard → SQL Editor</strong>.
                        Até lá, a instituição será salva em "Observações" como fallback.
                      </p>
                      <div className="relative">
                        <pre className="text-xs bg-muted/60 rounded p-3 font-mono overflow-x-auto whitespace-pre-wrap border border-border">
{MIGRATION_SQL}
                        </pre>
                        <Button
                          size="sm"
                          variant="outline"
                          className="absolute top-2 right-2 h-7 text-xs gap-1.5"
                          onClick={copiarSQL}
                        >
                          {sqlCopiado ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {sqlCopiado ? 'Copiado!' : 'Copiar SQL'}
                        </Button>
                      </div>
                      <a
                        href="https://supabase.com/dashboard/project/hslhdgmwicezfuieffll/sql/new"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                      >
                        Abrir SQL Editor do projeto →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          )}

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

          </div>
        </TabsContent>

        {/* ─── Aba: IA ─────────────────────────────────────────────────── */}
        <TabsContent value="ia" className="flex-1 overflow-y-auto mt-0">
          <AdminIA />
        </TabsContent>

        {/* ─── Aba: Permissões ─────────────────────────────────────────── */}
        <TabsContent value="permissoes" className="flex-1 overflow-y-auto mt-0">
          <AdminCargos />
        </TabsContent>

        {/* ─── Aba: Direto e Extra ─────────────────────────────────────── */}
        <TabsContent value="direto_extra" className="flex-1 overflow-y-auto mt-0">
          <AdminDiretoExtra />
        </TabsContent>

        {/* ─── Aba: Logs ───────────────────────────────────────────────── */}
        <TabsContent value="logs" className="flex-1 overflow-y-auto mt-0">
          <AdminLogs />
        </TabsContent>

      </Tabs>

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