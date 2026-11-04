// O placar dos caçadores de outubro, com a cara da Caça aos Zumbis: a noite,
// a borda em degrau verde-tóxico com a sombra dura, o sangue escorrendo do
// topo (o mesmo desenho da faixa), as cabeças dos zumbis e as fontes do jogo.
// Tudo entra em degraus, como a arte em pixel pede.

import { useCurrentFrame } from 'remotion';
import { ZUMBIS } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/zumbis';
import { entre, ms, SUAVE } from '../movimento';
import { CabecaZumbi, IconePixel } from './Caca';

export type LinhaPlacar = { nome: string; setor: string; pegos: string; headshots: string };

const SANGUE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='8' shape-rendering='crispEdges'%3E%3Crect width='36' height='2' fill='%236e0a12'/%3E%3Crect x='4' y='2' width='2' height='4' fill='%236e0a12'/%3E%3Crect x='4' y='6' width='2' height='2' fill='%23c8202a'/%3E%3Crect x='15' y='2' width='2' height='2' fill='%236e0a12'/%3E%3Crect x='26' y='2' width='2' height='6' fill='%236e0a12'/%3E%3Crect x='28' y='2' width='2' height='2' fill='%236e0a12'/%3E%3C/svg%3E\")";
const borda = (cor: string, b: number, sombra = 0) =>
  `0 ${-b}px 0 0 ${cor}, 0 ${b}px 0 0 ${cor}, ${-b}px 0 0 0 ${cor}, ${b}px 0 0 0 ${cor}${sombra ? `, ${sombra}px ${sombra}px 0 0 rgb(0 0 0 / .45)` : ''}`;
const degrau = (p: number, n: number) => Math.floor(Math.min(1, Math.max(0, p)) * n) / n;
const MEDALHA = ['#ffd34d', '#d9e1ea', '#d08a4a', '#9dff5c', '#9dff5c'];

export const Placar: React.FC<{ entra: number; sai: number; linhas: LinhaPlacar[]; recorde: { nome: string; tempo: string } }> = ({ entra, sai, linhas, recorde }) => {
  const f = useCurrentFrame();
  if (f < entra || f > sai + ms(500)) return null;
  const cai = degrau(entre(f, entra, entra + ms(420), 0, 1, SUAVE), 10);
  const some = degrau(entre(f, sai, sai + ms(420), 0, 1), 8);
  return (
    <div className="nt-caca" style={{ position: 'absolute', left: 0, right: 0, top: 150, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{
        width: 980, background: '#0d100f', color: '#ece5d0', fontFamily: "'Pixelify Sans', monospace",
        boxShadow: borda('#2f6a17', 6, 14), opacity: 1 - some,
        transform: `translateY(${(1 - cai) * -120}px)`, imageRendering: 'pixelated',
      }}>
        <div style={{ height: 16, background: `${SANGUE} 0 0 / 72px 16px repeat-x` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '18px 34px 10px' }}>
          <CabecaZumbi zumbi={ZUMBIS[0]} escala={5} />
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: 'var(--zb-arcade)', fontSize: 15, color: '#ffd34d', letterSpacing: '.04em' }}>OUTUBRO · 2026</p>
            <p style={{ fontSize: 50, fontWeight: 700, color: '#9dff5c', textShadow: '4px 4px 0 #0b2a07', lineHeight: 1.1, marginTop: 6 }}>Caçadores de zumbis</p>
          </div>
          <IconePixel nome="caveira" tam={6} style={{ color: '#ece5d0', opacity: 0.6 }} />
        </div>
        <div style={{ display: 'grid', gap: 10, padding: '10px 34px 18px' }}>
          {linhas.map((l, i) => {
            const t0 = entra + ms(380 + i * 170);
            const p = degrau(entre(f, t0, t0 + ms(260), 0, 1, SUAVE), 6);
            const primeiro = i === 0;
            const brilho = primeiro && f > t0 + ms(300) ? (Math.floor(f / 18) % 2 ? '#ffd34d' : '#b8901f') : '#1f2a22';
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 18, padding: '10px 18px',
                background: i % 2 ? '#111513' : '#161b18', boxShadow: borda(brilho, primeiro ? 4 : 2),
                opacity: p, transform: `translateX(${(1 - p) * -60}px)`,
              }}>
                <span style={{ width: 46, fontFamily: 'var(--zb-arcade)', fontSize: 26, color: MEDALHA[i], textShadow: '3px 3px 0 #000' }}>{i + 1}</span>
                <CabecaZumbi zumbi={ZUMBIS[(i * 3) % ZUMBIS.length]} escala={3} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 30, fontWeight: 700, color: primeiro ? '#ffd34d' : '#9dff5c', textShadow: `3px 3px 0 ${primeiro ? '#5c4a12' : '#0b2a07'}`, lineHeight: 1.1 }}>{l.nome}</p>
                  <p style={{ fontSize: 19, opacity: 0.75, marginTop: 2 }}>{l.setor}</p>
                </div>
                <span className="zb-tag zb-tag-hs" style={{ fontSize: 12, padding: '7px 9px 5px' }}><IconePixel nome="mira" tam={3} />{l.headshots}</span>
                <span style={{ minWidth: 150, textAlign: 'right' }}>
                  <span style={{ fontFamily: 'var(--zb-arcade)', fontSize: 24, color: '#ffd34d' }}>{l.pegos}</span>
                  <span style={{ fontSize: 19, marginLeft: 8, opacity: 0.8 }}>zumbis</span>
                </span>
              </div>
            );
          })}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 34px 20px', fontSize: 22,
          opacity: degrau(entre(f, entra + ms(380 + linhas.length * 170 + 200), entra + ms(380 + linhas.length * 170 + 460), 0, 1), 5),
        }}>
          <span className="zb-tag zb-tag-rapido" style={{ fontSize: 15, padding: '6px 9px 5px' }}><IconePixel nome="raio" tam={3} />Mais rápido do mês</span>
          <span style={{ fontWeight: 700, color: '#9dff5c' }}>{recorde.nome}</span>
          <span className="zb-faixa-tempo" style={{ fontSize: 14, padding: '6px 9px 5px' }}>{recorde.tempo}</span>
        </div>
      </div>
    </div>
  );
};
