import { X } from 'lucide-react';
import { AvatarChat } from './comum';

interface Props {
  nome: string;
  foto: string | null;
  mensagem: string;
  onAbrir: () => void;
  onFechar: () => void;
}

export function NotificacaoMensagem({ nome, foto, mensagem, onAbrir, onFechar }: Props) {
  return (
    <div className="relative flex w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
      <button
        type="button"
        onClick={onAbrir}
        className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 pr-9 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`Abrir conversa com ${nome}`}
      >
        <AvatarChat nome={nome} foto={foto} tamanho={42} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{nome}</span>
          <span className="mt-0.5 block line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
            {mensagem}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onFechar}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Fechar notificação do chat"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
