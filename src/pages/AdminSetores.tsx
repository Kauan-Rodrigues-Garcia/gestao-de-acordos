import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Plus, Save, Edit, RefreshCw, Users, Trash2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase, Setor } from '@/lib/supabase';
import SeedSetores from '@/components/SeedSetores';
import { toast } from 'sonner';
import { useEmpresa } from '@/hooks/useEmpresa';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function AdminSetores() {
  const [setores, setSetores] = useState<(Setor & { total_usuarios?: number; total_acordos?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Setor | null>(null);
  const [form, setForm] = useState({ nome: '', descricao: '' });
  const [saving, setSaving] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<(Setor & { total_usuarios?: number; total_acordos?: number }) | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const { empresa } = useEmpresa();
  const navigate = useNavigate();

  async function fetchSetores() {
    setLoading(true);
    if (!empresa?.id) {
      setSetores([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from('setores').select('*').eq('empresa_id', empresa.id).order('nome');
    if (data) {
      const enriched = await Promise.all((data as Setor[]).map(async s => {
        const [{ count: tu }, { count: ta }] = await Promise.all([
          supabase.from('perfis').select('*', { count: 'exact', head: true }).eq('setor_id', s.id),
          supabase.from('acordos').select('*', { count: 'exact', head: true }).eq('setor_id', s.id),
        ]);
        return { ...s, total_usuarios: tu ?? 0, total_acordos: ta ?? 0 };
      }));
      setSetores(enriched);
    }
    setLoading(false);
  }

  useEffect(() => { fetchSetores(); }, [empresa?.id]);

  function abrirCriar() {
    setEditando(null);
    setForm({ nome: '', descricao: '' });
    setDialogOpen(true);
  }

  function abrirEditar(s: Setor) {
    setEditando(s);
    setForm({ nome: s.nome, descricao: s.descricao ?? '' });
    setDialogOpen(true);
  }

  async function salvar() {
    if (!form.nome.trim()) { toast.error('Nome do setor obrigatório'); return; }
    setSaving(true);
    if (editando) {
      const { error } = await supabase.from('setores').update({ nome: form.nome.trim(), descricao: form.descricao || null }).eq('id', editando.id);
      if (!error) toast.success('Setor atualizado!'); else toast.error(error.message);
    } else {
      const { error } = await supabase.from('setores').insert({ nome: form.nome.trim(), descricao: form.descricao || null, empresa_id: empresa?.id ?? null });
      if (!error) toast.success('Setor criado!'); else toast.error(error.message);
    }
    setSaving(false);
    setDialogOpen(false);
    fetchSetores();
  }

  async function toggleAtivo(s: Setor) {
    await supabase.from('setores').update({ ativo: !s.ativo }).eq('id', s.id);
    toast.success(s.ativo ? 'Setor desativado' : 'Setor ativado');
    fetchSetores();
  }

  async function excluirSetor() {
    if (!confirmandoExclusao) return;
    setExcluindo(true);
    const { error } = await supabase.from('setores').delete().eq('id', confirmandoExclusao.id);
    setExcluindo(false);
    if (error) {
      toast.error(`Erro ao excluir: ${error.message}`);
    } else {
      toast.success(`Setor "${confirmandoExclusao.nome}" excluído!`);
      setConfirmandoExclusao(null);
      fetchSetores();
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" /> Setores
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{setores.length} setor(es) cadastrado(s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/equipes')} className="text-xs">
            Gerenciar Todas as Equipes
          </Button>
          <Button variant="outline" size="sm" onClick={fetchSetores} className="w-8 h-8 p-0">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={abrirCriar} className="gap-1.5 text-xs">
            <Plus className="w-4 h-4" /> Novo Setor
          </Button>
        </div>
      </div>

      {/* Seed */}
      {!loading && setores.length === 0 && (
        <div className="mb-6">
          <SeedSetores onSeedComplete={fetchSetores} />
        </div>
      )}

      {/* Grid de cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-muted/30 rounded-xl animate-pulse" />
          ))
        ) : setores.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className={cn(
              'border-border hover:border-primary/40 transition-all duration-200 group relative overflow-hidden',
              !s.ativo && 'opacity-55 grayscale-[30%]'
            )}>
              {/* Barra de cor no topo */}
              <div className={cn(
                'h-0.5 w-full',
                s.ativo ? 'bg-primary/60' : 'bg-muted-foreground/30'
              )} />

              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-semibold truncate text-foreground leading-snug">
                      {s.nome}
                    </CardTitle>
                    {empresa && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground mt-1 h-4">
                        {empresa.nome}
                      </Badge>
                    )}
                    {s.descricao && (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-snug">{s.descricao}</p>
                    )}
                  </div>
                  <Switch
                    checked={s.ativo}
                    onCheckedChange={() => toggleAtivo(s)}
                    className="flex-shrink-0 mt-0.5"
                  />
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-4">
                {/* Métricas */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 bg-muted/30 rounded-lg px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-primary/70" />
                    <span className="font-medium text-foreground">{s.total_usuarios}</span> usuário(s)
                  </span>
                  <span className="text-border">|</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[11px]">📋</span>
                    <span className="font-medium text-foreground">{s.total_acordos}</span> acordo(s)
                  </span>
                </div>

                {/* Botões */}
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => abrirEditar(s)}
                  >
                    <Edit className="w-3 h-3" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => navigate(`/admin/equipes?setor_id=${s.id}`)}
                  >
                    <Users className="w-3 h-3" /> Equipes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 col-span-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50"
                    onClick={() => setConfirmandoExclusao(s)}
                  >
                    <Trash2 className="w-3 h-3" /> Excluir setor
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Setor' : 'Novo Setor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Comercial"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição opcional"
                className="h-9 text-sm"
              />
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

      {/* Dialog confirmar exclusão */}
      <AnimatePresence>
        {confirmandoExclusao && (
          <Dialog open onOpenChange={() => setConfirmandoExclusao(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  Excluir setor
                </DialogTitle>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Tem certeza que deseja excluir o setor{' '}
                  <span className="font-semibold text-foreground">"{confirmandoExclusao.nome}"</span>?
                </p>
                {(confirmandoExclusao.total_usuarios ?? 0) > 0 || (confirmandoExclusao.total_acordos ?? 0) > 0 ? (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive space-y-1">
                    <p className="font-semibold">⚠️ Este setor possui dados vinculados:</p>
                    {(confirmandoExclusao.total_usuarios ?? 0) > 0 && (
                      <p>• {confirmandoExclusao.total_usuarios} usuário(s)</p>
                    )}
                    {(confirmandoExclusao.total_acordos ?? 0) > 0 && (
                      <p>• {confirmandoExclusao.total_acordos} acordo(s)</p>
                    )}
                    <p>Mova os dados antes de excluir.</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                    Este setor está vazio e pode ser excluído com segurança.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setConfirmandoExclusao(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={excluirSetor}
                  disabled={excluindo || (confirmandoExclusao.total_usuarios ?? 0) > 0 || (confirmandoExclusao.total_acordos ?? 0) > 0}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {excluindo ? 'Excluindo...' : 'Excluir'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}
