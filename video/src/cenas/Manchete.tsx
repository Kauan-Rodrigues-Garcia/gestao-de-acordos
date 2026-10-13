// A frase grande no topo de cada cena (reforça a narração).
// Troca palavra por palavra: a velha sobe e desfoca, a nova sobe e assenta.

import { useCurrentFrame } from 'remotion';
import { entrada, ms, saida } from '../movimento';
import { COR, FONTE } from '../tema';

export type ItemManchete = { de: number; ate: number; texto: string };

/** `*assim*` marca o trecho em degradê. */
function partes(texto: string) {
  return texto.split(/(\*[^*]+\*)/).filter(Boolean).flatMap((p) => {
    const destaque = p.startsWith('*');
    return p
      .replace(/\*/g, '')
      .split(' ')
      .filter(Boolean)
      .map((palavra) => ({ palavra, destaque }));
  });
}

export const Manchete: React.FC<{ itens: ItemManchete[]; y?: number }> = ({ itens, y = 78 }) => {
  const f = useCurrentFrame();
  return (
    <>
      {itens.map((it) => {
        if (f < it.de || f >= it.ate + ms(400)) return null;
        const ps = partes(it.texto);
        return (
          <div
            key={it.de}
            style={{
              position: 'absolute',
              top: y,
              width: 1920,
              textAlign: 'center',
              fontFamily: FONTE,
              fontSize: 54,
              fontWeight: 800,
              letterSpacing: -1.4,
              color: COR.texto,
              ...(f >= it.ate ? saida(f, it.ate, 300) : {}),
            }}
          >
            {ps.map((p, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  marginRight: 16,
                  ...entrada(f, it.de, i, { passoMs: 70, deslocY: 22, duracaoMs: 520 }),
                  ...(p.destaque
                    ? { background: 'linear-gradient(120deg, #4ade80, #5cc8f5)', WebkitBackgroundClip: 'text', color: 'transparent' }
                    : {}),
                }}
              >
                {p.palavra}
              </span>
            ))}
          </div>
        );
      })}
    </>
  );
};
