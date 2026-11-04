/**
 * chiclete.tsx — tema «Máquina de chiclete» (doceria).
 *
 * O globo é uma máquina de chiclete: as bolinhas pulam lá dentro quando
 * sorteia, e a pedra sai como uma bola de chiclete com carinha. Tons pastel,
 * letra redonda (Fredoka). A festa é uma chuva de doces.
 */
import type { CSSProperties } from 'react';
import { letraDe } from '../regras';
import type { TemaBingo } from './contrato';

/** Uma cor por coluna, como as bolas de verdade. */
const COR_DA_LETRA: Record<string, [string, string]> = {
  B: ['#ff8fb1', '#e0527f'],
  I: ['#ffd56b', '#e5a72a'],
  N: ['#7fd3ff', '#2f97d6'],
  G: ['#9be29b', '#4bb04b'],
  O: ['#c9a7ff', '#8d5ee6'],
};

const ROSA = '#ff5d8f';

function Bola({ numero, tamanho, brilho }: { numero: number; tamanho: number; brilho?: boolean }) {
  const letra = letraDe(numero);
  const [claro, escuro] = COR_DA_LETRA[letra];
  return (
    <div style={{
      width: tamanho, height: tamanho, borderRadius: '50%', position: 'relative', flexShrink: 0,
      background: `radial-gradient(circle at 32% 28%, #ffffffcc 0 9%, ${claro} 10% 62%, ${escuro} 100%)`,
      boxShadow: brilho ? `0 0 ${tamanho * 0.35}px ${claro}, 0 ${tamanho * 0.05}px 0 ${escuro}` : `0 ${tamanho * 0.05}px 0 ${escuro}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '62%', height: '62%', borderRadius: '50%', background: '#fffaf5',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Fredoka", sans-serif', color: escuro, lineHeight: 1,
      }}>
        <span style={{ fontSize: tamanho * 0.13, fontWeight: 700 }}>{letra}</span>
        <span style={{ fontSize: tamanho * 0.3, fontWeight: 700 }}>{numero}</span>
        {tamanho >= 90 && <span style={{ fontSize: tamanho * 0.08, marginTop: tamanho * 0.02, color: '#a33a63' }}>◕‿◕</span>}
      </div>
    </div>
  );
}

/** As bolinhas lá dentro, em posições fixas (nada de aleatório a cada render). */
const DENTRO: [number, number, string][] = [
  [22, 58, 'B'], [42, 66, 'I'], [62, 60, 'N'], [32, 40, 'G'], [54, 42, 'O'], [72, 44, 'B'],
  [18, 38, 'N'], [46, 24, 'I'], [66, 26, 'G'], [28, 22, 'O'], [78, 62, 'I'], [12, 56, 'G'],
];

function Maquina({ girando, tamanho }: { girando: boolean; tamanho: number }) {
  const globo = tamanho * 0.78;
  return (
    <div style={{ width: tamanho, height: tamanho * 1.18, position: 'relative', flexShrink: 0 }}>
      <div style={{
        position: 'absolute', left: (tamanho - globo) / 2, top: 0, width: globo, height: globo, borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #ffffffee, #ffffff66 55%, #ffe3ef99 100%)',
        border: `${tamanho * 0.025}px solid ${ROSA}`, overflow: 'hidden',
        animation: girando ? 'chiclete-treme 0.18s linear infinite' : undefined,
      }}>
        {DENTRO.map(([x, y, l], i) => (
          <span key={i} style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`, width: globo * 0.17, height: globo * 0.17, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 30%, #fff8 0 15%, ${COR_DA_LETRA[l][0]} 16%, ${COR_DA_LETRA[l][1]})`,
            animation: girando ? `chiclete-pula ${0.35 + (i % 4) * 0.08}s ease-in-out ${i * 0.03}s infinite alternate` : undefined,
          }} />
        ))}
        <span style={{ position: 'absolute', left: '18%', top: '10%', width: '22%', height: '12%', borderRadius: '50%', background: '#ffffffaa', transform: 'rotate(-30deg)' }} />
      </div>
      <div style={{
        position: 'absolute', left: tamanho * 0.18, right: tamanho * 0.18, top: globo * 0.94, height: tamanho * 0.36,
        background: `linear-gradient(180deg, ${ROSA}, #e04677)`, borderRadius: `${tamanho * 0.05}px ${tamanho * 0.05}px ${tamanho * 0.09}px ${tamanho * 0.09}px`,
        boxShadow: `0 ${tamanho * 0.03}px 0 #b8325c`,
      }}>
        <span style={{ position: 'absolute', left: '50%', top: '28%', width: tamanho * 0.12, height: tamanho * 0.12, marginLeft: -tamanho * 0.06, borderRadius: '50%', background: '#ffd56b', border: `${tamanho * 0.012}px solid #b8325c`,
          animation: girando ? 'chiclete-gira 0.5s linear infinite' : undefined }} />
        <span style={{ position: 'absolute', left: '50%', bottom: '10%', width: tamanho * 0.16, height: tamanho * 0.06, marginLeft: -tamanho * 0.08, borderRadius: tamanho * 0.02, background: '#8a2246' }} />
      </div>
      <style>{`
        @keyframes chiclete-treme { 0% { transform: translate(0,0) rotate(0) } 25% { transform: translate(-3px,1px) rotate(-1.5deg) } 75% { transform: translate(3px,-1px) rotate(1.5deg) } }
        @keyframes chiclete-pula { from { transform: translateY(0) } to { transform: translateY(-40%) } }
        @keyframes chiclete-gira { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}

const DOCES = ['🍬', '🍭', '🍩', '🧁', '🍓', '🍫', '🍪', '🌈'];

function Festa() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 36 }, (_, i) => {
        const estilo: CSSProperties = {
          position: 'absolute', left: `${(i * 37) % 100}%`, top: -80, fontSize: 48 + (i % 4) * 14,
          animation: `chiclete-chove ${3.2 + (i % 5) * 0.5}s linear ${(i % 9) * 0.35}s infinite`,
        };
        return <span key={i} style={estilo}>{DOCES[i % DOCES.length]}</span>;
      })}
      <style>{'@keyframes chiclete-chove { from { transform: translateY(0) rotate(0) } to { transform: translateY(1250px) rotate(540deg) } }'}</style>
    </div>
  );
}

const tema: TemaBingo = {
  id: 'chiclete',
  nome: 'Máquina de chiclete',
  fonteUrl: 'Fredoka:wght@500;600;700',
  familia: '"Fredoka", "Nunito", sans-serif',
  escalaNumero: 1,
  fundoTv: 'radial-gradient(circle at 20% 15%, #fff4f8 0%, #ffe3ef 45%, #ffd6a8 100%)',
  texto: '#7a2448',
  suave: '#b06a88',
  destaque: ROSA,
  caixa: '#ffffffb3',
  quadro: { fundo: '#fff3f7', texto: '#e3a7bd', acesaFundo: ROSA, acesaTexto: '#ffffff', letraFundo: '#7a2448', letraTexto: '#ffffff' },
  cartela: {
    fundo: '#ffffff', borda: ROSA, sombra: '#e04677', cabecalhoFundo: ROSA, cabecalhoTexto: '#ffffff',
    celulaFundo: '#fff3f7', celulaTexto: '#a33a63', raio: 22, raioCelula: 50,
    marcaFundo: '#7fd3ff', marcaTexto: '#ffffff', autoFundo: '#d7c3ff', autoTexto: '#5b3fa0',
    estrelaFundo: '#ffd56b', estrelaTexto: '#ffffff', sorte: '#ffb000', vence: '#22c55e',
  },
  aba: { fundo: ROSA, texto: '#ffffff' },
  botao: { fundo: '#ffd56b', texto: '#7a2448', sombra: '#e5a72a' },
  frases: { abertura: 'A máquina está cheia de chicletes!', quina: 'Docinho de quina!', cheia: 'Chuva de doces!' },
  Maquina,
  Bola,
  Festa,
};

export default tema;
