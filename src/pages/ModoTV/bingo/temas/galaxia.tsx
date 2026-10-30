/**
 * galaxia.tsx — tema «Galáxia fofa».
 *
 * Fundo de estrelas; um foguetinho em cima da lua treme e solta fogo quando
 * sorteia, e a pedra sai como um planeta com anel. A festa é uma chuva de
 * estrelas cadentes: «Decolagem!».
 */
import { letraDe } from '../regras';
import type { TemaBingo } from './contrato';

const LETRA = '"Fredoka", "Nunito", sans-serif';

const PLANETA: Record<string, [string, string]> = {
  B: ['#ffd1ec', '#ff7ac6'], I: ['#fff1a8', '#f5b62a'], N: ['#bfe9ff', '#3fa8f0'],
  G: ['#c8f7c5', '#3fbf7a'], O: ['#e2d1ff', '#9b3df0'],
};

function Bola({ numero, tamanho, brilho }: { numero: number; tamanho: number; brilho?: boolean }) {
  const [claro, escuro] = PLANETA[letraDe(numero)];
  return (
    <div style={{ width: tamanho, height: tamanho, position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: tamanho, height: tamanho, borderRadius: '50%', position: 'relative', zIndex: 1,
        background: `radial-gradient(circle at 35% 30%, ${claro}, ${escuro} 75%)`,
        boxShadow: brilho ? `0 0 ${tamanho * 0.35}px ${escuro}aa` : undefined,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: LETRA, fontWeight: 700, color: '#fff', lineHeight: 0.95, textShadow: `0 ${tamanho * 0.02}px ${tamanho * 0.04}px #0005`,
      }}>
        <span style={{ fontSize: tamanho * 0.14 }}>{letraDe(numero)}</span>
        <span style={{ fontSize: tamanho * 0.36 }}>{numero}</span>
      </div>
      {/* O anel fica atrás do planeta e sobra para os lados: nunca passa por cima do número. */}
      <div style={{
        position: 'absolute', left: '-14%', right: '-14%', top: '42%', height: tamanho * 0.18, borderRadius: '50%',
        border: `${Math.max(2, tamanho * 0.035)}px solid #ffe66dcc`, transform: 'rotate(-14deg)', zIndex: 0,
      }} />
    </div>
  );
}

function Maquina({ girando, tamanho }: { girando: boolean; tamanho: number }) {
  return (
    <div style={{ width: tamanho, height: tamanho * 1.1, position: 'relative', flexShrink: 0 }}>
      {/* A lua */}
      <div style={{
        position: 'absolute', left: '5%', right: '5%', bottom: 0, height: '34%', borderRadius: '50% 50% 0 0',
        background: 'radial-gradient(circle at 30% 30%, #f1f1ff, #b8b8d9)',
      }}>
        {[[18, 30, 10], [55, 45, 14], [75, 25, 8]].map(([x, y, r], i) => (
          <span key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: tamanho * r / 100, height: tamanho * r / 100, borderRadius: '50%', background: '#9e9ec4' }} />
        ))}
      </div>
      {/* O foguete */}
      <div style={{
        position: 'absolute', left: '50%', bottom: '28%', width: tamanho * 0.28, height: tamanho * 0.6, marginLeft: -tamanho * 0.14,
        animation: girando ? 'galaxia-treme 0.08s linear infinite alternate' : undefined,
      }}>
        <div style={{ position: 'absolute', inset: '0 0 18% 0', borderRadius: '50% 50% 18% 18% / 60% 60% 18% 18%', background: 'linear-gradient(90deg, #e6e6f5, #ffffff 45%, #c9c9e3)', border: `${tamanho * 0.012}px solid #6b5bd6` }} />
        <span style={{ position: 'absolute', left: '28%', top: '26%', width: '44%', height: '18%', borderRadius: '50%', background: '#7fd8ff', border: `${tamanho * 0.012}px solid #6b5bd6` }} />
        <span style={{ position: 'absolute', left: '-22%', bottom: '14%', width: '40%', height: '30%', background: '#ff7ac6', borderRadius: '60% 0 20% 20%' }} />
        <span style={{ position: 'absolute', right: '-22%', bottom: '14%', width: '40%', height: '30%', background: '#ff7ac6', borderRadius: '0 60% 20% 20%' }} />
        {girando && (
          <span style={{ position: 'absolute', left: '22%', bottom: '-30%', width: '56%', height: '50%', borderRadius: '50% 50% 50% 50% / 30% 30% 70% 70%',
            background: 'radial-gradient(circle at 50% 20%, #fff, #ffe66d 35%, #ff8a3d 70%, transparent 72%)', animation: 'galaxia-fogo 0.12s linear infinite alternate' }} />
        )}
      </div>
      <style>{`
        @keyframes galaxia-treme { from { transform: translate(-2px, 0) } to { transform: translate(2px, -3px) } }
        @keyframes galaxia-fogo { from { transform: scaleY(.8) } to { transform: scaleY(1.25) } }
      `}</style>
    </div>
  );
}

function Festa() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 22 }, (_, i) => (
        <span key={i} style={{
          position: 'absolute', left: `${(i * 31) % 100}%`, top: -40, width: 220, height: 4, borderRadius: 4,
          background: 'linear-gradient(90deg, transparent, #ffe66d, #fff)', transform: 'rotate(35deg)',
          animation: `galaxia-cadente ${1.6 + (i % 4) * 0.4}s linear ${(i % 9) * 0.3}s infinite`,
        }} />
      ))}
      {Array.from({ length: 30 }, (_, i) => (
        <span key={`e${i}`} style={{
          position: 'absolute', left: `${(i * 47) % 100}%`, top: `${(i * 19) % 100}%`, fontSize: 26 + (i % 3) * 12,
          color: ['#ffe66d', '#ff9ad5', '#9be7ff'][i % 3], animation: `galaxia-pisca 1.4s ease-in-out ${(i % 7) * 0.2}s infinite`,
        }}>✦</span>
      ))}
      <style>{`
        @keyframes galaxia-cadente { from { transform: translate(-200px, 0) rotate(35deg); opacity: 1 } to { transform: translate(900px, 1200px) rotate(35deg); opacity: 0 } }
        @keyframes galaxia-pisca { 0%, 100% { opacity: .25; transform: scale(.7) } 50% { opacity: 1; transform: scale(1.2) } }
      `}</style>
    </div>
  );
}

const ESTRELAS = [
  'radial-gradient(#ffffff 1.6px, transparent 2.2px) 0 0 / 52px 52px',
  'radial-gradient(#ffe9a8 1.3px, transparent 2px) 26px 31px / 83px 83px',
  'radial-gradient(circle at 75% 25%, #3d2a7a, #0c0b24 65%)',
].join(',');

const tema: TemaBingo = {
  id: 'galaxia',
  nome: 'Galáxia fofa',
  fonteUrl: 'Fredoka:wght@500;600;700',
  familia: LETRA,
  escalaNumero: 1,
  fundoTv: ESTRELAS,
  texto: '#f3eeff',
  suave: '#b7acef',
  destaque: '#ffe66d',
  caixa: '#17143dcc',
  quadro: { fundo: '#252060', texto: '#6d64b8', acesaFundo: '#ff7ac6', acesaTexto: '#ffffff', letraFundo: '#ffe66d', letraTexto: '#17143d' },
  cartela: {
    fundo: '#17143d', borda: '#9b8cff', sombra: '#0a0820', cabecalhoFundo: '#2b2470', cabecalhoTexto: '#ffe66d',
    celulaFundo: '#252060', celulaTexto: '#cfc6ff', raio: 20, raioCelula: 50,
    marcaFundo: '#ff7ac6', marcaTexto: '#ffffff', autoFundo: '#3a3480', autoTexto: '#b9b0ff',
    estrelaFundo: '#ffe66d', estrelaTexto: '#17143d', sorte: '#7fd8ff', vence: '#ffe66d',
  },
  aba: { fundo: '#2b2470', texto: '#ffe66d' },
  botao: { fundo: '#ffe66d', texto: '#17143d', sombra: '#b89a1e' },
  frases: { abertura: '3, 2, 1… preparar para a decolagem!', quina: 'Em órbita!', cheia: 'Decolagem!' },
  Maquina,
  Bola,
  Festa,
};

export default tema;
