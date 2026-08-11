/**
 * IconeCategoria.tsx — o tile colorido que abre toda notificação.
 *
 * O ícone e a cor saem de `notificacoes-tipo.ts`, que é lógica pura e não
 * importa React. Este arquivo é a ponte: resolve o NOME do ícone para o
 * componente do lucide.
 *
 * O mapa é explícito, e não `import * as Icons`: o import estrela puxa a
 * biblioteca inteira para o bundle (mais de mil ícones) porque o empacotador
 * não consegue provar quais são usados.
 */
import {
  MessageSquare, Headset, Zap, Link2, FileText, Upload, Info,
  type LucideIcon,
} from 'lucide-react';
import {
  CATEGORIA_ICONE, CATEGORIA_COR, type CategoriaNotificacao,
} from '@/lib/notificacoes-tipo';
import { cn } from '@/lib/utils';

const ICONES: Record<string, LucideIcon> = {
  MessageSquare, Headset, Zap, Link2, FileText, Upload, Info,
};

/** O componente do ícone de uma categoria. `Info` cobre o que faltar. */
export function iconeDaCategoria(categoria: CategoriaNotificacao): LucideIcon {
  return ICONES[CATEGORIA_ICONE[categoria]] ?? Info;
}

/**
 * Tile quadrado com o ícone da categoria.
 *
 * `ring` em vez de `border`: a borda entraria no cálculo do tamanho e
 * desalinharia o tile de 1 px em relação ao texto ao lado.
 */
export function IconeCategoria({
  categoria, tamanho = 'md', className,
}: {
  categoria: CategoriaNotificacao;
  tamanho?: 'sm' | 'md';
  className?: string;
}) {
  const Icone = iconeDaCategoria(categoria);
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center justify-center rounded-lg ring-1',
        CATEGORIA_COR[categoria],
        tamanho === 'sm' ? 'w-7 h-7' : 'w-9 h-9',
        className,
      )}
      aria-hidden
    >
      <Icone className={tamanho === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
    </span>
  );
}
