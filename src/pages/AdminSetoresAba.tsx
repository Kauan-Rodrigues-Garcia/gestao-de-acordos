/**
 * AdminSetoresAba.tsx — Aba "Setores" dentro de Usuários, com reordenação
 * via drag-and-drop (estilo igual à aba Equipes).
 *
 * Fluxo:
 *  - Lista os setores da empresa atual em cards.
 *  - Permite criar novo setor, editar nome/descrição e ativar/desativar.
 *  - A ordem de exibição é reordenável via DnD nativo HTML5 (mesmo padrão
 *    usado em AdminEquipes.tsx para mover membros entre equipes).
 *
 * Persistência da ordem:
 *  - Como a tabela `setores` não possui coluna `ordem`, guardamos a ordem
 *    em localStorage via helpers em `@/lib/setores-ordem`.
 *  - Setores novos entram no final; setores ausentes na lista de ordem
 *    são exibidos depois, alfabeticamente.
 *
 * Observação: a página standalone `AdminSetores.tsx` (rota /admin/setores)
 * é independente deste componente e continua existindo com o fluxo
 * completo de CRUD (inclusive exclusão e contagens de usuários/acordos).
 * Esta aba foca em reorganização e toggle ativo/inativo.
 *
 * Gate de acesso: visível/acessível apenas para perfis Gerência ou acima
 * (gerencia, diretoria, administrador, super_admin). A verificação é feita
 * pelo consumidor (AdminUsuarios.tsx) antes de montar este componente;
 * o componente em si também faz defesa-em-profundidade.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Building2,
  Plus,
  GripVertical,
  Edit,
  Save,
  X,
  Power,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase, Setor } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { cn } from '@/lib/utils';
import {
  aplicarOrdemSetores,
  lerOrdemSetores,
  salvarOrdemSetores,
} from '@/lib/setores-ordem';

// ─── Drag state (module-level, evita stale closures) ────────────────────────
let draggedSetorId: string | null = null;

// ─── Gate helper (usado localmente) ─────────────────────────────────────────
const PERFIS_GERENCIA_OU_ACIMA = [
  'gerencia',
  'diretoria',
  'administrador',
  'super_admin',
];

function temAcessoSetores(perfil: string | undefined): boolean {
  return !!perfil && PERFIS_GERENCIA_OU_ACIMA.includes(perfil);
}

// ─── Componente ─────────────────────────────────────────────────────────────

export default function AdminSetoresAba() {
  const { perfil: perfilAtual } = useAuth();
  const { empresa: empresaAtual } = useEmpresa();

  const [setores, setSetores] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog criar/editar
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Setor | null>(null);
  const [form, setForm] = useState<{ nome: string; descricao: string; ativo: boolean }>({
    nome: '',
    descricao: '',
    ativo: true,
  });

  const acessoOk = temAcessoSetores(perfilAtual?.perfil);

  const fetchSetores = useCallback(async () => {
    if (!empresaAtual?.id) {
      setSetores([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('setores')
        .select('*')
        .eq('empresa_id', empresaAtual.id)
        .order('nome');
      if (error) {
        console.warn('[AdminSetoresAba] fetchSetores error:', error.message);
        setSetores([]);
      } else {
        const lista = aplicarOrdemSetores((data as Setor[]) || [], empresaAtual.id);
        setSetores(lista);
      }
    } finally {
      setLoading(false);
    }
  }, [empresaAtual?.id]);

  useEffect(() => {
    fetchSetores();
  }, [fetchSetores]);

  // ─── Drag & Drop ──────────────────────────────────────────────────────────

  function handleDragStart(setorId: string) {
    draggedSetorId = setorId;
  }

  function handleDropOver(alvoId: string) {
    const srcId = draggedSetorId;
    draggedSetorId = null;
    if (!srcId || srcId === alvoId || !empresaAtual?.id) return;

    setSetores(prev => {
      const srcIdx = prev.findIndex(s => s.id === srcId);
      const dstIdx = prev.findIndex(s => s.id === alvoId);
      if (srcIdx < 0 || dstIdx < 0) return prev;
      const clone = [...prev];
      const [moved] = clone.splice(srcIdx, 1);
      clone.splice(dstIdx, 0, moved);
      salvarOrdemSetores(empresaAtual.id!, clone.map(s => s.id));
      return clone;
    });
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  function abrirCriar() {
    setEditando(null);
    setForm({ nome: '', descricao: '', ativo: true });
    setDialogOpen(true);
  }

  function abrirEditar(s: Setor) {
    setEditando(s);
    setForm({ nome: s.nome, descricao: s.descricao ?? '', ativo: s.ativo });
    setDialogOpen(true);
  }

  async function salvar() {
    if (!form.nome.trim()) {
      toast.error('Informe o nome do setor');
      return;
    }
    if (!empresaAtual?.id) {
      toast.error('Empresa não identificada');
      return;
    }
    setSaving(true);
    try {
      if (editando) {
        const { error } = await supabase
          .from('setores')
          .update({
            nome: form.nome.trim(),
            descricao: form.descricao.trim() || null,
            ativo: form.ativo,
          })
          .eq('id', editando.id);
        if (error) throw error;
        toast.success('Setor atualizado!');
      } else {
        const { data: inserido, error } = await supabase
          .from('setores')
          .insert({
            nome: form.nome.trim(),
            descricao: form.descricao.trim() || null,
            ativo: form.ativo,
            empresa_id: empresaAtual.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        // Acrescenta ao fim da ordem persistida
        if (inserido?.id) {
          const ordem = lerOrdemSetores(empresaAtual.id);
          if (!ordem.includes(inserido.id)) {
            salvarOrdemSetores(empresaAtual.id, [...ordem, inserido.id]);
          }
        }
        toast.success('Setor criado!');
      }
      setDialogOpen(false);
      fetchSetores();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar setor');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(s: Setor) {
    const { error } = await supabase
      .from('setores')
      .update({ ativo: !s.ativo })
      .eq('id', s.id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }
    toast.success(s.ativo ? 'Setor desativado' : 'Setor ativado');
    fetchSetores();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const totalAtivos = useMemo(() => setores.filter(s => s.ativo).length, [setores]);

  if (!acessoOk) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground gap-2">
        <Building2 className="w-6 h-6 opacity-60" />
        <p>Acesso restrito à Gerência ou superior.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {setores.length} {setores.length === 1 ? 'setor cadastrado' : 'setores cadastrados'}
            {' · '}
            {totalAtivos} ativo{totalAtivos !== 1 && 's'}
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Arraste um setor sobre outro para reordenar. A ordem é salva automaticamente.
          </p>
        </div>
        <Button size="sm" onClick={abrirCriar} className="gap-1.5">
          <Plus className="w-4 h-4" /> Novo Setor
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Carregando...
        </div>
      ) : setores.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <Building2 className="w-6 h-6 opacity-60" />
            <p>Nenhum setor cadastrado ainda.</p>
            <Button size="sm" variant="outline" onClick={abrirCriar} className="mt-1 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Criar primeiro setor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {setores.map(s => (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                draggable
                onDragStart={() => handleDragStart(s.id)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  handleDropOver(s.id);
                }}
                className={cn(
                  'group flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card',
                  'cursor-grab active:cursor-grabbing select-none',
                  'hover:border-primary/40 transition-colors',
                  !s.ativo && 'opacity-60',
                )}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground/50 flex-shrink-0" />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-foreground truncate">{s.nome}</p>
                    {s.descricao && (
                      <p className="text-xs text-muted-foreground truncate">{s.descricao}</p>
                    )}
                  </div>
                  {!s.ativo && (
                    <span className="text-[10px] uppercase tracking-wide font-semibold bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5 flex-shrink-0">
                      Inativo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7"
                    title={s.ativo ? 'Desativar setor' : 'Ativar setor'}
                    onClick={() => toggleAtivo(s)}
                  >
                    <Power className={cn('w-3.5 h-3.5', s.ativo ? 'text-success' : 'text-muted-foreground')} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7"
                    title="Editar setor"
                    onClick={() => abrirEditar(s)}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Dialog criar/editar setor ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" aria-describedby="modal-setor-aba-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              {editando ? 'Editar Setor' : 'Novo Setor'}
            </DialogTitle>
            <DialogDescription id="modal-setor-aba-desc" className="sr-only">
              {editando ? 'Editar dados do setor' : 'Criar novo setor'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Play 1"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição do setor (opcional)"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs font-medium">Setor ativo</Label>
              <Switch
                checked={form.ativo}
                onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
