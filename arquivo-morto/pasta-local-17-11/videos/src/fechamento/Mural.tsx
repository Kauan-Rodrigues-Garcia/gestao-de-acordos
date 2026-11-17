// Fecho de cada setor: as polaroids de todo mundo caem no mural, uma atrás da
// outra, e vem o flash da «foto do elenco».

import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { Setor } from './elenco';
import { C, entre, F, mola, sorte } from './estilo';
import { Flash, Grao, LuzVazada, Polaroid, Riscos, Vinheta } from './efeitos';
import { B, MURAL } from './tempo';

const FRASES = ['elenco de peso!', 'que time!', 'sucesso de bilheteria', 'aplausos!', 'bis!', 'nota 10!', 'time que joga junto', 'missão cumprida', 'quem faz acontecer'];

function grade(n: number) {
  const cols = n <= 2 ? 1 : n <= 6 ? 2 : 3;
  return { cols, linhas: Math.ceil(n / cols) };
}

export const Mural: React.FC<{ setor: Setor; cena: number }> = ({ setor, cena }) => {
  const f = useCurrentFrame();
  const dur = MURAL * B;
  const n = setor.pessoas.length;
  const { cols, linhas } = grade(n);
  const area = { x: 60, y: 470, l: 960, a: 1330 };
  const cl = area.l / cols;
  const ca = area.a / linhas;
  const tamLegenda = Math.min(64, cl * 0.13, ca * 0.12);
  const titulo = mola(f, 0, { stiffness: 140, damping: 13 });
  const foto = B * 3;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#2a1712' }}>
      {/* mural de cortiça escura com luz quente */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 45%, #6b4630 0%, #3b2419 55%, #1a0e0a 100%)` }} />
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,.18) 1.5px, transparent 1.6px)', backgroundSize: '14px 14px', opacity: 0.6 }} />
      <LuzVazada forca={0.22} semente={cena * 3 + 1} />

      <div style={{ position: 'absolute', top: 130, left: 0, right: 0, textAlign: 'center', transform: `scale(${0.6 + titulo * 0.4})`, opacity: Math.min(1, titulo * 1.5) }}>
        <div style={{ fontFamily: F.letreiro, fontSize: 46, letterSpacing: 12, color: C.ouroClaro }}>O ELENCO DE</div>
        <div style={{ fontFamily: F.letreiro, fontSize: setor.nome.length > 12 ? 118 : 150, lineHeight: 1, color: setor.cor, textShadow: '0 6px 0 rgba(0,0,0,.35), 0 0 40px rgba(0,0,0,.4)' }}>{setor.nome.toUpperCase()}</div>
        <div style={{ fontFamily: F.script, fontSize: 64, color: C.creme, marginTop: -6, transform: 'rotate(-4deg)', opacity: entre(f, 10, 20, 0, 1) }}>
          {FRASES[(cena - 1) % FRASES.length]}
        </div>
      </div>

      {setor.pessoas.map((p, i) => {
        const col = i % cols;
        const lin = Math.floor(i / cols);
        const naLinha = Math.min(cols, n - lin * cols);
        const sobra = (cols - naLinha) * cl * 0.5;
        const cx = area.x + sobra + col * cl + cl / 2;
        const cy = area.y + lin * ca + ca / 2;
        const ini = 4 + i * 3;
        const q = mola(f, ini, { stiffness: 190, damping: 16 });
        const rot = (sorte(cena * 31 + i) - 0.5) * 12;
        return (
          <div key={i} style={{ position: 'absolute', left: cx, top: cy, transform: `translate(-50%,-50%) translateY(${(1 - q) * -1500}px) rotate(${rot + (1 - q) * 35}deg)`, opacity: f >= ini ? 1 : 0 }}>
            <Polaroid foto={p.foto} maxL={cl * 0.78} maxA={ca * 0.66} legenda={p.nome} tamLegenda={tamLegenda} corFita={setor.cor} />
          </div>
        );
      })}

      <Riscos />
      <Grao />
      <Vinheta forca={0.65} />
      <Flash forca={Math.max(f >= foto ? entre(f, foto, foto + 8, 0.7, 0) : 0, entre(f, dur - 4, dur, 0, 0.9))} />
    </AbsoluteFill>
  );
};
