// O «recado» que conta a história (Cleber, 28/10: o card branco grande no
// alto não agradou — «algo mais bonitinho, mais otimizado»). Agora é uma
// pílula escura, compacta, que abre do centro para os lados (como a ilha de
// um celular): o ícone num círculo colorido, o olho pequeno e a frase, que
// entra palavra por palavra. Fecha voltando para o centro.
//
// Tudo pelo quadro, sem `filter` (nada de desfoque na saída).

import { useCurrentFrame } from 'remotion';
import { ACELERA, entre, mola, ms } from '../movimento';

export type Recado = {
  de: number; ate: number; olho?: string; texto: string; icone?: React.ReactNode;
  /** Outra altura só para este (quando o alto da tela já tem um aviso do próprio palco). */
  topo?: number;
  /** A cor do círculo do ícone e do olho. Padrão: o laranja do Halloween. */
  cor?: string;
};

const MOLA_ILHA = { mass: 0.9, stiffness: 150, damping: 18, overshootClamping: false };

export const Recados: React.FC<{ itens: Recado[]; topo?: number }> = ({ itens, topo = 96 }) => {
  const f = useCurrentFrame();
  return (
    <>
      {itens.filter(r => f >= r.de && f < r.ate + ms(450)).map((r, i) => {
        const cor = r.cor ?? '#ff8a3d';
        const abre = mola(f, r.de, MOLA_ILHA);
        // Fecha inteira de uma vez (a pílula e o texto juntos), voltando um pouco para o centro.
        const fecha = entre(f, r.ate, r.ate + ms(320), 0, 1, ACELERA);
        const aberta = Math.min(1, abre) * (1 - 0.35 * fecha);
        // A pílula abre do centro: o recorte vai de uma bolinha à largura toda.
        const lado = (1 - aberta) * 50;
        const conteudo = entre(f, r.de + ms(140), r.de + ms(360), 0, 1);
        const palavras = r.texto.split(' ');
        return (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: r.topo ?? topo, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 18, padding: '12px 34px 12px 12px', borderRadius: 999,
              background: 'rgba(16, 14, 22, 0.94)', color: '#fff', maxWidth: 1500,
              boxShadow: `0 22px 50px -18px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.07), 0 0 0 6px ${cor}14`,
              clipPath: `inset(0 ${lado}% 0 ${lado}% round 999px)`, opacity: 1 - fecha,
              transform: `translateY(${(1 - Math.min(1, abre)) * -18 + fecha * -8}px) scale(${0.9 + 0.1 * Math.min(1.04, abre)})`,
            }}>
              {r.icone && (
                <div style={{
                  width: 56, height: 56, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 30, lineHeight: 1,
                  background: `radial-gradient(circle at 30% 25%, ${cor}, ${cor}99)`, boxShadow: `0 0 22px ${cor}66`,
                  transform: `scale(${0.6 + 0.4 * conteudo}) rotate(${(1 - conteudo) * -25}deg)`, opacity: conteudo,
                }}>{r.icone}</div>
              )}
              <div style={{ display: 'grid', gap: 2, opacity: conteudo > 0 ? 1 : 0 }}>
                {r.olho && (
                  <span style={{ font: '800 15px Nunito, Inter, sans-serif', letterSpacing: '0.16em', textTransform: 'uppercase', color: cor, opacity: conteudo }}>{r.olho}</span>
                )}
                <span style={{ font: '800 30px Nunito, Inter, sans-serif', letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>
                  {palavras.map((p, k) => {
                    const e = entre(f, r.de + ms(180 + k * 38), r.de + ms(430 + k * 38), 0, 1);
                    return (
                      <span key={k} style={{ display: 'inline-block', opacity: e, transform: `translateY(${(1 - e) * 8}px)`, marginRight: k < palavras.length - 1 ? '0.26em' : 0 }}>{p}</span>
                    );
                  })}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
};
