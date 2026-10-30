/**
 * rpg.tsx — tema «Aventura RPG» (aconchegante).
 *
 * Um baú do tesouro na relva: a tampa sacode quando sorteia e a pedra sai
 * como uma moeda dourada. A cartela é um pergaminho de missão. A festa é uma
 * chuva de moedas e brilhos: «Missão cumprida!».
 */
import { letraDe } from '../regras';
import type { TemaBingo } from './contrato';

const LETRA = '"Baloo 2", "Nunito", sans-serif';
const OURO = '#e9b949';
const MADEIRA = '#7a4b22';

function Bola({ numero, tamanho, brilho }: { numero: number; tamanho: number; brilho?: boolean }) {
  return (
    <div style={{
      width: tamanho, height: tamanho, borderRadius: '50%', flexShrink: 0,
      // O brilho fica no canto, longe da letra e do número.
      background: `radial-gradient(circle at 20% 18%, #fff6c9 0 5%, ${OURO} 9% 58%, #b9851d 100%)`,
      border: `${Math.max(3, tamanho * 0.045)}px solid #fff1b8`,
      boxShadow: brilho ? `0 0 ${tamanho * 0.32}px ${OURO}aa, inset 0 0 0 ${tamanho * 0.05}px #c99a2a` : `inset 0 0 0 ${tamanho * 0.05}px #c99a2a`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: LETRA, fontWeight: 800, color: '#5a3a0a', lineHeight: 0.95,
    }}>
      <span style={{ fontSize: tamanho * 0.15 }}>{letraDe(numero)}</span>
      <span style={{ fontSize: tamanho * 0.38 }}>{numero}</span>
    </div>
  );
}

function Maquina({ girando, tamanho }: { girando: boolean; tamanho: number }) {
  const l = tamanho * 1.1;
  return (
    <div style={{ width: l, height: tamanho, position: 'relative', flexShrink: 0 }}>
      {/* O brilho que escapa do baú */}
      {girando && <div style={{ position: 'absolute', left: '15%', right: '15%', top: '5%', height: '45%', borderRadius: '50%', background: `radial-gradient(${OURO}cc, transparent 70%)`, animation: 'rpg-luz 0.5s ease-in-out infinite alternate' }} />}
      {/* A tampa */}
      <div style={{
        position: 'absolute', left: '6%', right: '6%', top: '22%', height: '30%',
        borderRadius: `${tamanho * 0.2}px ${tamanho * 0.2}px ${tamanho * 0.02}px ${tamanho * 0.02}px`,
        background: `linear-gradient(180deg, #a0622d, ${MADEIRA})`, border: `${tamanho * 0.025}px solid ${OURO}`,
        transformOrigin: 'bottom center', animation: girando ? 'rpg-tampa 0.22s ease-in-out infinite alternate' : undefined,
      }} />
      {/* O corpo */}
      <div style={{
        position: 'absolute', left: '6%', right: '6%', top: '50%', height: '44%', borderRadius: `${tamanho * 0.02}px ${tamanho * 0.02}px ${tamanho * 0.05}px ${tamanho * 0.05}px`,
        background: `linear-gradient(180deg, ${MADEIRA}, #5a3414)`, border: `${tamanho * 0.025}px solid ${OURO}`,
      }}>
        <div style={{ position: 'absolute', left: '50%', top: '-12%', width: tamanho * 0.16, height: tamanho * 0.2, marginLeft: -tamanho * 0.08, background: OURO, borderRadius: tamanho * 0.03, border: `${tamanho * 0.012}px solid #8a6312` }}>
          <span style={{ position: 'absolute', left: '50%', top: '40%', width: tamanho * 0.04, height: tamanho * 0.06, marginLeft: -tamanho * 0.02, background: '#3a2406', borderRadius: tamanho * 0.02 }} />
        </div>
      </div>
      <span style={{ position: 'absolute', right: '2%', top: 0, fontSize: tamanho * 0.16, color: '#fff3c4', textShadow: `0 0 ${tamanho * 0.06}px #fff3c4`, animation: 'rpg-brilho 1.4s ease-in-out infinite' }}>✦</span>
      <style>{`
        @keyframes rpg-tampa { from { transform: rotate(0) } to { transform: rotate(-9deg) translateY(-${Math.round(tamanho * 0.05)}px) } }
        @keyframes rpg-luz { from { opacity: .4 } to { opacity: 1 } }
        @keyframes rpg-brilho { 0%, 100% { opacity: .3; transform: scale(.7) } 50% { opacity: 1; transform: scale(1.1) } }
      `}</style>
    </div>
  );
}

function Festa() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 34 }, (_, i) => (
        <span key={i} style={{
          position: 'absolute', left: `${(i * 29) % 100}%`, top: -90,
          width: 52 + (i % 3) * 14, height: 52 + (i % 3) * 14, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, #fff6c9, ${OURO} 55%, #b9851d)`, border: '4px solid #fff1b8',
          animation: `rpg-moeda ${3 + (i % 5) * 0.45}s linear ${(i % 8) * 0.35}s infinite`,
        }} />
      ))}
      {Array.from({ length: 14 }, (_, i) => (
        <span key={`b${i}`} style={{
          position: 'absolute', left: `${(i * 53) % 100}%`, top: `${(i * 37) % 90}%`, fontSize: 40, color: '#fff3c4',
          textShadow: '0 0 14px #fff3c4', animation: `rpg-faisca 1.2s ease-in-out ${(i % 6) * 0.2}s infinite`,
        }}>✦</span>
      ))}
      <style>{`
        @keyframes rpg-moeda { from { transform: translateY(0) rotateY(0) } to { transform: translateY(1260px) rotateY(1080deg) } }
        @keyframes rpg-faisca { 0%, 100% { opacity: .2; transform: scale(.6) } 50% { opacity: 1; transform: scale(1.2) } }
      `}</style>
    </div>
  );
}

const tema: TemaBingo = {
  id: 'rpg',
  nome: 'Aventura RPG',
  fonteUrl: 'Baloo+2:wght@600;800',
  familia: LETRA,
  escalaNumero: 1,
  fundoTv: 'radial-gradient(ellipse at 50% 0%, #4c7a5f 0%, #2d4a3e 45%, #1b2e27 100%)',
  texto: '#fff7e2',
  suave: '#cfe3c8',
  destaque: OURO,
  caixa: '#1b2e27cc',
  quadro: { fundo: '#ead3a2', texto: '#a88a52', acesaFundo: OURO, acesaTexto: '#4a2e06', letraFundo: MADEIRA, letraTexto: '#ffe9a8' },
  cartela: {
    fundo: '#f4e4c1', borda: MADEIRA, sombra: '#4a2e10', cabecalhoFundo: MADEIRA, cabecalhoTexto: '#ffe9a8',
    celulaFundo: '#ead3a2', celulaTexto: '#5a3a0a', raio: 12, raioCelula: 16,
    marcaFundo: '#4e8a5c', marcaTexto: '#ffffff', autoFundo: '#c9d9b0', autoTexto: '#3f6a46',
    estrelaFundo: OURO, estrelaTexto: '#5a3a0a', sorte: '#d9534f', vence: OURO,
  },
  aba: { fundo: MADEIRA, texto: '#ffe9a8' },
  botao: { fundo: OURO, texto: '#4a2e06', sombra: '#9a7316' },
  frases: { abertura: 'Aventureiros, o baú está pronto!', quina: 'Missão cumprida!', cheia: 'Tesouro encontrado!' },
  Maquina,
  Bola,
  Festa,
};

export default tema;
