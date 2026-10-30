/**
 * aquario.tsx — tema «Aquário».
 *
 * Luz de água, bolhinhas subindo. Um peixinho nada de um lado para o outro
 * quando sorteia e a pedra sai numa bolha grande. A marcação é um coral. A
 * festa é um cardume e um mar de bolhas.
 */
import { letraDe } from '../regras';
import type { TemaBingo } from './contrato';

const LETRA = '"Nunito", "Fredoka", sans-serif';
const FUNDO_AGUA = '#0b4f7a';

function Bola({ numero, tamanho, brilho }: { numero: number; tamanho: number; brilho?: boolean }) {
  return (
    <div style={{
      width: tamanho, height: tamanho, borderRadius: '50%', position: 'relative', flexShrink: 0,
      // O brilho da bolha fica no canto, longe da letra e do número.
      background: 'radial-gradient(circle at 20% 17%, #ffffffee 0 5%, #ffffff40 8% 58%, #bfefff99 100%)',
      border: `${Math.max(2, tamanho * 0.03)}px solid #ffffffd9`,
      boxShadow: brilho ? `0 0 ${tamanho * 0.3}px #bfefff, inset 0 -${tamanho * 0.06}px ${tamanho * 0.12}px #7fd3f0` : `inset 0 -${tamanho * 0.06}px ${tamanho * 0.12}px #7fd3f0`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: LETRA, fontWeight: 900, color: FUNDO_AGUA, lineHeight: 0.95,
    }}>
      <span style={{ fontSize: tamanho * 0.15 }}>{letraDe(numero)}</span>
      <span style={{ fontSize: tamanho * 0.38 }}>{numero}</span>
    </div>
  );
}

function Peixe({ tamanho, cor }: { tamanho: number; cor: string }) {
  return (
    <div style={{ width: tamanho, height: tamanho * 0.6, position: 'relative' }}>
      <span style={{ position: 'absolute', left: 0, top: '15%', width: '72%', height: '70%', borderRadius: '50%', background: cor }} />
      <span style={{ position: 'absolute', right: 0, top: '20%', width: '34%', height: '60%', background: cor, clipPath: 'polygon(0 50%, 100% 0, 100% 100%)' }} />
      <span style={{ position: 'absolute', left: '16%', top: '34%', width: tamanho * 0.1, height: tamanho * 0.1, borderRadius: '50%', background: '#fff' }}>
        <span style={{ position: 'absolute', left: '30%', top: '30%', width: '45%', height: '45%', borderRadius: '50%', background: '#123' }} />
      </span>
    </div>
  );
}

function Maquina({ girando, tamanho }: { girando: boolean; tamanho: number }) {
  return (
    <div style={{
      width: tamanho * 1.1, height: tamanho, position: 'relative', flexShrink: 0, borderRadius: tamanho * 0.08, overflow: 'hidden',
      background: 'linear-gradient(180deg, #9ae8f5, #2b9ccf)', border: `${tamanho * 0.025}px solid #e9fbff`,
    }}>
      {/* A areia e as plantinhas */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '16%', background: '#f3dca0' }} />
      {[12, 78].map(x => (
        <span key={x} style={{ position: 'absolute', left: `${x}%`, bottom: '12%', width: tamanho * 0.06, height: tamanho * 0.3, borderRadius: tamanho * 0.05, background: '#3fbf7a', transformOrigin: 'bottom', animation: 'aquario-alga 2.4s ease-in-out infinite alternate' }} />
      ))}
      <div style={{ position: 'absolute', left: '20%', top: '30%', animation: girando ? 'aquario-nada 0.9s ease-in-out infinite alternate' : 'aquario-boia 2.6s ease-in-out infinite alternate' }}>
        <Peixe tamanho={tamanho * 0.45} cor="#ff8a65" />
      </div>
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} style={{
          position: 'absolute', left: `${18 + i * 11}%`, bottom: '-10%', width: tamanho * (0.04 + (i % 3) * 0.02), height: tamanho * (0.04 + (i % 3) * 0.02),
          borderRadius: '50%', border: `${Math.max(1, tamanho * 0.008)}px solid #ffffffcc`,
          animation: `aquario-bolha ${girando ? 0.9 + (i % 3) * 0.2 : 2.8 + (i % 3) * 0.6}s linear ${i * 0.3}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes aquario-nada { from { transform: translateX(0) } to { transform: translateX(${Math.round(tamanho * 0.42)}px) } }
        @keyframes aquario-boia { from { transform: translateY(0) } to { transform: translateY(${Math.round(tamanho * 0.05)}px) } }
        @keyframes aquario-bolha { from { transform: translateY(0); opacity: .9 } to { transform: translateY(-${Math.round(tamanho * 1.15)}px); opacity: 0 } }
        @keyframes aquario-alga { from { transform: rotate(-8deg) } to { transform: rotate(8deg) } }
      `}</style>
    </div>
  );
}

function Festa() {
  const cores = ['#ff8a65', '#ffd54f', '#ff7ac6', '#9be29b', '#7fd8ff'];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute', top: `${8 + (i * 7) % 80}%`, right: -200,
          animation: `aquario-cardume ${5 + (i % 4)}s linear ${(i % 6) * 0.6}s infinite`,
        }}>
          <Peixe tamanho={90 + (i % 3) * 30} cor={cores[i % cores.length]} />
        </div>
      ))}
      {Array.from({ length: 40 }, (_, i) => (
        <span key={`b${i}`} style={{
          position: 'absolute', left: `${(i * 37) % 100}%`, bottom: -60, width: 18 + (i % 4) * 12, height: 18 + (i % 4) * 12,
          borderRadius: '50%', border: '3px solid #ffffffcc', animation: `aquario-sobe ${3 + (i % 5) * 0.6}s linear ${(i % 9) * 0.3}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes aquario-cardume { from { transform: translateX(0) scaleX(-1) } to { transform: translateX(-2300px) scaleX(-1) } }
        @keyframes aquario-sobe { from { transform: translateY(0) } to { transform: translateY(-1200px) } }
      `}</style>
    </div>
  );
}

const tema: TemaBingo = {
  id: 'aquario',
  nome: 'Aquário',
  fonteUrl: 'Nunito:wght@800;900',
  familia: LETRA,
  escalaNumero: 1,
  fundoTv: [
    'radial-gradient(ellipse 60% 30% at 30% 0%, #ffffff55, transparent)',
    'linear-gradient(180deg, #7fe3f0 0%, #1b7fb8 70%, #0e5b86 100%)',
  ].join(','),
  // O topo da água é claro: letra escura, e as caixas claras para manter o contraste.
  texto: FUNDO_AGUA,
  suave: '#2b7aa3',
  destaque: '#e8590c',
  caixa: '#ffffffc2',
  quadro: { fundo: '#e9fbffcc', texto: '#79b8cf', acesaFundo: '#ff8a65', acesaTexto: '#ffffff', letraFundo: FUNDO_AGUA, letraTexto: '#ffd54f' },
  cartela: {
    fundo: '#e9fbff', borda: '#1b7fb8', sombra: '#0e5b86', cabecalhoFundo: '#1b7fb8', cabecalhoTexto: '#ffffff',
    celulaFundo: '#ccf3fa', celulaTexto: FUNDO_AGUA, raio: 22, raioCelula: 50,
    marcaFundo: '#ff8a65', marcaTexto: '#ffffff', autoFundo: '#ffe0d4', autoTexto: '#c25a3a',
    estrelaFundo: '#ffd54f', estrelaTexto: FUNDO_AGUA, sorte: '#ff3d7f', vence: '#00c853',
  },
  aba: { fundo: '#1b7fb8', texto: '#ffffff' },
  botao: { fundo: '#ffd54f', texto: FUNDO_AGUA, sombra: '#c9a227' },
  frases: { abertura: 'Os peixinhos estão prontos para soprar!', quina: 'Pescou uma quina!', cheia: 'O cardume inteiro!' },
  Maquina,
  Bola,
  Festa,
};

export default tema;
