/**
 * pecas.tsx — as peças de tela comuns aos estilos da cena «Destaque»: a foto
 * com reserva e o bloco de animações de entrada.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * A foto do destaque, cobrindo a caixa. Sem foto (ou se ela falhar), o que o
 * estilo mandar em `reserva` — normalmente as iniciais na letra dele.
 */
export function FotoDestaque({ foto, reserva, style }: { foto: string | null; reserva: ReactNode; style?: CSSProperties }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [foto]);
  if (foto && !falhou) {
    return (
      <img src={foto} alt="" decoding="async" onError={() => setFalhou(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }} />
    );
  }
  return <>{reserva}</>;
}

/** As animações de entrada de um estilo, desligadas para quem pediu menos movimento. */
export function Animacoes({ css }: { css: string }) {
  const nomes = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]);
  return (
    <style>{`${css}
      @media (prefers-reduced-motion: reduce) {
        ${nomes.map(n => `@keyframes ${n} { from { opacity: 1; } to { opacity: 1; } }`).join('\n')}
      }`}</style>
  );
}
