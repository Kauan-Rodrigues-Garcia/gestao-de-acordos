/**
 * GrupoPermissoes — um bloco de permissões relacionadas.
 *
 * Serve as duas abas. Na «Por cargo» cada linha é um interruptor de dois
 * estados; na «Por pessoa» é um seletor de três. O componente não sabe qual
 * das duas está desenhando: quem passa o controle é a aba, via `renderControle`.
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { PermissaoMeta, GrupoPermissao } from '@/lib/permissoes-catalogo';

interface Props {
  grupo: GrupoPermissao;
  permissoes: PermissaoMeta[];
  /** Ações do cabeçalho do grupo — «ligar tudo / desligar tudo», por exemplo. */
  acoes?: React.ReactNode;
  /** Quantas permissões do grupo estão concedidas, para o resumo fechado. */
  concedidas: number;
  renderControle: (p: PermissaoMeta) => React.ReactNode;
  /** Marca a linha como alterada e ainda não salva. */
  alterada?: (p: PermissaoMeta) => boolean;
}

export function GrupoPermissoes({
  grupo, permissoes, acoes, concedidas, renderControle, alterada,
}: Props) {
  const [aberto, setAberto] = useState(true);

  if (permissoes.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
        <button
          type="button"
          onClick={() => setAberto(v => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
          aria-expanded={aberto}
        >
          {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {grupo}
        </button>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {concedidas} de {permissoes.length}
        </span>
        <div className="ml-auto flex items-center gap-1.5">{acoes}</div>
      </header>

      {aberto && (
        <ul className="divide-y divide-border/60">
          {permissoes.map(p => (
            <li
              key={p.key}
              className={cn(
                'flex items-start gap-4 px-4 py-3',
                alterada?.(p) && 'bg-amber-500/5 border-l-2 border-l-amber-500',
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight">
                  {p.label}
                  {p.tenants && (
                    <span className="ml-2 text-[10px] font-mono uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
                      {p.tenants.join(' · ')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{p.descricao}</p>
              </div>
              <div className="shrink-0 pt-0.5">{renderControle(p)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
