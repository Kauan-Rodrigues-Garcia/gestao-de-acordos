/**
 * AdminTags — Gerenciamento de tags visuais por empresa.
 * Admins criam, editam e excluem tags com nome + cor personalizada.
 */
import { useState } from 'react';
import { Plus, Pencil, Trash2, Tag, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useEmpresaTags } from '@/hooks/useEmpresaTags';
import { createTag, updateTag, deleteTag } from '@/services/tags.service';
import { AcordoTag } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// Paleta de cores harmonizada com a estética do projeto
const COR_PALETTE = [
  { label: 'Índigo',   hex: '#6366f1' },
  { label: 'Violeta',  hex: '#8b5cf6' },
  { label: 'Roxo',     hex: '#7c3aed' },
  { label: 'Fúcsia',   hex: '#d946ef' },
  { label: 'Rosa',     hex: '#ec4899' },
  { label: 'Rose',     hex: '#f43f5e' },
  { label: 'Vermelho', hex: '#ef4444' },
  { label: 'Laranja',  hex: '#f97316' },
  { label: 'Âmbar',    hex: '#f59e0b' },
  { label: 'Amarelo',  hex: '#eab308' },
  { label: 'Lima',     hex: '#84cc16' },
  { label: 'Verde',    hex: '#22c55e' },
  { label: 'Esmeralda',hex: '#10b981' },
  { label: 'Teal',     hex: '#14b8a6' },
  { label: 'Ciano',    hex: '#06b6d4' },
  { label: 'Celeste',  hex: '#0ea5e9' },
  { label: 'Azul',     hex: '#3b82f6' },
  { label: 'Slate',    hex: '#64748b' },
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COR_PALETTE.map(({ label, hex }) => (
        <button
          key={hex}
          type="button"
          title={label}
          onClick={() => onChange(hex)}
          className={cn(
            'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
            value === hex ? 'border-foreground scale-110 shadow-md' : 'border-transparent',
          )}
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}

function TagPreview({ nome, cor }: { nome: string; cor: string }) {
  if (!nome.trim()) return null;
  return (
    <span
      className="inline-flex items-center gap-1 font-bold uppercase rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap"
      style={{
        backgroundColor: `${cor}22`,
        color: cor,
        borderColor: `${cor}55`,
      }}
    >
      <Tag className="w-3 h-3" /> {nome}
    </span>
  );
}

interface TagFormProps {
  inicial?: AcordoTag;
  onSalvo: () => void;
  onCancel?: () => void;
}

function TagForm({ inicial, onSalvo, onCancel }: TagFormProps) {
  const { empresa } = useEmpresa();
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [cor, setCor]   = useState(inicial?.cor ?? '#6366f1');
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!nome.trim()) { toast.error('Nome da tag é obrigatório'); return; }
    if (!empresa?.id) return;
    setSaving(true);
    try {
      if (inicial) {
        const { ok, error } = await updateTag(inicial.id, nome, cor);
        if (!ok) { toast.error(error ?? 'Erro ao atualizar tag'); return; }
        toast.success('Tag atualizada!');
      } else {
        const { ok, error } = await createTag(empresa.id, nome, cor);
        if (!ok) { toast.error(error ?? 'Erro ao criar tag'); return; }
        toast.success('Tag criada!');
      }
      onSalvo();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
      <div className="space-y-1">
        <Label className="text-xs font-medium">Nome da Tag</Label>
        <div className="flex items-center gap-2">
          <Input
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: Urgente, VIP, Cobrança..."
            className="h-8 text-xs"
            maxLength={30}
          />
          <TagPreview nome={nome} cor={cor} />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">Cor</Label>
        <ColorPicker value={cor} onChange={setCor} />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="h-7 text-xs gap-1.5" onClick={salvar} disabled={saving}>
          <Check className="w-3 h-3" />
          {inicial ? 'Salvar' : 'Criar tag'}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AdminTags() {
  const { tags, loading, refetch } = useEmpresaTags();
  const [criando, setCriando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  async function excluir(id: string) {
    setExcluindoId(id);
    try {
      const { ok, error } = await deleteTag(id);
      if (!ok) { toast.error(error ?? 'Erro ao excluir tag'); return; }
      toast.success('Tag removida!');
      refetch();
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" /> Tags de Acordos
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tags são rótulos visuais para diferenciar tipos de acordos. Visíveis para todos os usuários.
          </p>
        </div>
        {!criando && (
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setCriando(true)}>
            <Plus className="w-3 h-3" /> Nova Tag
          </Button>
        )}
      </div>

      {/* Formulário de criação */}
      {criando && (
        <TagForm
          onSalvo={() => { setCriando(false); refetch(); }}
          onCancel={() => setCriando(false)}
        />
      )}

      {/* Lista de tags */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Tags existentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhuma tag criada ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {tags.map(tag => (
                <div key={tag.id}>
                  {editandoId === tag.id ? (
                    <TagForm
                      inicial={tag}
                      onSalvo={() => { setEditandoId(null); refetch(); }}
                      onCancel={() => setEditandoId(null)}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <span
                        className="inline-flex items-center gap-1 font-bold uppercase rounded-full border px-2.5 py-0.5 text-xs"
                        style={{
                          backgroundColor: `${tag.cor}22`,
                          color: tag.cor,
                          borderColor: `${tag.cor}55`,
                        }}
                      >
                        <Tag className="w-3 h-3" /> {tag.nome}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setEditandoId(tag.id)}
                          title="Editar tag"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 hover:text-destructive"
                          onClick={() => excluir(tag.id)}
                          disabled={excluindoId === tag.id}
                          title="Excluir tag"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
