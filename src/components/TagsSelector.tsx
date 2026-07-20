/**
 * TagsSelector — multi-select de tags visuais para acordos.
 * Exibe as tags disponíveis da empresa como badges clicáveis.
 * Tags selecionadas ficam destacadas; clicar alterna seleção.
 */
import { useState, type CSSProperties } from 'react';
import { ChevronDown, Tag, X } from 'lucide-react';
import { AcordoTag } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type TagBasica = Pick<AcordoTag, 'id' | 'nome' | 'cor'>;

interface TagsSelectorProps {
  tags: TagBasica[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  size?: 'sm' | 'xs';
}

function TagBadge({
  tag,
  selected,
  onClick,
  size = 'xs',
}: {
  tag: TagBasica;
  selected: boolean;
  onClick: () => void;
  size?: 'sm' | 'xs';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold uppercase transition-all',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[9px]',
        selected
          ? 'ring-2 ring-offset-1'
          : 'opacity-50 hover:opacity-80',
      )}
      style={
        (selected
          ? {
              backgroundColor: `${tag.cor}22`,
              color: tag.cor,
              borderColor: `${tag.cor}66`,
              ringColor: tag.cor,
            }
          : {
              backgroundColor: 'transparent',
              color: tag.cor,
              borderColor: `${tag.cor}44`,
            }) as CSSProperties
      }
      title={selected ? `Remover tag ${tag.nome}` : `Adicionar tag ${tag.nome}`}
    >
      {tag.nome}
      {selected && <X className="w-2.5 h-2.5 shrink-0" />}
    </button>
  );
}

export function TagsSelector({ tags, selectedIds, onChange, disabled = false, size = 'xs' }: TagsSelectorProps) {
  const [open, setOpen] = useState(false);

  if (!tags.length) return null;

  function toggle(id: string) {
    if (disabled) return;
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(s => s !== id)
        : [...selectedIds, id],
    );
  }

  const selectedTags = tags.filter(t => selectedIds.includes(t.id));

  return (
    <div className="space-y-1.5">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:border-primary/50 transition-colors',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
          <Tag className="w-3 h-3 shrink-0 text-muted-foreground/60" />
          {selectedTags.length === 0 ? (
            <span className="text-muted-foreground/60">Selecionar tags...</span>
          ) : (
            selectedTags.map(t => (
              <span
                key={t.id}
                className="inline-flex items-center gap-0.5 font-semibold uppercase rounded-full px-1.5 py-0.5 text-[9px] border"
                style={{
                  backgroundColor: `${t.cor}22`,
                  color: t.cor,
                  borderColor: `${t.cor}55`,
                }}
              >
                {t.nome}
              </span>
            ))
          )}
        </span>
        <ChevronDown className={cn('w-3 h-3 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && !disabled && (
        <div className="rounded-md border border-border bg-popover shadow-md p-2.5 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
            Clique para selecionar
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map(tag => (
              <TagBadge
                key={tag.id}
                tag={tag}
                selected={selectedIds.includes(tag.id)}
                onClick={() => toggle(tag.id)}
                size={size}
              />
            ))}
          </div>
          {selectedIds.length > 0 && (
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => onChange([])}
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}
