/**
 * PlayerSeFoi — o botão do som ambiente para quem não é super_admin, com o
 * player desligado (23/10/2026, temporário, pedido do Cleber).
 *
 * O botão fica no mesmo lugar; clicar abre só uma lápide «RIP». O motor não é
 * montado (`iniciarSessao` nunca roda), então não há música nenhuma. O player
 * do super_admin segue inteiro, e nada do player foi apagado: para religar,
 * volte o `BotaoSomAmbiente` para todos no `Layout`.
 */
import { Headphones } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function PlayerSeFoi() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Som ambiente"
          aria-label="Som ambiente"
          data-som-ambiente-botao
        >
          <Headphones className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 border-orange-500/30 bg-zinc-950 p-4 text-center text-zinc-100">
        <svg viewBox="0 0 120 110" className="mx-auto h-28 w-32" aria-hidden>
          {/* Lua */}
          <circle cx="98" cy="18" r="9" fill="#fde68a" opacity="0.85" />
          {/* Lápide */}
          <path d="M30 96 V42 a30 30 0 0 1 60 0 V96 Z" fill="#52525b" stroke="#27272a" strokeWidth="3" />
          <path d="M37 92 V44 a23 23 0 0 1 46 0 V92" fill="none" stroke="#71717a" strokeWidth="1.5" opacity="0.6" />
          <text x="60" y="62" textAnchor="middle" fontSize="20" fontWeight="800" fill="#e4e4e7" fontFamily="Georgia, serif">RIP</text>
          <text x="60" y="78" textAnchor="middle" fontSize="7" fill="#a1a1aa" fontFamily="Georgia, serif">PLAYER</text>
          {/* Rachadura */}
          <path d="M72 30 l-5 8 l4 4 l-6 9" fill="none" stroke="#27272a" strokeWidth="1.5" />
          {/* Chão e abóbora */}
          <path d="M8 96 Q60 88 112 96 V104 H8 Z" fill="#3f3f46" />
          <ellipse cx="98" cy="94" rx="9" ry="7" fill="#f97316" />
          <path d="M98 87 v-3" stroke="#65a30d" strokeWidth="2" />
          <path d="M94 93 l2 -2 l2 2 M100 93 l2 -2 l2 2 M94 97 q4 3 8 0" stroke="#431407" strokeWidth="1.2" fill="none" />
        </svg>
        <p className="mt-2 text-sm font-semibold text-orange-400">Infelizmente o player se foi…</p>
        <p className="mt-1 text-xs text-zinc-400">Descanse em paz. A música não toca mais por aqui.</p>
      </PopoverContent>
    </Popover>
  );
}
