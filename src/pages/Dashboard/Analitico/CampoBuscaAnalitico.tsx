/**
 * O campo de busca do Analítico — o mesmo desenho do filtro de Acordos, com o
 * X para limpar. A regra do que casa mora em `buscaAnalitico.ts`.
 */
import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function CampoBuscaAnalitico({
  valor, onMudar, placeholder, buscando = false, className,
}: {
  valor: string;
  onMudar: (v: string) => void;
  placeholder: string;
  /** Ida ao banco em andamento (só a busca do líder vai ao banco). */
  buscando?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={valor}
        onChange={e => onMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 rounded-lg pl-8 pr-8 text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {buscando ? (
        <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
      ) : valor && (
        <button
          type="button"
          onClick={() => onMudar('')}
          aria-label="Limpar busca"
          title="Limpar busca"
          className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
