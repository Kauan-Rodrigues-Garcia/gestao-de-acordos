import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Plus, Save, Edit, RefreshCw, Users } from 'lucide-react';
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

export default function AdminSetores() {
  const [setores, setSetores] = useState<(Setor & { total_usuarios?: number; total_acordos?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Setor | null>(null);
  const [form, setForm] = useState({ nome: '', descricao: '' });
  const [saving, setSaving] = useState(false);
  const { empresa } = useEmpresa();

  async function fetchSetores() {
    setLoading(true);
    if (!empresa?.id) {
      console.warn('[AdminSetores] empresa do site indisponível durante carregamento dos setores');
      setSetores([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase.from('setores').select('*').eq('empresa_id', empresa.id).order('nome');
    if (data) {
      // Buscar contagens
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" /> Setores
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{setores.length} setor(es) cadastrado(s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchSetores}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={abrirCriar}><Plus className="w-4 h-4 mr-2" /> Novo Setor</Button>
        </div>
      </div>

      {/* Seed automático quando não há setores */}
      {!loading && setores.length === 0 && (
        <div className="mb-6">
          <SeedSetores onSeedComplete={fetchSetores} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-36 bg-muted/30 rounded-lg animate-pulse" />)
        ) : setores.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className={`border-border hover:border-primary/30 transition-colors ${!s.ativo ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-semibold truncate">{s.nome}</CardTitle>
                    {empresa && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
                        {empresa.nome}
                      </Badge>
                    )}
                    {s.descricao && <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.descricao}</p>}
                  </div>
                  <Switch checked={s.ativo} onCheckedChange={() => toggleAtivo(s)} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {s.total_usuarios} usuário(s)
                  </span>
                  <span className="flex items-center gap-1">
                    📋 {s.total_acordos} acordo(s)
                  </span>
                </div>
                <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => abrirEditar(s)}>
                  <Edit className="w-3 h-3 mr-1.5" /> Editar
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Setor' : 'Novo Setor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Comercial" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição opcional" className="h-9 text-sm" />
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
    </div>
  );
}
