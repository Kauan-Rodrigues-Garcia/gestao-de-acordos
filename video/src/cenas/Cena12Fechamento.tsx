// Cena 12 — «Gestão de Acordos. Ajudando você a bater sua meta!»

import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
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
  const respira = 0.5 + 0.5 * Math.sin(((f - c.inicio) / 60) * 1.6);
  const apaga = entre(f, TOTAL_FRAMES - ms(900), TOTAL_FRAMES - 1, 0, 1);

  return (
    <AbsoluteFill style={{ fontFamily: FONTE, alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: 196,
          width: 210,
          height: 210,
          borderRadius: 50,
          overflow: 'hidden',
          transform: `scale(${0.5 + 0.5 * icone})`,
          opacity: Math.min(1, icone * 1.6),
          boxShadow: `0 30px 60px rgba(15,27,38,0.20), 0 8px 20px rgba(15,27,38,0.10), 0 0 ${50 + 30 * respira}px rgba(56,189,248,0.22)`,
        }}
      >
        <Img src={staticFile('marca/app-512.png')} style={{ width: '100%', height: '100%' }} />
      </div>

      <div style={{ position: 'absolute', top: 452, fontSize: 92, fontWeight: 800, letterSpacing: -2.6, color: COR.texto }}>
        {NOME.split('').map((ch, i) => (
          <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', ...entrada(f, nome, i, { passoMs: 26, deslocY: 26, duracaoMs: 520 }) }}>
            {ch}
          </span>
        ))}
      </div>

      <div style={{ position: 'absolute', top: 594, fontSize: 46, fontWeight: 600, color: COR.textoSuave, letterSpacing: -0.6 }}>
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
          top: 734,
          height: 54,
          padding: '0 26px',
          borderRadius: 999,
          border: '1px solid rgba(15,27,38,0.10)',
          background: 'rgba(255,255,255,0.85)',
          boxShadow: '0 10px 30px rgba(15,27,38,0.08)',
          display: 'flex',
          alignItems: 'center',
          fontSize: 22,
          fontWeight: 600,
          color: COR.texto,
          letterSpacing: 0.3,
          ...entrada(f, url, 0, { deslocY: 14, duracaoMs: 600 }),
        }}
      >
        gestaodeacordos.com.br
      </div>

      <AbsoluteFill style={{ background: '#ffffff', opacity: apaga }} />
    </AbsoluteFill>
  );
};
