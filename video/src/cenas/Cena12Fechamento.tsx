// Cena 12 — «Gestão de Acordos. Ajudando você a bater sua meta!»

import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { logoSrc } from '../componentes/Poeira';
import { cena, palavra, TOTAL_FRAMES } from '../linhaDoTempo';
import { entrada, entre, mola, ms } from '../movimento';
import { COR, FONTE, GRADIENTE_MARCA } from '../tema';

const NOME = 'Gestão de Acordos';
const LEMA = [
  { p: 'Ajudando', d: false },
  { p: 'você', d: false },
  { p: 'a', d: false },
  { p: 'bater', d: false },
  { p: 'sua', d: true },
  { p: 'meta.', d: true },
];

export const Cena12Fechamento: React.FC = () => {
  const f = useCurrentFrame();
  const c = cena('cena-12');
  if (f < c.inicio + ms(150)) return null;

  const icone = mola(f, c.inicio + ms(200));
  const nome = palavra('cena-12', 'gestao');
  const lema = palavra('cena-12', 'ajudando');
  const url = palavra('cena-12', 'meta') + ms(350);
  const brilho = 0.5 + 0.5 * Math.sin(((f - c.inicio) / 60) * 1.6);
  const apaga = entre(f, TOTAL_FRAMES - ms(900), TOTAL_FRAMES - 1, 0, 1);

  return (
    <AbsoluteFill style={{ fontFamily: FONTE, alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: 200,
          width: 210,
          height: 210,
          borderRadius: 50,
          overflow: 'hidden',
          transform: `scale(${0.5 + 0.5 * icone})`,
          opacity: Math.min(1, icone * 1.6),
          boxShadow: `0 30px 80px rgba(0,0,0,0.55), 0 0 ${70 + 30 * brilho}px rgba(74,222,128,0.20), 0 0 140px rgba(92,200,245,0.18)`,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Img src={logoSrc('app-512.png')} style={{ width: '100%', height: '100%' }} />
      </div>

      <div style={{ position: 'absolute', top: 460, fontSize: 92, fontWeight: 800, letterSpacing: -2.5, color: COR.texto }}>
        {NOME.split('').map((ch, i) => (
          <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', ...entrada(f, nome, i, { passoMs: 26, deslocY: 26, duracaoMs: 520 }) }}>
            {ch}
          </span>
        ))}
      </div>

      <div style={{ position: 'absolute', top: 600, fontSize: 46, fontWeight: 600, color: COR.textoSuave, letterSpacing: -0.6 }}>
        {LEMA.map((x, i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: 14,
              ...entrada(f, lema, i, { passoMs: 90, deslocY: 18, duracaoMs: 520 }),
              ...(x.d ? { background: GRADIENTE_MARCA, WebkitBackgroundClip: 'text', color: 'transparent', fontWeight: 800 } : {}),
            }}
          >
            {x.p}
          </span>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 740,
          height: 54,
          padding: '0 26px',
          borderRadius: 999,
          border: '1px solid rgba(92,200,245,0.35)',
          background: 'rgba(15,26,36,0.8)',
          display: 'flex',
          alignItems: 'center',
          fontSize: 22,
          fontWeight: 600,
          color: COR.texto,
          letterSpacing: 0.4,
          ...entrada(f, url, 0, { deslocY: 14, duracaoMs: 600 }),
        }}
      >
        app.gestaodeacordos.com.br
      </div>

      <AbsoluteFill style={{ background: '#000', opacity: apaga }} />
    </AbsoluteFill>
  );
};
