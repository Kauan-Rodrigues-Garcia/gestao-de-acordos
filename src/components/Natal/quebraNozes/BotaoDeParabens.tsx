/** O botão de parabéns embaixo dos cartões; quem está nos cartões vê um aviso no lugar dele. */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { Destaque } from './diretor';
import { TEXTO_DE_NOVO, TEXTO_DO_DESTAQUE, textoDoBotao } from './regrasDosParabens';

export const BotaoDeParabens = memo(function BotaoDeParabens({ destaques, souDestaque, noAr, jaEnviou, recarregando, aoClicar }: {
  destaques: readonly Destaque[];
  souDestaque: boolean;
  noAr: boolean;
  jaEnviou: boolean;
  recarregando: boolean;
  aoClicar: () => void;
}) {
  return (
    <div className={cn('qn-parabens-c', noAr && 'no-ar')}>
      {souDestaque
        ? <span className="qn-parabens-aviso" role="status">🎉 {TEXTO_DO_DESTAQUE}</span>
        : (
          // `aria-disabled`, não `disabled`: o foco do teclado continua no botão durante a recarga.
          <button type="button" className={cn('qn-parabens-botao', jaEnviou && 'ja-enviou', recarregando && 'recarregando')} aria-disabled={recarregando} onClick={aoClicar}>
            <span>🎉 {jaEnviou ? TEXTO_DE_NOVO : textoDoBotao(destaques)}</span>
          </button>
        )}
    </div>
  );
});
