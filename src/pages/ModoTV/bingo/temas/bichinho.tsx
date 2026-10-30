/**
 * bichinho.tsx — tema «Bichinho virtual».
 *
 * Um aparelhinho de bichinho virtual, em forma de ovo, com uma telinha: o
 * pintinho pula quando sorteia, e a pedra sai de um ovo rachado. A festa são
 * corações subindo e o bichinho dançando: na quina ele evolui.
 */
import { letraDe } from '../regras';
import type { TemaBingo } from './contrato';
import type { TipoVitoria } from '../tipos';

const LETRA = '"Fredoka", "Nunito", sans-serif';
const ROSA = '#ffb4c8';
const ROSA_ESCURO = '#d9688a';

function Bola({ numero, tamanho, brilho }: { numero: number; tamanho: number; brilho?: boolean }) {
  const l = tamanho * 0.84;
  return (
    <div style={{
      width: l, height: tamanho, position: 'relative', flexShrink: 0,
      borderRadius: '50% 50% 46% 46% / 58% 58% 42% 42%',
      background: 'radial-gradient(circle at 35% 30%, #ffffff, #fff4d6 60%, #ffe0a3)',
      border: `${Math.max(2, tamanho * 0.03)}px solid #e0a64b`,
      boxShadow: brilho ? `0 0 ${tamanho * 0.28}px #ffe0a3` : undefined,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: tamanho * 0.12,
      fontFamily: LETRA, fontWeight: 700, color: '#8a5a14', lineHeight: 0.95,
    }}>
      {/* A rachadura */}
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" style={{ position: 'absolute', left: '6%', right: '6%', top: '30%', width: '88%', height: tamanho * 0.08 }}>
        <polyline points="0,10 12,2 24,16 36,3 48,15 60,2 72,16 84,4 100,12" fill="none" stroke="#e0a64b" strokeWidth={5} strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: tamanho * 0.14 }}>{letraDe(numero)}</span>
      <span style={{ fontSize: tamanho * 0.34 }}>{numero}</span>
    </div>
  );
}

function Maquina({ girando, tamanho }: { girando: boolean; tamanho: number }) {
  return (
    <div style={{
      width: tamanho * 0.86, height: tamanho, position: 'relative', flexShrink: 0,
      borderRadius: '50% 50% 46% 46% / 55% 55% 45% 45%', background: `radial-gradient(circle at 35% 25%, #ffd6e2, ${ROSA} 60%, #f08fab)`,
      border: `${tamanho * 0.025}px solid ${ROSA_ESCURO}`, boxShadow: `0 ${tamanho * 0.03}px 0 ${ROSA_ESCURO}`,
    }}>
      <div style={{
        position: 'absolute', left: '20%', right: '20%', top: '24%', height: '40%', borderRadius: tamanho * 0.05,
        background: '#c9d9a3', border: `${tamanho * 0.02}px solid #7a8a4c`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden',
      }}>
        <span style={{ fontSize: tamanho * 0.2, lineHeight: 1, marginBottom: tamanho * 0.02, animation: girando ? 'bichinho-pula 0.35s ease-in-out infinite alternate' : 'bichinho-respira 2s ease-in-out infinite alternate' }}>🐣</span>
      </div>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          position: 'absolute', left: `${27 + i * 17}%`, top: '72%', width: tamanho * 0.1, height: tamanho * 0.1, borderRadius: '50%',
          background: ['#fff176', '#80deea', '#a5d6a7'][i], border: `${tamanho * 0.012}px solid ${ROSA_ESCURO}`,
          animation: girando ? `bichinho-botao 0.3s ${i * 0.1}s steps(2) infinite` : undefined,
        }} />
      ))}
      <style>{`
        @keyframes bichinho-pula { from { transform: translateY(0) } to { transform: translateY(-${Math.round(tamanho * 0.08)}px) } }
        @keyframes bichinho-respira { from { transform: scale(1) } to { transform: scale(1.06) } }
        @keyframes bichinho-botao { to { transform: translateY(${Math.round(tamanho * 0.01)}px); filter: brightness(.8) } }
      `}</style>
    </div>
  );
}

function Festa({ tipo }: { tipo: TipoVitoria }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 36 }, (_, i) => (
        <span key={i} style={{
          position: 'absolute', left: `${(i * 29) % 100}%`, bottom: -80, fontSize: 40 + (i % 4) * 14,
          animation: `bichinho-coracao ${3.2 + (i % 5) * 0.5}s ease-in ${(i % 9) * 0.3}s infinite`,
        }}>{['💖', '💗', '💕', '✨'][i % 4]}</span>
      ))}
      {/* Na quina o bichinho evolui; no bingo, já evoluído, dança. */}
      <span style={{ position: 'absolute', left: 90, bottom: 90, fontSize: 150, animation: 'bichinho-danca 0.6s ease-in-out infinite alternate' }}>
        {tipo === 'cheia' ? '🐓' : '🐥'}
      </span>
      <style>{`
        @keyframes bichinho-coracao { from { transform: translateY(0) scale(.8); opacity: 1 } to { transform: translateY(-1250px) scale(1.2); opacity: .2 } }
        @keyframes bichinho-danca { from { transform: rotate(-12deg) translateY(0) } to { transform: rotate(12deg) translateY(-30px) } }
      `}</style>
    </div>
  );
}

const tema: TemaBingo = {
  id: 'bichinho',
  nome: 'Bichinho virtual',
  fonteUrl: 'Fredoka:wght@500;600;700',
  familia: LETRA,
  escalaNumero: 1,
  fundoTv: 'radial-gradient(circle at 20% 15%, #f1fbe9 0%, #d8f5c9 45%, #a6e3c4 100%)',
  texto: '#4a3a5a',
  suave: '#7a6b88',
  destaque: ROSA_ESCURO,
  caixa: '#ffffffb3',
  quadro: { fundo: '#fffaf0', texto: '#d8c4ce', acesaFundo: '#8fd18b', acesaTexto: '#ffffff', letraFundo: ROSA_ESCURO, letraTexto: '#ffffff' },
  cartela: {
    fundo: '#fffaf0', borda: ROSA_ESCURO, sombra: '#b04a6c', cabecalhoFundo: ROSA, cabecalhoTexto: '#7a2448',
    celulaFundo: '#ffeef3', celulaTexto: '#b04a6c', raio: 22, raioCelula: 28,
    marcaFundo: '#8fd18b', marcaTexto: '#ffffff', autoFundo: '#e3f3d9', autoTexto: '#4f8a4a',
    estrelaFundo: '#ffc94d', estrelaTexto: '#ffffff', sorte: '#ff8a65', vence: '#43a047',
  },
  aba: { fundo: ROSA_ESCURO, texto: '#ffffff' },
  botao: { fundo: '#ffc94d', texto: '#7a2448', sombra: '#d99a1e' },
  frases: { abertura: 'O ovinho está quentinho…', quina: 'Evoluiu!', cheia: 'Dança da vitória!' },
  Maquina,
  Bola,
  Festa,
};

export default tema;
