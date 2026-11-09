// A Garrafa da Erika (08/11/2026): depois do mural de outubro, a câmera entra
// no cartão «A Garrafa — sorteada entre as três» e do brilho dele sai o mural
// da Erika Eduarda, que ganhou o prêmio das Lendas de Outubro.
//
// Um quadro de cortiça como o mural de Derry, só dela: a foto com a garrafa
// numa polaroide, o retrato em pixel art (o do quadro do Top 3), as cinco
// insígnias que ela completou caindo uma a uma, os números do mural (1ª do
// ranking, 630 pontos, golpe final) e o bilhete de parabéns. Confete do
// começo ao fim. Depois o papel do presente embrulha tudo (`Embrulho`).
//
// Os números são os do mural que foi ao ar (commit 8030860,
// `PortalOutubro/dados.ts`): Erika Eduarda, Receptivo, 5 de 5 insígnias,
// 630 pontos, 1ª do ranking, golpe final.

import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as fonteNunito } from '@remotion/google-fonts/Nunito';
import { loadFont as fonteCaveat } from '@remotion/google-fonts/Caveat';
import { ACELERA, entre, mola, ms, s, SUAVE, SUAVE_IDA_VOLTA } from '../movimento';
import { A, L, sorteio } from './Ceu';
import { COR_NOME } from './nome';

fonteNunito('normal', { weights: ['700', '800', '900'], subsets: ['latin', 'latin-ext'] });
fonteCaveat('normal', { weights: ['700'], subsets: ['latin', 'latin-ext'] });

const MAO = "Caveat, cursive";
const TEXTO = "Nunito, Inter, sans-serif";

/** Onde fica o cartão «A Garrafa» no mural gravado (1920 × 936): a câmera entra nele. */
export const CARTAO_GARRAFA = { x: 1190, y: 862 };

export function roteiroDaErika(E: number) {
  return {
    /** A câmera começa a entrar no cartão do prêmio. */
    entra: E,
    /** O clarão dourado: daqui em diante é o mural dela. */
    clarao: E + ms(650),
    titulo: E + ms(900),
    foto: E + ms(1300),
    retrato: E + ms(1750),
    medalhas: [0, 1, 2, 3, 4].map(i => E + ms(2300 + i * 190)),
    numeros: E + ms(3400),
    bilhete: E + ms(3900),
    fim: E + s(7.0),
  };
}
export type RoteiroErika = ReturnType<typeof roteiroDaErika>;

// ── Peças ───────────────────────────────────────────────────────────────────

/** Uma peça que chega no quadro: cai de leve, gira para o ângulo dela e assenta. */
function chegada(f: number, de: number, giro: number, deY = -60): React.CSSProperties {
  if (f < de) return { opacity: 0 };
  const e = mola(f, de, { mass: 0.8, stiffness: 150, damping: 14, overshootClamping: false });
  return {
    opacity: Math.min(1, e * 1.8),
    transform: `translateY(${(1 - e) * deY}px) rotate(${giro + (1 - e) * giro * 2.5}deg) scale(${0.86 + 0.14 * e})`,
  } as React.CSSProperties;
}

const Fita: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={{ position: 'absolute', width: 130, height: 38, background: 'rgba(250, 240, 200, .72)', boxShadow: '0 2px 6px rgba(0,0,0,.25)', ...style }} />
);
const Alfinete: React.FC<{ cor?: string; style?: React.CSSProperties }> = ({ cor = '#e0262b', style }) => (
  <div style={{ position: 'absolute', width: 22, height: 22, borderRadius: 999, background: `radial-gradient(circle at 35% 30%, #fff8, ${cor} 45%, #4a0a0a)`, boxShadow: '0 4px 6px rgba(0,0,0,.5)', ...style }} />
);

/** O confete: cai a cena inteira, de um sorteio fixo (o mesmo quadro sai sempre igual). */
const CONFETE = (() => {
  const r = sorteio(1031);
  const cores = ['#ffd84d', '#ff5d73', '#5ce1a6', '#6db8ff', '#ffffff', '#c58cff', '#ff9f1a'];
  return Array.from({ length: 150 }, () => ({
    x: r() * L, atraso: r() * 1.6, vel: 160 + r() * 240, balanco: 20 + r() * 50, fase: r() * 6.28,
    larg: 8 + r() * 10, alt: 12 + r() * 14, giro: (r() - 0.5) * 900, cor: cores[Math.floor(r() * cores.length)],
    estouro: r() < 0.45, ang: -Math.PI / 2 + (r() - 0.5) * 2.4, forca: 700 + r() * 900,
  }));
})();

const Confete: React.FC<{ de: number }> = ({ de }) => {
  const f = useCurrentFrame();
  if (f < de) return null;
  const t = (f - de) / 60;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {CONFETE.map((c, i) => {
        let x: number, y: number;
        if (c.estouro) {
          // Os do estouro saem do meio para cima e caem.
          const tt = Math.max(0, t - c.atraso * 0.15);
          x = L / 2 + Math.cos(c.ang) * c.forca * 0.55 * (1 - Math.exp(-tt * 2.2)) + Math.sin(tt * 3 + c.fase) * c.balanco;
          y = A * 0.52 + Math.sin(c.ang) * c.forca * 0.5 * (1 - Math.exp(-tt * 2.2)) + 260 * tt * tt;
        } else {
          const tt = t - c.atraso;
          if (tt < 0) return null;
          x = c.x + Math.sin(tt * 2.4 + c.fase) * c.balanco;
          y = -40 + c.vel * tt;
        }
        if (y > A + 40) return null;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y, width: c.larg, height: c.alt, background: c.cor, borderRadius: 2,
            transform: `rotate(${(c.giro * t + c.fase * 57).toFixed(1)}deg) scaleX(${Math.cos(t * 6 + c.fase).toFixed(2)})`,
            boxShadow: '0 1px 2px rgba(0,0,0,.25)',
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

const MEDALHAS = [
  { id: 'zumbi', nome: 'Zumbis' },
  { id: 'reiDoPop', nome: 'Rei do Pop' },
  { id: 'bruxas', nome: 'Bruxas' },
  { id: 'pantano', nome: 'Pântano' },
  { id: 'guerra', nome: 'Guerra' },
];

// ── A cena ──────────────────────────────────────────────────────────────────

export const CenaErika: React.FC<{ e: RoteiroErika; ate: number }> = ({ e, ate }) => {
  const f = useCurrentFrame();
  if (f < e.clarao - ms(120) || f > ate) return null;
  const surge = entre(f, e.clarao - ms(120), e.clarao + ms(250), 0, 1, SUAVE);
  const t = (f - e.clarao) / 60;
  const brilhoTitulo = 0.6 + 0.4 * Math.sin(t * 3.2);
  return (
    <AbsoluteFill style={{ opacity: surge, overflow: 'hidden' }}>
      {/* O quadro de cortiça, com a luz dourada no meio */}
      <AbsoluteFill style={{
        background: [
          'radial-gradient(ellipse at 50% 42%, rgba(255, 200, 90, .30), rgba(255, 200, 90, 0) 58%)',
          'radial-gradient(circle at 20% 30%, rgba(0,0,0,.0), rgba(0,0,0,.35) 90%)',
          'repeating-radial-gradient(circle at 30% 40%, rgba(255,255,255,.025) 0 2px, rgba(0,0,0,.03) 2px 5px)',
          'linear-gradient(160deg, #3a2618, #2a1a10 55%, #1d120b)',
        ].join(', '),
      }} />
      {/* Moldura de madeira */}
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 0 18px #5a3a22, inset 0 0 0 22px #3a2414, inset 0 0 60px 30px rgba(0,0,0,.55)' }} />
      {/* Luzinhas de Natal no alto do quadro */}
      <svg width={L} height={90} style={{ position: 'absolute', left: 0, top: 18 }}>
        <path d={`M 30 10 Q ${L / 4} 70 ${L / 2} 22 T ${L - 30} 10`} stroke="#1b2a1b" strokeWidth={3} fill="none" />
        {Array.from({ length: 26 }, (_, i) => {
          const k = (i + 0.5) / 26;
          const x = 30 + k * (L - 60);
          const y = 10 + Math.abs(Math.sin(k * Math.PI * 2)) * 40 + 8;
          const cor = ['#ff4d5e', '#ffd84d', '#5ce1a6', '#6db8ff'][i % 4];
          const aceso = (Math.floor(f / 18) + i) % 3 !== 0;
          return <ellipse key={i} cx={x} cy={y + 10} rx={7} ry={10} fill={cor} opacity={aceso ? 1 : 0.35} style={{ filter: aceso ? `drop-shadow(0 0 8px ${cor})` : undefined }} />;
        })}
      </svg>

      {/* O título */}
      <div style={{ position: 'absolute', top: 92, left: 0, right: 0, textAlign: 'center', ...chegada(f, e.titulo, 0, -40) }}>
        <p style={{ font: `900 24px ${TEXTO}`, letterSpacing: '0.22em', color: '#5ce1a6', textShadow: '0 2px 0 #0b2a17' }}>O PRÊMIO DAS LENDAS DE OUTUBRO</p>
        <h1 style={{
          font: `900 104px/1.05 ${TEXTO}`, letterSpacing: '-0.02em', marginTop: 14,
          background: 'linear-gradient(180deg, #fff6c8 0%, #ffd84d 45%, #f59e0b 100%)', WebkitBackgroundClip: 'text', color: 'transparent',
          filter: `drop-shadow(0 6px 0 #5a3200) drop-shadow(0 0 ${20 + 18 * brilhoTitulo}px rgba(255, 200, 60, .55))`,
        }}>Parabéns, Erika!</h1>
        <p style={{ font: `800 34px ${TEXTO}`, color: '#fff', marginTop: 10, textShadow: '0 3px 10px rgba(0,0,0,.6)' }}>
          A Garrafa é sua — sorteada entre as três Lendas de Outubro. 🏆
        </p>
      </div>

      {/* A polaroide com a foto da garrafa */}
      <div style={{ position: 'absolute', left: 190, top: 330, width: 430, ...chegada(f, e.foto, -5, -90) }}>
        <div style={{ background: '#fbf8f0', padding: '18px 18px 70px', boxShadow: '0 30px 50px -10px rgba(0,0,0,.7)' }}>
          <div style={{ width: '100%', height: 470, overflow: 'hidden', background: '#222' }}>
            <Img src={staticFile('natal/erika/foto.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 32%' }} />
          </div>
          <p style={{ position: 'absolute', left: 0, right: 0, bottom: 14, textAlign: 'center', font: `700 40px ${MAO}`, color: '#3a2a1a' }}>A dona da Garrafa! 💛</p>
        </div>
        <Fita style={{ left: 150, top: -18, transform: 'rotate(-3deg)' }} />
      </div>

      {/* O retrato em pixel art, com o nome */}
      <div style={{ position: 'absolute', left: 735, top: 345, width: 450, ...chegada(f, e.retrato, 2.5, -80) }}>
        <div style={{
          borderRadius: 18, padding: 14, background: 'linear-gradient(160deg, #2b1747, #170c2b)',
          border: '5px solid #e8b53a', boxShadow: '0 0 0 3px #6b4a10, 0 28px 50px -10px rgba(0,0,0,.75), 0 0 40px rgba(255, 196, 64, .35)',
        }}>
          <div style={{ width: '100%', height: 300, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
            <Img src={staticFile('natal/erika/retrato.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '60% 30%', imageRendering: 'pixelated' }} />
          </div>
          <p style={{ font: `900 36px ${TEXTO}`, color: COR_NOME, textAlign: 'center', marginTop: 12, textShadow: '0 0 16px rgba(255, 196, 64, .7), 0 2px 0 rgba(70, 40, 0, .6)' }}>Erika Eduarda</p>
          <p style={{ font: `900 17px ${TEXTO}`, letterSpacing: '0.14em', color: '#c9b7ff', textAlign: 'center', marginTop: 6 }}>RECEPTIVO · 1ª DAS LENDAS</p>
        </div>
        <Alfinete style={{ left: 214, top: -10 }} cor="#ffd84d" />
      </div>

      {/* As cinco insígnias, caindo uma a uma */}
      <div style={{ position: 'absolute', left: 1255, top: 330, width: 520 }}>
        <div style={{ ...chegada(f, e.medalhas[0] - ms(200), -1.5, -40), background: 'rgba(14, 10, 20, .82)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16, padding: '18px 20px 14px', boxShadow: '0 24px 40px -12px rgba(0,0,0,.7)' }}>
          <p style={{ font: `800 20px ${TEXTO}`, color: '#ffd84d', letterSpacing: '0.08em', textTransform: 'uppercase' }}>O álbum completo</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            {MEDALHAS.map((m, i) => {
              const de = e.medalhas[i];
              const k = f < de ? 0 : mola(f, de, { mass: 0.6, stiffness: 190, damping: 11, overshootClamping: false });
              const brilho = f < de ? 0 : 1 - entre(f, de, de + ms(500), 0, 1);
              return (
                <div key={m.id} style={{ width: 88, display: 'grid', justifyItems: 'center', gap: 6, opacity: Math.min(1, k * 2), transform: `translateY(${(1 - k) * -70}px) rotate(${(1 - k) * 25}deg)` }}>
                  <Img src={staticFile(`natal/erika/medalha-${m.id}.png`)} style={{ width: 84, height: 'auto', filter: `drop-shadow(0 0 ${4 + 18 * brilho}px rgba(255, 216, 77, ${0.4 + 0.6 * brilho}))` }} />
                  <span style={{ font: `800 14px ${TEXTO}`, color: 'rgba(255,255,255,.75)' }}>{m.nome}</span>
                </div>
              );
            })}
          </div>
          <p style={{ font: `900 17px ${TEXTO}`, letterSpacing: '0.14em', color: '#5ce1a6', marginTop: 12, textAlign: 'center', opacity: entre(f, e.medalhas[4] + ms(200), e.medalhas[4] + ms(500), 0, 1) }}>5 DE 5 INSÍGNIAS</p>
        </div>

        {/* Os números do mural */}
        <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
          {[
            { v: '1ª', r: 'no ranking das medalhas' },
            { v: '630', r: 'pontos em outubro' },
            { v: '⚔️', r: 'golpe final' },
          ].map((n, i) => (
            <div key={n.r} style={{ flex: 1, ...chegada(f, e.numeros + ms(i * 140), (i - 1) * 1.5, -30), background: '#fbf3d6', borderRadius: 6, padding: '12px 10px', textAlign: 'center', boxShadow: '0 14px 24px -8px rgba(0,0,0,.6)' }}>
              <p style={{ font: `900 38px ${TEXTO}`, color: '#b45309', lineHeight: 1 }}>{n.v}</p>
              <p style={{ font: `800 15px ${TEXTO}`, color: '#4a3520', marginTop: 4 }}>{n.r}</p>
            </div>
          ))}
        </div>
      </div>

      {/* O bilhete de parabéns */}
      <div style={{ position: 'absolute', left: 1330, top: 700, width: 400, ...chegada(f, e.bilhete, 3, -50) }}>
        <div style={{ background: 'linear-gradient(180deg, #fff27a, #f7d94c)', padding: '18px 22px', boxShadow: '0 20px 30px -10px rgba(0,0,0,.65)' }}>
          <p style={{ font: `700 34px/1.1 ${MAO}`, color: '#3b2a05' }}>Mês incrível, Erika! Aproveita a Garrafa. 💛</p>
          <p style={{ font: `700 24px ${MAO}`, color: '#6b4f10', marginTop: 6, textAlign: 'right' }}>— Gestão de Acordos</p>
        </div>
        <Fita style={{ left: 135, top: -16, transform: 'rotate(4deg)', width: 120 }} />
      </div>

      <Confete de={e.clarao} />
    </AbsoluteFill>
  );
};

/** A entrada: a câmera mergulha no cartão do prêmio do mural, e o clarão dourado abre a cena dela. */
export function cameraNoPremio(f: number, e: RoteiroErika) {
  const k = entre(f, e.entra, e.clarao + ms(100), 0, 1, ACELERA);
  return { escala: 1 + 2.4 * k, origem: `${CARTAO_GARRAFA.x}px ${CARTAO_GARRAFA.y}px` };
}

export const ClaraoDoPremio: React.FC<{ e: RoteiroErika }> = ({ e }) => {
  const f = useCurrentFrame();
  if (f < e.entra || f > e.clarao + ms(700)) return null;
  const sobe = entre(f, e.entra + ms(150), e.clarao, 0, 1, SUAVE_IDA_VOLTA);
  const desce = entre(f, e.clarao, e.clarao + ms(650), 0, 1, SUAVE);
  const op = sobe * (1 - desce);
  return <AbsoluteFill style={{ background: `radial-gradient(circle at ${CARTAO_GARRAFA.x}px ${CARTAO_GARRAFA.y}px, #fffbe8 0%, #ffe08a ${18 + 50 * sobe}%, rgba(255, 190, 70, ${0.6 * sobe}) 100%)`, opacity: op, pointerEvents: 'none' }} />;
};

/** Os sons: o brilho subindo, o estouro da festa, um pop por peça e um ding por insígnia; e a música festiva. */
export const SonsDaErika: React.FC<{ e: RoteiroErika; ate: number }> = ({ e, ate }) => (
  <>
    <Sequence from={e.entra} durationInFrames={s(1.5)}><Audio src={staticFile('natal/arena/subida.wav')} volume={0.3} /></Sequence>
    <Sequence from={e.clarao} durationInFrames={s(2)}><Audio src={staticFile('sons/festa.wav')} volume={0.4} /></Sequence>
    <Sequence from={e.clarao} durationInFrames={s(1.5)}><Audio src={staticFile('natal/arena/brilho.wav')} volume={0.35} /></Sequence>
    {[e.titulo, e.foto, e.retrato, e.numeros, e.bilhete].map(t => (
      <Sequence key={`p${t}`} from={t} durationInFrames={s(1)}><Audio src={staticFile('sons/pop.wav')} volume={0.22} /></Sequence>
    ))}
    {e.medalhas.map((t, i) => (
      <Sequence key={`m${t}`} from={t} durationInFrames={s(1.4)}><Audio src={staticFile('sons/ding.wav')} volume={0.12 + 0.03 * i} /></Sequence>
    ))}
    <Sequence from={e.clarao} durationInFrames={ate - e.clarao}>
      <Audio src={staticFile('natal/festive-lobby.mp3')} volume={(q) => 0.32 * Math.min(1, q / 30) * (1 - Math.max(0, Math.min(1, (q - (ate - e.clarao - s(1.6))) / s(1.6))))} />
    </Sequence>
  </>
);
