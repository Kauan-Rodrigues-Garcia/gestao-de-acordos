/**
 * gacha.tsx — tema «Máquina de cápsulas».
 *
 * Uma máquina de cápsulas de brinquedo: a manivela gira e as cápsulas chacoalham
 * na cúpula quando sorteia; a pedra sai numa cápsula aberta ao meio. A festa é
 * uma chuva de cápsulas: «Prêmio raro!».
 */
import { letraDe } from '../regras';
import type { TemaBingo } from './contrato';

const LETRA = '"Bungee", "Fredoka", sans-serif';
const VERMELHO = '#ff4f6d';
const VERMELHO_ESCURO = '#b3233d';

const CAPSULA: Record<string, string> = { B: '#ff6f91', I: '#ffc93c', N: '#3ec6ff', G: '#5fd38d', O: '#b18cff' };

function Bola({ numero, tamanho, brilho }: { numero: number; tamanho: number; brilho?: boolean }) {
  const cor = CAPSULA[letraDe(numero)];
  return (
    <div style={{
      width: tamanho, height: tamanho, borderRadius: '50%', position: 'relative', flexShrink: 0, overflow: 'hidden',
      background: `linear-gradient(180deg, ${cor} 0 48%, #f8fbff 48% 100%)`,
      border: `${Math.max(2, tamanho * 0.04)}px solid #1c3d5a`,
      boxShadow: brilho ? `0 0 ${tamanho * 0.3}px ${cor}` : undefined,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: LETRA, color: '#1c3d5a', lineHeight: 1,
    }}>
      <span style={{ position: 'absolute', left: '-4%', right: '-4%', top: '46%', height: Math.max(2, tamanho * 0.04), background: '#1c3d5a' }} />
      <span style={{ position: 'absolute', left: '18%', top: '10%', width: '24%', height: '14%', borderRadius: '50%', background: '#ffffff88' }} />
      <span style={{ position: 'relative', fontSize: tamanho * 0.13, color: '#fff', marginBottom: tamanho * 0.04 }}>{letraDe(numero)}</span>
      <span style={{ position: 'relative', fontSize: tamanho * 0.3, background: '#fff', padding: `0 ${tamanho * 0.05}px`, borderRadius: tamanho * 0.06 }}>{numero}</span>
    </div>
  );
}

function Maquina({ girando, tamanho }: { girando: boolean; tamanho: number }) {
  const dentro = Object.values(CAPSULA);
  return (
    <div style={{ width: tamanho * 0.8, height: tamanho * 1.2, position: 'relative', flexShrink: 0 }}>
      {/* A cúpula */}
      <div style={{
        position: 'absolute', left: '4%', right: '4%', top: 0, height: '52%', borderRadius: `${tamanho * 0.3}px ${tamanho * 0.3}px ${tamanho * 0.04}px ${tamanho * 0.04}px`,
        background: 'radial-gradient(circle at 30% 25%, #ffffffee, #cfefffbb 70%)', border: `${tamanho * 0.025}px solid ${VERMELHO_ESCURO}`, overflow: 'hidden',
      }}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} style={{
            position: 'absolute', left: `${8 + (i % 4) * 22}%`, top: `${30 + Math.floor(i / 4) * 22}%`,
            width: tamanho * 0.16, height: tamanho * 0.16, borderRadius: '50%',
            background: `linear-gradient(180deg, ${dentro[i % dentro.length]} 0 50%, #fff 50%)`, border: `${Math.max(1, tamanho * 0.008)}px solid #1c3d5a`,
            animation: girando ? `gacha-mexe ${0.25 + (i % 3) * 0.07}s ease-in-out ${i * 0.02}s infinite alternate` : undefined,
          }} />
        ))}
      </div>
      {/* O corpo */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '48%', bottom: 0, borderRadius: tamanho * 0.06,
        background: `linear-gradient(180deg, ${VERMELHO}, #e23b59)`, border: `${tamanho * 0.025}px solid ${VERMELHO_ESCURO}`,
      }}>
        <div style={{
          position: 'absolute', left: '50%', top: '18%', width: tamanho * 0.26, height: tamanho * 0.26, marginLeft: -tamanho * 0.13,
          borderRadius: '50%', background: '#ffd84f', border: `${tamanho * 0.02}px solid ${VERMELHO_ESCURO}`,
          animation: girando ? 'gacha-manivela 0.6s linear infinite' : undefined,
        }}>
          <span style={{ position: 'absolute', left: '42%', top: '-4%', width: '16%', height: '108%', background: VERMELHO_ESCURO, borderRadius: tamanho * 0.02 }} />
        </div>
        <span style={{ position: 'absolute', left: '50%', bottom: '10%', width: tamanho * 0.26, height: tamanho * 0.14, marginLeft: -tamanho * 0.13, borderRadius: tamanho * 0.03, background: '#5a0f1f' }} />
      </div>
      <style>{`
        @keyframes gacha-mexe { from { transform: translate(0, 0) rotate(0) } to { transform: translate(${Math.round(tamanho * 0.02)}px, -${Math.round(tamanho * 0.06)}px) rotate(40deg) } }
        @keyframes gacha-manivela { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}

function Festa() {
  const cores = Object.values(CAPSULA);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 30 }, (_, i) => (
        <span key={i} style={{
          position: 'absolute', left: `${(i * 33) % 100}%`, top: -100, width: 60 + (i % 3) * 16, height: 60 + (i % 3) * 16, borderRadius: '50%',
          background: `linear-gradient(180deg, ${cores[i % cores.length]} 0 50%, #fff 50%)`, border: '4px solid #1c3d5a',
          animation: `gacha-chove ${3 + (i % 5) * 0.4}s cubic-bezier(.4,0,.8,1) ${(i % 8) * 0.35}s infinite`,
        }} />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <span key={`s${i}`} style={{
          position: 'absolute', left: `${(i * 61) % 100}%`, top: `${(i * 23) % 90}%`, fontSize: 46, color: '#ffd84f',
          textShadow: '0 0 16px #ffd84f', animation: `gacha-raro 1.1s ease-in-out ${(i % 5) * 0.2}s infinite`,
        }}>✦</span>
      ))}
      <style>{`
        @keyframes gacha-chove { 0% { transform: translateY(0) rotate(0) } 85% { transform: translateY(1050px) rotate(400deg) } 100% { transform: translateY(1000px) rotate(420deg) } }
        @keyframes gacha-raro { 0%, 100% { opacity: .2; transform: scale(.6) rotate(0) } 50% { opacity: 1; transform: scale(1.3) rotate(20deg) } }
      `}</style>
    </div>
  );
}

const tema: TemaBingo = {
  id: 'gacha',
  nome: 'Máquina de cápsulas',
  fonteUrl: 'Bungee',
  familia: LETRA,
  escalaNumero: 0.82,
  fundoTv: 'repeating-linear-gradient(45deg, #fff1d6 0 34px, #ffe3b0 34px 68px)',
  texto: '#1c3d5a',
  suave: '#5c7a92',
  destaque: VERMELHO,
  caixa: '#ffffffcc',
  quadro: { fundo: '#fff7e6', texto: '#b98f55', acesaFundo: '#3ec6ff', acesaTexto: '#ffffff', letraFundo: VERMELHO, letraTexto: '#ffffff' },
  cartela: {
    fundo: '#ffffff', borda: VERMELHO, sombra: VERMELHO_ESCURO, cabecalhoFundo: VERMELHO, cabecalhoTexto: '#ffffff',
    celulaFundo: '#fff1d6', celulaTexto: VERMELHO_ESCURO, raio: 16, raioCelula: 22,
    marcaFundo: '#3ec6ff', marcaTexto: '#ffffff', autoFundo: '#d8f3ff', autoTexto: '#1c6f9c',
    estrelaFundo: '#ffd84f', estrelaTexto: VERMELHO_ESCURO, sorte: '#ff9f1c', vence: '#2ecc71',
  },
  aba: { fundo: VERMELHO, texto: '#ffffff' },
  botao: { fundo: '#ffd84f', texto: VERMELHO_ESCURO, sombra: '#c9a227' },
  frases: { abertura: 'Gire a manivela da sorte!', quina: 'Cápsula premiada!', cheia: 'Prêmio raro!' },
  Maquina,
  Bola,
  Festa,
};

export default tema;
