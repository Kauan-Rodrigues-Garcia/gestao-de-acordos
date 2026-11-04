/**
 * fliperama.tsx — tema «Fliperama fofo» (arcade anos 80/90).
 *
 * Gabinete de fliperama com tela de tubo: as bolinhas piscam lá dentro quando
 * sorteia, e a pedra sai como um «power-up» neon. Fonte pixel, linhas de TV
 * antiga no fundo. A festa é a tela de «fase concluída», com estrelas de pixel.
 */
import { letraDe } from '../regras';
import type { TemaBingo } from './contrato';

const PIXEL = '"Press Start 2P", monospace';
const ROSA = '#ff7ac6';
const MENTA = '#7cf7d4';
const AMARELO = '#ffe66d';

const NEON: Record<string, string> = { B: ROSA, I: AMARELO, N: MENTA, G: '#9d8cff', O: '#ff9f5b' };

function Bola({ numero, tamanho, brilho }: { numero: number; tamanho: number; brilho?: boolean }) {
  const cor = NEON[letraDe(numero)];
  return (
    <div style={{
      width: tamanho, height: tamanho, borderRadius: '50%', flexShrink: 0,
      // O brilho fica no canto, longe da letra e do número.
      background: `radial-gradient(circle at 20% 18%, #ffffffcc 0 4%, ${cor} 6% 58%, #2a1650 100%)`,
      border: `${Math.max(2, tamanho * 0.03)}px solid ${cor}`,
      boxShadow: brilho ? `0 0 ${tamanho * 0.3}px ${cor}, inset 0 0 ${tamanho * 0.1}px #fff8` : `0 0 ${tamanho * 0.08}px ${cor}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: PIXEL, color: '#fff', lineHeight: 1.25, textShadow: `${tamanho * 0.02}px ${tamanho * 0.02}px 0 #2a1650`,
    }}>
      <span style={{ fontSize: tamanho * 0.1 }}>{letraDe(numero)}</span>
      <span style={{ fontSize: tamanho * 0.22 }}>{numero}</span>
    </div>
  );
}

function Maquina({ girando, tamanho }: { girando: boolean; tamanho: number }) {
  const l = tamanho * 0.86;
  return (
    <div style={{ width: l, height: tamanho * 1.15, position: 'relative', flexShrink: 0 }}>
      {/* O gabinete */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: `${tamanho * 0.08}px ${tamanho * 0.08}px ${tamanho * 0.03}px ${tamanho * 0.03}px`,
        background: 'linear-gradient(180deg, #3b1f6b, #1d1240)', border: `${tamanho * 0.02}px solid ${MENTA}`,
        boxShadow: `0 0 ${tamanho * 0.08}px ${MENTA}88`,
      }} />
      <div style={{
        position: 'absolute', left: '10%', right: '10%', top: '6%', height: '10%', borderRadius: tamanho * 0.02,
        background: ROSA, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: PIXEL, fontSize: tamanho * 0.06, color: '#fff',
      }}>BINGO</div>
      {/* A tela de tubo */}
      <div style={{
        position: 'absolute', left: '12%', right: '12%', top: '20%', height: '42%', borderRadius: tamanho * 0.04,
        background: '#0b0620', overflow: 'hidden', border: `${tamanho * 0.015}px solid #000`,
      }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <span key={i} style={{
            position: 'absolute', left: `${12 + (i % 3) * 30}%`, top: `${18 + Math.floor(i / 3) * 40}%`,
            width: tamanho * 0.1, height: tamanho * 0.1, borderRadius: '50%', background: Object.values(NEON)[i % 5],
            boxShadow: `0 0 ${tamanho * 0.04}px ${Object.values(NEON)[i % 5]}`,
            animation: girando ? `fliper-pisca ${0.2 + i * 0.05}s steps(2) infinite` : undefined,
          }} />
        ))}
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(255,255,255,.07) 0 2px, transparent 2px 5px)' }} />
      </div>
      {/* Os controles */}
      <div style={{ position: 'absolute', left: '22%', top: '70%', width: tamanho * 0.05, height: tamanho * 0.14, background: '#ccc', borderRadius: tamanho * 0.02,
        transformOrigin: 'bottom', animation: girando ? 'fliper-alavanca 0.3s ease-in-out infinite alternate' : undefined }}>
        <span style={{ position: 'absolute', left: '50%', top: -tamanho * 0.05, width: tamanho * 0.1, height: tamanho * 0.1, marginLeft: -tamanho * 0.05, borderRadius: '50%', background: ROSA }} />
      </div>
      {[0, 1].map(i => (
        <span key={i} style={{ position: 'absolute', left: `${55 + i * 18}%`, top: '76%', width: tamanho * 0.09, height: tamanho * 0.09, borderRadius: '50%',
          background: i ? MENTA : AMARELO, boxShadow: `0 ${tamanho * 0.012}px 0 #0008`,
          animation: girando ? `fliper-aperta 0.25s ${i * 0.12}s steps(2) infinite` : undefined }} />
      ))}
      <style>{`
        @keyframes fliper-pisca { to { opacity: .15 } }
        @keyframes fliper-alavanca { from { transform: rotate(-18deg) } to { transform: rotate(18deg) } }
        @keyframes fliper-aperta { to { transform: translateY(${Math.round(tamanho * 0.012)}px) } }
      `}</style>
    </div>
  );
}

function Festa() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 3px, transparent 3px 7px)' }} />
      {Array.from({ length: 40 }, (_, i) => (
        <span key={i} style={{
          position: 'absolute', left: `${(i * 23) % 100}%`, top: `${(i * 41) % 100}%`,
          fontFamily: PIXEL, fontSize: 28 + (i % 3) * 14, color: Object.values(NEON)[i % 5],
          textShadow: `0 0 12px ${Object.values(NEON)[i % 5]}`,
          animation: `fliper-estrela ${0.8 + (i % 4) * 0.3}s steps(3) ${(i % 7) * 0.2}s infinite`,
        }}>★</span>
      ))}
      <style>{`
        @keyframes fliper-estrela { 0% { transform: scale(.4); opacity: 0 } 50% { transform: scale(1.2); opacity: 1 } 100% { transform: scale(.4); opacity: 0 } }
      `}</style>
    </div>
  );
}

const tema: TemaBingo = {
  id: 'fliperama',
  nome: 'Fliperama fofo',
  fonteUrl: 'Press+Start+2P',
  familia: PIXEL,
  escalaNumero: 0.62,
  fundoTv: [
    'repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 2px, transparent 2px 5px)',
    'radial-gradient(circle at 30% 20%, #3b1f6b, #120a26 70%)',
  ].join(','),
  texto: '#f4ecff',
  suave: '#b9a6e8',
  destaque: AMARELO,
  caixa: '#1d1240cc',
  quadro: { fundo: '#2c1d5c', texto: '#7d6bb8', acesaFundo: ROSA, acesaTexto: '#ffffff', letraFundo: MENTA, letraTexto: '#1d1240' },
  cartela: {
    fundo: '#1d1240', borda: MENTA, sombra: '#0b0620', cabecalhoFundo: '#2a1650', cabecalhoTexto: AMARELO,
    celulaFundo: '#2c1d5c', celulaTexto: '#d9ccff', raio: 8, raioCelula: 10,
    marcaFundo: ROSA, marcaTexto: '#ffffff', autoFundo: '#4a3a7a', autoTexto: '#c9b8ff',
    estrelaFundo: MENTA, estrelaTexto: '#1d1240', sorte: AMARELO, vence: MENTA,
  },
  aba: { fundo: '#2a1650', texto: AMARELO },
  botao: { fundo: ROSA, texto: '#ffffff', sombra: '#a8306f' },
  frases: { abertura: 'PLAYER 1, aperte START!', quina: 'STAGE CLEAR!', cheia: 'HIGH SCORE!' },
  Maquina,
  Bola,
  Festa,
};

export default tema;
