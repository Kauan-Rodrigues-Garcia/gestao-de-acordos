/**
 * FiltroCidade — o recorte por cidade do RH (Quadro de Pessoal e Usuários).
 */
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Cidade } from '@/services/rh/quadroPessoal';

/**
 * O recorte por cidade, no topo do Quadro. Um botão por cidade, com a marca
 * (Birigui · BookPlay, Marília · PaguePlay) e quantas pessoas tem. Vale para
 * Setores, Equipes, Histórico e para os números — um filtro só, no mesmo lugar.
 */
export function FiltroCidade({
  cidades, porCidade, total, ativa, onTrocar,
}: {
  cidades: readonly Cidade[];
  porCidade: Map<string, number>;
  total: number;
  ativa: string | null;
  onTrocar: (chave: string | null) => void;
}) {
  const opcoes: { chave: string | null; nome: string; marca: string | null; n: number }[] = [
    { chave: null, nome: 'Todas as cidades', marca: null, n: total },
    ...cidades.map(c => ({ chave: c.chave, nome: c.nome, marca: c.marca, n: porCidade.get(c.chave) ?? 0 })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cidade">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <MapPin className="size-3.5" /> Cidade
      </span>
      {opcoes.map(o => {
        const ligado = ativa === o.chave;
        return (
          <button
            key={o.chave ?? '_todas'}
            type="button"
            aria-pressed={ligado}
            onClick={() => onTrocar(o.chave)}
            className={cn(
              'inline-flex h-11 items-center gap-2.5 rounded-xl border px-3.5 text-left transition',
              ligado
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
            )}
          >
            <span className="leading-tight">
              <span className="block text-sm font-semibold">{o.nome}</span>
              {o.marca && (
                <span className={cn('block text-[10px] font-medium uppercase tracking-wide', ligado ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  {o.marca}
                </span>
              )}
            </span>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
              ligado ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
            )}>
              {o.n.toLocaleString('pt-BR')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
