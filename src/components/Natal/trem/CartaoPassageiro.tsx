import { createPortal } from 'react-dom';
import { AvatarChat } from '@/components/Chat/comum';
import type { Sorteado } from './passageiros';

/**
 * O cartãozinho de Natal de um passageiro: aparece ao passar o mouse na foto
 * (no trem ou na fila da estação). Fica no `body`, por cima de tudo, perto do
 * ponto `x, y` da tela.
 */
export function CartaoPassageiro({ pessoa, x, y, legenda }: { pessoa: Sorteado; x: number; y: number; legenda: string }) {
  const largura = 236;
  const esquerda = Math.min(window.innerWidth - largura - 12, Math.max(12, x - largura / 2));
  const acima = y > 190;
  return createPortal(
    <div
      className="nt-cartao-passageiro"
      style={{ left: esquerda, top: acima ? y - 14 : y + 18, width: largura, transform: acima ? 'translateY(-100%)' : undefined }}
      role="tooltip"
    >
      <svg className="nt-cartao-neve" viewBox="0 0 236 18" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 0 H236 V7 Q226 15 214 9 Q203 16 190 9 Q178 17 164 10 Q151 16 138 9 Q124 17 110 10 Q97 16 84 9 Q71 17 58 10 Q45 16 32 9 Q18 16 0 9 Z" fill="#FFFFFF" />
      </svg>
      <div className="flex items-center gap-3 px-3.5 pb-3 pt-4">
        <AvatarChat nome={pessoa.nome} foto={pessoa.foto} tamanho={52} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">{pessoa.nome}</p>
          <p className="mt-0.5 truncate text-xs opacity-80">{pessoa.setor ?? 'Sem setor'}</p>
          <p className="mt-1.5 text-[10.5px] font-medium uppercase tracking-wide opacity-70">{legenda}</p>
        </div>
      </div>
      <span className="nt-cartao-azevinho" aria-hidden="true">
        <svg viewBox="0 0 28 16" width="28" height="16">
          <ellipse cx="7" cy="9" rx="6.5" ry="3" fill="#3F9A5B" transform="rotate(-18 7 9)" />
          <ellipse cx="21" cy="9" rx="6.5" ry="3" fill="#3F9A5B" transform="rotate(18 21 9)" />
          <circle cx="12" cy="10" r="2.6" fill="#D6403A" />
          <circle cx="16" cy="10" r="2.6" fill="#D6403A" />
          <circle cx="14" cy="6.6" r="2.6" fill="#D6403A" />
        </svg>
      </span>
    </div>,
    document.body,
  );
}
