/**
 * EnfeiteHalloween — o que o tema `halloween` põe por cima do cartaz.
 *
 * Teia no canto e morcegos voando devagar (a abóbora saiu a pedido do Cleber,
 * 06/10/2026). Só enfeite: fica
 * atrás do texto, não recebe clique e some para o leitor de tela. Com
 * «reduzir movimento» ligado os morcegos param no lugar.
 *
 * Desenho próprio, e não os do Halloween do site (`components/Halloween`):
 * aqueles dependem do contexto e do CSS do tema do site, que pode estar
 * desligado enquanto a campanha estiver no ar.
 */
import { useEffect } from 'react';
import { carregarFonte } from '@/components/Halloween/fonte';

/** A fonte do título no tema: a Creepster, que já mora em `public/fonts`. */
export const FONTE_TITULO_HALLOWEEN = "'Creepster', ui-sans-serif, system-ui, sans-serif";

/** Declara a Creepster na primeira vez que um cartaz de Halloween aparece. */
export function useFonteHalloween(ativo: boolean) {
  useEffect(() => { if (ativo) carregarFonte(); }, [ativo]);
}

function Morcego({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 64 28" className={className} style={style} aria-hidden="true">
      <path
        fill="currentColor"
        d="M32 9c1.4-3 2.4-4.6 3.2-5.4.2 1.6.4 3 .9 4 3.3-3.4 9.2-5.3 14.4-4.2-2.2 1.4-3.6 3.4-3.9 5.8 3.6-1.6 8.4-1.6 12 .6-3.4.3-6.3 2.2-7.6 5.2-2.9-1.2-6.3-.9-8.9 1-1.6-1.6-4-2.4-6.3-2-1.2 2.5-2.6 4.6-3.8 6.2-1.2-1.6-2.6-3.7-3.8-6.2-2.3-.4-4.7.4-6.3 2-2.6-1.9-6-2.2-8.9-1-1.3-3-4.2-4.9-7.6-5.2 3.6-2.2 8.4-2.2 12-.6-.3-2.4-1.7-4.4-3.9-5.8 5.2-1.1 11.1.8 14.4 4.2.5-1 .7-2.4.9-4 .8.8 1.8 2.4 3.2 5.4Z"
      />
    </svg>
  );
}

function Teia({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.1">
      <path d="M0 0 L120 120 M0 0 L60 120 M0 0 L120 60 M0 0 L0 120 M0 0 L120 0" />
      <path d="M0 24 Q14 18 24 0" />
      <path d="M0 48 Q22 40 34 34 Q42 22 48 0" />
      <path d="M0 76 Q30 66 50 50 Q66 32 76 0" />
      <path d="M0 104 Q40 90 68 68 Q90 42 104 0" />
      <path d="M96 96 L96 118" strokeWidth="0.9" />
      <circle cx="96" cy="120" r="3.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const MORCEGOS = [
  { top: '14%', left: '58%', tamanho: 30, atraso: '0s',   duracao: '7s'  },
  { top: '30%', left: '72%', tamanho: 20, atraso: '1.8s', duracao: '9s'  },
  { top: '8%',  left: '84%', tamanho: 24, atraso: '3.1s', duracao: '8s'  },
  { top: '62%', left: '46%', tamanho: 16, atraso: '0.9s', duracao: '10s' },
];

export function EnfeiteHalloween() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <Teia className="absolute -left-1 -top-1 h-24 w-24 text-violet-400/35 dark:text-violet-300/25 sm:h-32 sm:w-32" />
      {MORCEGOS.map((m, i) => (
        <Morcego
          key={i}
          className="desafio-morcego absolute text-violet-900/40 dark:text-violet-200/30"
          style={{
            top: m.top, left: m.left, width: m.tamanho,
            animationDelay: m.atraso, animationDuration: m.duracao,
          }}
        />
      ))}
      <style>{`
        @keyframes desafio-voo {
          0%, 100% { transform: translate(0, 0) scaleY(1); }
          25%      { transform: translate(-14px, -8px) scaleY(.7); }
          50%      { transform: translate(-6px, 6px) scaleY(1); }
          75%      { transform: translate(10px, -4px) scaleY(.7); }
        }
        .desafio-morcego { animation: desafio-voo 8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .desafio-morcego { animation: none; }
        }
      `}</style>
    </div>
  );
}

export default EnfeiteHalloween;
