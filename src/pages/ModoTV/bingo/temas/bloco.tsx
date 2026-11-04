/**
 * bloco.tsx — tema «Bloco surpresa» (plataforma 16-bit).
 *
 * Céu, nuvem, grama e terra. O bloco dourado leva uma cabeçada e solta uma
 * moeda com o número; a cartela é de tijolinhos. A festa são fogos de pixel.
 * Tudo original: bloco com «!», moeda e tijolo são o vocabulário do gênero,
 * sem personagem nem marca de jogo nenhum.
 */
import type { CSSProperties } from 'react';
import { letraDe } from '../regras';
import type { TemaBingo } from './contrato';

const PIXEL = '"Press Start 2P", monospace';
const OURO = '#ffd21f';
const MARROM = '#8a4b08';

function Bola({ numero, tamanho, brilho }: { numero: number; tamanho: number; brilho?: boolean }) {
  return (
    <div style={{
      width: tamanho * 0.86, height: tamanho, borderRadius: '50%', flexShrink: 0,
      background: `radial-gradient(ellipse at 35% 28%, #fff6b0 0 12%, ${OURO} 13% 60%, #d99a00 100%)`,
      border: `${Math.max(3, tamanho * 0.04)}px solid ${MARROM}`,
      boxShadow: brilho ? `0 0 ${tamanho * 0.3}px ${OURO}` : undefined,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: PIXEL, color: MARROM, lineHeight: 1.2,
      imageRendering: 'pixelated',
    }}>
      <span style={{ fontSize: tamanho * 0.11 }}>{letraDe(numero)}</span>
      <span style={{ fontSize: tamanho * 0.24 }}>{numero}</span>
    </div>
  );
}

function Maquina({ girando, tamanho }: { girando: boolean; tamanho: number }) {
  const lado = tamanho * 0.62;
  const tijolo = (x: number): CSSProperties => ({
    position: 'absolute', top: tamanho * 0.08, left: x, width: lado * 0.9, height: lado * 0.9,
    background: '#c8682a', boxShadow: `inset -${lado * 0.06}px -${lado * 0.06}px 0 #8f4316, inset ${lado * 0.06}px ${lado * 0.06}px 0 #e7955a`,
    border: `${tamanho * 0.012}px solid #3b1f04`,
  });
  return (
    <div style={{ width: tamanho * 1.6, height: tamanho, position: 'relative', flexShrink: 0 }}>
      <div style={tijolo(0)} />
      <div style={{
        position: 'absolute', top: tamanho * 0.08, left: tamanho * 0.8 - lado / 2, width: lado, height: lado,
        background: '#f6b21b', border: `${tamanho * 0.02}px solid ${MARROM}`,
        boxShadow: `inset -${lado * 0.08}px -${lado * 0.08}px 0 #c98207, inset ${lado * 0.08}px ${lado * 0.08}px 0 #ffd970`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: PIXEL, fontSize: lado * 0.5, color: '#fff', textShadow: `${lado * 0.04}px ${lado * 0.04}px 0 ${MARROM}`,
        animation: girando ? 'bloco-bate 0.42s steps(4) infinite' : undefined,
      }}>!</div>
      <div style={tijolo(tamanho * 1.6 - lado * 0.9)} />
      <style>{`
        @keyframes bloco-bate { 0%, 100% { transform: translateY(0) } 40% { transform: translateY(-${Math.round(tamanho * 0.12)}px) } }
      `}</style>
    </div>
  );
}

const CORES_FOGO = ['#ff5b5b', '#ffd21f', '#5bd2ff', '#7cff5b', '#ff8ef5'];

function Festa() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 7 }, (_, k) => (
        <div key={k} style={{
          position: 'absolute', left: `${8 + k * 13}%`, top: `${12 + (k % 3) * 14}%`, width: 0, height: 0,
          animation: `bloco-estoura 1.8s steps(6) ${k * 0.45}s infinite`,
        }}>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <span key={i} style={{
                position: 'absolute', width: 18, height: 18, background: CORES_FOGO[(k + i) % CORES_FOGO.length],
                transform: `translate(${Math.cos(a) * 140}px, ${Math.sin(a) * 140}px)`,
              }} />
            );
          })}
        </div>
      ))}
      {/* A bandeira subindo no mastro. */}
      <div style={{ position: 'absolute', right: 120, bottom: 120, width: 14, height: 520, background: '#e8e8e8', border: '4px solid #3b1f04' }}>
        <div style={{ position: 'absolute', left: 14, top: 0, width: 110, height: 70, background: '#3fbf3f', border: '4px solid #1f5f1f',
          animation: 'bloco-sobe 2.4s steps(12) both' }} />
      </div>
      <style>{`
        @keyframes bloco-estoura { 0% { transform: scale(.1); opacity: 1 } 80% { opacity: 1 } 100% { transform: scale(1.4); opacity: 0 } }
        @keyframes bloco-sobe { from { transform: translateY(440px) } to { transform: translateY(0) } }
      `}</style>
    </div>
  );
}

const CEU = [
  'radial-gradient(ellipse 160px 60px at 18% 18%, #ffffff 98%, transparent)',
  'radial-gradient(ellipse 220px 70px at 72% 12%, #ffffff 98%, transparent)',
  'linear-gradient(180deg, #6ec6ff 0%, #8fd3ff 82%, #6cc04a 82% 86%, #a0612a 86%)',
].join(',');

const tema: TemaBingo = {
  id: 'bloco',
  nome: 'Bloco surpresa',
  fonteUrl: 'Press+Start+2P',
  familia: PIXEL,
  escalaNumero: 0.62,
  fundoTv: CEU,
  texto: '#1d2b53',
  suave: '#2f4d8a',
  destaque: '#d93a3a',
  caixa: '#ffffffcc',
  quadro: { fundo: '#d9894a', texto: '#5a3108', acesaFundo: OURO, acesaTexto: MARROM, letraFundo: '#5a3108', letraTexto: OURO },
  cartela: {
    fundo: '#a0612a', borda: '#5a3108', sombra: '#3b1f04', cabecalhoFundo: '#5a3108', cabecalhoTexto: OURO,
    celulaFundo: '#d9894a', celulaTexto: '#3b1f04', raio: 4, raioCelula: 6,
    marcaFundo: OURO, marcaTexto: MARROM, autoFundo: '#f3e2a8', autoTexto: '#8a6a2a',
    estrelaFundo: '#ff5b5b', estrelaTexto: '#ffffff', sorte: '#5bd2ff', vence: '#3fbf3f',
  },
  aba: { fundo: '#d93a3a', texto: '#ffffff' },
  botao: { fundo: OURO, texto: MARROM, sombra: '#b07a00' },
  frases: { abertura: 'Prepare o pulo: o bloco vai soltar moedas!', quina: 'Fase concluída!', cheia: 'Bandeira no topo!' },
  Maquina,
  Bola,
  Festa,
};

export default tema;
