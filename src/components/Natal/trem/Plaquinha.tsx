import type { ReactNode } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ligarSonsDoTrem, useSonsDoTrem } from './sons';

/**
 * A plaquinha do trilho (Cleber, 05/11/2026): no lugar do card de aviso que
 * flutuava em cima da faixa, uma placa de verdade fincada ao lado do trilho,
 * no estilo dos enfeites dele — poste de madeira com neve e laço, um braço
 * com lampião na ponta e a tábua verde pendurada por duas correntinhas,
 * parada e reta (inclinada, a letra embaça); quem balança é o lampião.
 *
 * Duas linhas: a pequena em cima («O trem passa aqui em») e a grande embaixo
 * («2:14»). Não diz em que aba o trem está, só quando ele chega aqui. O trem
 * passa NA FRENTE da placa (a camada dele fica por cima da faixa).
 *
 * O sininho pendurado embaixo da tábua liga e desliga os sons do trem.
 * `perto`: o trem está chegando — o lampião pisca; `aqui`: ele está passando —
 * o lampião fica aceso e a tábua treme um tiquinho.
 *
 * Mede 184 × 92: plantada com o pé no trilho, cabe na faixa de 116 px.
 */
export const LARGURA_PLAQUINHA = 184;

export function Plaquinha({ linha, grande, perto = false, aqui = false, className, style }: {
  linha: ReactNode;
  grande: ReactNode;
  perto?: boolean;
  aqui?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ligados = useSonsDoTrem();
  return (
    // `data-trem-reserva`: o trilho não põe casinha, árvore nem enfeite na frente da placa.
    <div data-trem-reserva className={cn('nt-plaquinha', perto && 'perto', aqui && 'aqui', className)} style={style}>
      <svg className="nt-plaquinha-poste" viewBox="0 0 184 92" width={184} height={92} aria-hidden="true">
        {/* o poste, com o pé num montinho de neve */}
        <rect x={9} y={6} width={7} height={84} rx={2} fill="#7A5236" />
        <rect x={9} y={6} width={2.4} height={84} fill="#9A6A43" />
        <path d="M0 92 Q4 84 12 86 Q18 82 25 92 Z" fill="#FFFFFF" />
        {/* o braço, com a mão-francesa */}
        <rect x={9} y={8} width={173} height={5} rx={2} fill="#7A5236" />
        <rect x={9} y={8} width={173} height={1.6} fill="#9A6A43" />
        <path d="M16 13 L32 13 L16 29 Z" fill="#6B472E" />
        {/* neve no alto do poste e do braço */}
        <path d="M7 9 Q9 2 13 5 Q16 0 19 6 Q32 2 46 7 Q60 2 74 7 Q88 3 102 7 Q116 2 130 7 Q144 3 158 7 Q170 3 183 8 L183 10 L7 10 Z" fill="#FFFFFF" />
        {/* o laço vermelho no poste */}
        <path d="M12.5 40 C6 34 2 40 6 43 C9 45 11 43 12.5 40 Z M12.5 40 C19 34 23 40 19 43 C16 45 14 43 12.5 40 Z" fill="#D6403A" />
        <path d="M11.5 41 L8.5 50 L11 49 L12.5 52 Z M13.5 41 L16.5 50 L14 49 L12.5 52 Z" fill="#A92F35" />
        <circle cx={12.5} cy={40.5} r={2} fill="#A92F35" />
        {/* o lampião, pendurado na ponta do braço */}
        <g className="nt-plaquinha-lampiao" transform="translate(14 0)">
          <rect x={160.4} y={13} width={1.2} height={4.5} fill="#3A2F3B" />
          <circle className="nt-plaquinha-luz" cx={161} cy={24} r={8.5} fill="#FFD98A" />
          <path d="M156.6 18 H165.4 L164.2 29.5 H157.8 Z" fill="#F2B544" stroke="#3A2F3B" strokeWidth={1.2} strokeLinejoin="round" />
          <rect x={155.6} y={16.6} width={10.8} height={2.5} rx={1.2} fill="#3A2F3B" />
          <rect x={157.3} y={29.2} width={7.4} height={2.1} rx={1} fill="#3A2F3B" />
        </g>
      </svg>

      {/* A tábua, pendurada por duas correntinhas: balança de leve. */}
      <div className="nt-plaquinha-pendurada">
        <span className="nt-plaquinha-corrente esq" aria-hidden="true" />
        <span className="nt-plaquinha-corrente dir" aria-hidden="true" />
        <div className="nt-plaquinha-tabua" role="status">
          <svg className="nt-plaquinha-azevinho" viewBox="-14 -9 28 18" width={22} height={14} aria-hidden="true">
            <path d="M0 0 C-4 -6 -11 -5 -13 1 C-9 0 -6 3 0 0 Z" fill="#2E7D32" stroke="#1B5E20" strokeWidth={0.7} />
            <path d="M0 0 C4 -6 11 -5 13 1 C9 0 6 3 0 0 Z" fill="#388E3C" stroke="#1B5E20" strokeWidth={0.7} />
            <circle cx={-2} cy={-1.4} r={2.3} fill="#D32F2F" /><circle cx={2} cy={-1.4} r={2.3} fill="#E53935" /><circle cx={0} cy={1.6} r={2.3} fill="#C62828" />
          </svg>
          <span className="nt-plaquinha-linha">
            <svg viewBox="0 0 20 12" width={14} height={8.5} aria-hidden="true">
              <rect x={1} y={3} width={10} height={6} rx={1.4} fill="currentColor" />
              <rect x={9} y={1} width={6} height={8} rx={1.4} fill="currentColor" />
              <rect x={2.5} y={0} width={2.4} height={3.4} rx={0.6} fill="currentColor" />
              <path d="M15 9 L19 9 L17 6 Z" fill="currentColor" />
              <circle cx={4} cy={10} r={1.7} fill="#F2B544" /><circle cx={12} cy={10} r={1.7} fill="#F2B544" />
            </svg>
            {linha}
          </span>
          <span className="nt-plaquinha-grande">{grande}</span>
        </div>
        {/* O sininho: liga e desliga os sons do trem. */}
        <button
          type="button"
          className={cn('nt-plaquinha-sino', !ligados && 'mudo')}
          onClick={() => ligarSonsDoTrem(!ligados)}
          title={ligados ? 'Desligar os sons do trem' : 'Ligar os sons do trem'}
          aria-label={ligados ? 'Desligar os sons do trem' : 'Ligar os sons do trem'}
        >
          {ligados ? <Bell className="h-2.5 w-2.5" /> : <BellOff className="h-2.5 w-2.5" />}
        </button>
      </div>
    </div>
  );
}
