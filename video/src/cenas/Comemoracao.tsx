// Cena 10 — «E quando a meta vem… todos comemoram com você!»
// Tela cheia: o app escurece, explode confete e chegam as reações da equipe.

import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { TempoApp } from '../app/roteiro';
import { Avatar, Numero } from '../app/ui';
import { Confete } from '../componentes/Confete';
import { Icone } from '../componentes/Icone';
import { entrada, entre, mola, ms } from '../movimento';
import { COR, FONTE, GRADIENTE_MARCA } from '../tema';

const REACOES = [
  { nome: 'Carlos Mendes', texto: 'Parabéns, Ju! 👏', x: 150, y: 250 },
  { nome: 'Camila Duarte', texto: 'Arrasou demais! 🔥', x: 1430, y: 215 },
  { nome: 'Rafael Monteiro', texto: 'Bora, Águia! 💪', x: 1420, y: 820 },
];

export const Comemoracao: React.FC<{ t: TempoApp }> = ({ t }) => {
  const f = useCurrentFrame();
  const ini = t.explode;
  if (f < ini - ms(200)) return null;
  const fim = t.c11.inicio + ms(80);
  const sai = entre(f, fim, fim + ms(380), 0, 1);
  if (sai >= 1) return null;

  const escurece = entre(f, ini - ms(200), ini + ms(250), 0, 1) * (1 - sai);
  const cartao = mola(f, ini);
  const trofeu = mola(f, ini + ms(150));

  return (
    <AbsoluteFill style={{ fontFamily: FONTE }}>
      <AbsoluteFill style={{ background: `rgba(2,6,10,${0.62 * escurece})`, backdropFilter: `blur(${6 * escurece}px)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(700px 500px at 50% 50%, rgba(74,222,128,${0.22 * escurece}), transparent 70%)` }} />
      <Confete inicio={ini} />

      <div
        style={{
          position: 'absolute',
          left: 960 - 390,
          top: 540 - 230,
          width: 780,
          height: 460,
          borderRadius: 28,
          background: 'linear-gradient(160deg, #13261c, #0f1a24 60%)',
          border: '1px solid rgba(74,222,128,0.45)',
          boxShadow: '0 50px 120px rgba(0,0,0,0.6), 0 0 80px rgba(74,222,128,0.18)',
          transform: `scale(${0.7 + 0.3 * cartao}) translateY(${sai * 30}px)`,
          opacity: Math.min(1, cartao * 1.8) * (1 - sai),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 112, height: 112, borderRadius: 56, background: GRADIENTE_MARCA, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${trofeu}) rotate(${(1 - trofeu) * -40}deg)`, boxShadow: '0 0 60px rgba(74,222,128,0.5)' }}>
          <Icone nome="trofeu" tamanho={58} cor="#05140c" espessura={2.4} />
        </div>
        <div style={{ fontSize: 58, fontWeight: 800, color: COR.texto, letterSpacing: -1.5, marginTop: 26, ...entrada(f, ini + ms(200), 0) }}>Meta do dia batida!</div>
        <div style={{ fontSize: 22, color: COR.textoSuave, marginTop: 8, ...entrada(f, ini + ms(200), 2) }}>Juliana Prado · Equipe Águia</div>
        <div style={{ marginTop: 22, fontSize: 26, ...entrada(f, ini + ms(200), 4) }}>
          <Numero style={{ color: COR.verdeClaro }}>R$ 7.120,00</Numero>
          <span style={{ color: COR.textoFraco }}> de </span>
          <Numero style={{ color: COR.texto }}>R$ 7.000,00</Numero>
        </div>
      </div>

      {REACOES.map((r, i) => {
        const em = t.reacoes[i];
        const p = mola(f, em);
        if (f < em) return null;
        return (
          <div
            key={r.nome}
            style={{
              position: 'absolute',
              left: r.x,
              top: r.y,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 20px 12px 12px',
              borderRadius: 999,
              background: '#132230',
              border: `1px solid ${COR.bordaForte}`,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              transform: `scale(${0.6 + 0.4 * p}) translateY(${(1 - p) * 30 + Math.sin((f - em) / 40) * 4}px)`,
              opacity: Math.min(1, p * 2) * (1 - sai),
            }}
          >
            <Avatar nome={r.nome} tamanho={44} />
            <div>
              <div style={{ fontSize: 14, color: COR.textoSuave }}>{r.nome}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: COR.texto }}>{r.texto}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
