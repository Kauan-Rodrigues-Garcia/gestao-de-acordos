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

/** "Ana Paula Souza" → "AP". Iniciais para o avatar sem foto. */
function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

/**
 * A cara da notificação: a FOTO de quem escreveu quando é conversa, o tile da
 * categoria em todo o resto.
 *
 * Numa mensagem de chat, reconhecer quem falou é a primeira coisa que se faz —
 * é assim que qualquer mensageiro apresenta o aviso. Já numa exclusão do Pix, a
 * cara de quem apagou importa menos que o ícone dizendo de que assunto se
 * trata, e por isso a troca não vale para todas as categorias (ver
 * `apresentacaoDaNotificacao`).
 *
 * O redondo também comunica: pessoa é círculo, assunto é quadrado arredondado.
 */
export function CaraDaNotificacao({
  categoria, comFoto, autorNome, autorFoto, tamanho = 'md', className,
}: {
  categoria: CategoriaNotificacao;
  /** `usarFotoDoAutor` da apresentação. */
  comFoto: boolean;
  autorNome?: string | null;
  autorFoto?: string | null;
  tamanho?: 'sm' | 'md';
  className?: string;
}) {
  if (!comFoto) {
    return <IconeCategoria categoria={categoria} tamanho={tamanho} className={className} />;
  }

  const lado = tamanho === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center justify-center rounded-full overflow-hidden',
        'ring-1 ring-border bg-muted',
        lado, className,
      )}
      // O nome já está escrito ao lado, em destaque: repeti-lo aqui faria o
      // leitor de tela anunciar a mesma pessoa duas vezes.
      aria-hidden
    >
      {autorFoto ? (
        <img src={autorFoto} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className={cn(
          'font-bold text-muted-foreground',
          tamanho === 'sm' ? 'text-[9px]' : 'text-[11px]',
        )}>
          {iniciais(autorNome)}
        </span>
      )}
    </span>
  );
}
