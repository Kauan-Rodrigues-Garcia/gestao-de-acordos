/**
 * GrupoPermissoes — um bloco de permissões relacionadas.
 *
 * Serve as duas abas. Na «Por cargo» cada controle é um interruptor de dois
 * estados; na «Por pessoa» é um seletor de três. O componente não sabe qual das
 * duas está desenhando: quem passa o controle é a aba, via `renderControle`.
 *
 * O desenho é o mesmo dos blocos por aba — grade de cartões estreitos, com o
 * controle ao lado do rótulo. A lista de linhas largas que existia antes punha
 * o interruptor longe do texto que ele governa, e num monitor grande isso é
 * onde se erra o clique.
 */
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { PermissaoMeta, GrupoPermissao } from '@/lib/permissoes-catalogo';
import { CartaoPermissao, GradeDeCartoes } from './CartaoPermissao';

interface Props {
  grupo: GrupoPermissao;
  permissoes: PermissaoMeta[];
  /** Ações do cabeçalho do grupo — «ligar tudo / desligar tudo», por exemplo. */
  acoes?: React.ReactNode;
  /** Quantas permissões do grupo estão concedidas, para o resumo. */
  concedidas: number;
  renderControle: (p: PermissaoMeta) => React.ReactNode;
  /** A permissão está concedida? Pinta o cartão. Sem isto, todos ficam neutros. */
  ligada?: (p: PermissaoMeta) => boolean;
  /** Marca o cartão como alterado e ainda não salvo. */
  alterada?: (p: PermissaoMeta) => boolean;
  /** Texto da busca. Vazio mostra tudo. */
  filtro?: string;
  /** Cartões mais largos, para controle que ocupa espaço. */
  cartoesLargos?: boolean;
}

export function GrupoPermissoes({
  grupo, permissoes, acoes, concedidas, renderControle, ligada, alterada,
  filtro = '', cartoesLargos,
}: Props) {
  const [aberto, setAberto] = useState(true);

  const visiveis = filtro
    ? permissoes.filter(p =>
        p.label.toLowerCase().includes(filtro)
        || p.descricao.toLowerCase().includes(filtro))
    : permissoes;

  if (permissoes.length === 0) return null;
  if (filtro && visiveis.length === 0 && !grupo.toLowerCase().includes(filtro)) return null;

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/40 px-4 py-3">
        <button
          type="button"
          onClick={() => setAberto(v => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors"
          aria-expanded={aberto}
        >
          <ChevronDown className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            !aberto && '-rotate-90',
          )} />
          {grupo}
        </button>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {concedidas}/{permissoes.length}
        </span>
        <div className="ml-auto flex items-center gap-1.5">{acoes}</div>
      </header>

      {aberto && visiveis.length > 0 && (
        <GradeDeCartoes largas={cartoesLargos}>
          {visiveis.map(p => (
            <CartaoPermissao
              key={p.key}
              permissao={p}
              ligada={ligada?.(p) ?? false}
              alterada={alterada?.(p)}
              controle={renderControle(p)}
            />
          ))}
        </GradeDeCartoes>
      )}
    </section>
  );
}
