// As mensagens do começo: um card do próprio sistema no meio da tela, com o
// texto chegando palavra por palavra (cada uma sai do desfoque e sobe um
// pouco), as palavras importantes na cor do sistema com um traço que se
// desenha embaixo. Tempo de sobra para ler — quem assiste está chegando.

import { Img, staticFile, useCurrentFrame } from 'remotion';
import { ACELERA, entre, mola, ms, SUAVE } from '../movimento';

export type Fala = { de: number; ate: number; texto: string };

/** `*assim*` marca a palavra que ganha destaque. */
function palavras(texto: string) {
  return texto.split(' ').map(p => ({ forte: p.startsWith('*') || p.endsWith('*') || p.includes('*'), p: p.replace(/\*/g, '') }));
}

export const BoasVindas: React.FC<{ falas: Fala[] }> = ({ falas }) => {
  const f = useCurrentFrame();
  const atual = falas.find(x => f >= x.de && f < x.ate + ms(500));
  if (!atual) return null;
  const entra = mola(f, atual.de);
  const sai = entre(f, atual.ate, atual.ate + ms(450), 0, 1, ACELERA);
  // O destaque só vale entre asteriscos inteiros ("*Gestão de Acordos*").
  let dentro = false;
  const lista = palavras(atual.texto).map((w, i, todas) => {
    const cru = atual.texto.split(' ')[i];
    const abre = cru.startsWith('*');
    const fecha = cru.endsWith('*') || cru.endsWith('*.') || cru.endsWith('*,');
    if (abre) dentro = true;
    const forte = dentro;
    if (fecha) dentro = false;
    return { ...w, forte, i, total: todas.length };
  });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 300, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div className="flex items-center gap-6 rounded-3xl border border-border bg-card shadow-2xl" style={{
        padding: '34px 46px', maxWidth: 1240,
        opacity: Math.min(1, entra * 1.5) * (1 - sai),
        transform: `translateY(${(1 - entra) * 26 - sai * 20}px) scale(${0.96 + 0.04 * entra})`,
        filter: sai > 0 ? `blur(${sai * 8}px)` : undefined,
      }}>
        <Img src={staticFile('marca/app-512.png')} style={{ width: 84, height: 84, borderRadius: 22, flex: 'none', transform: `scale(${0.7 + 0.3 * mola(f, atual.de + ms(60))})` }} />
        <p className="font-bold text-foreground" style={{ fontSize: 48, lineHeight: 1.22, letterSpacing: '-0.01em' }}>
          {lista.map(({ p, forte, i }) => {
            const t0 = atual.de + ms(220 + i * 85);
            const v = entre(f, t0, t0 + ms(420), 0, 1, SUAVE);
            const traco = forte ? entre(f, t0 + ms(250), t0 + ms(700), 0, 1, SUAVE) : 0;
            return (
              <span key={i} style={{ display: 'inline-block', marginRight: '0.26em', position: 'relative', opacity: v, transform: `translateY(${(1 - v) * 14}px)`, filter: v < 1 ? `blur(${(1 - v) * 6}px)` : undefined }}>
                <span className={forte ? 'text-primary' : undefined}>{p}</span>
                {forte && (
                  <span style={{ position: 'absolute', left: 0, bottom: 2, height: 5, borderRadius: 3, width: `${traco * 100}%`, background: 'color-mix(in oklch, var(--primary) 28%, transparent)' }} />
                )}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
};
