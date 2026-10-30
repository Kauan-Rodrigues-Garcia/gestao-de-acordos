/**
 * Pixel.tsx — o estilo «Pixel art» da cena «Destaque»: tela de recorde de
 * fliperama. A foto vira pixel de verdade (desenhada pequena num canvas e
 * ampliada sem suavizar), o valor é o SCORE e os pagamentos, o COMBO.
 *
 * A letra é a Press Start 2P que o app já serve (`/fonts`), sem internet. Ela
 * não tem as maiúsculas acentuadas: o texto daqui sai sem acento.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { caber, dadosDoDestaque, iniciais, type PropsEstilo } from './comum';
import { Animacoes } from './pecas';

const PIXEL = '"Press Start 2P", ui-monospace, monospace';
const FUNDO = '#140c3a';
const AMARELO = '#ffd84a';
const CIANO = '#4ef0ff';
const ROSA = '#ff4fa3';
const VERDE = '#5cff7a';

/** Lado da foto em pixels «de jogo»: dá para reconhecer a pessoa e ainda é pixel. */
const LADO = 64;

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Moldura de janela de jogo: branco, preto, branco — tudo em degraus duros. */
const janela = (cor = '#ffffff'): CSSProperties => ({
  background: '#1f1656',
  boxShadow: `0 0 0 6px #000, 0 0 0 12px ${cor}, 0 0 0 18px #000, 18px 18px 0 18px rgba(0,0,0,.45)`,
});

function FotoPixel({ foto, nome }: { foto: string | null; nome: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [pronta, setPronta] = useState(false);

  useEffect(() => {
    setPronta(false);
    if (!foto) return;
    let vivo = true;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const c = ref.current;
      const ctx = c?.getContext('2d');
      if (!vivo || !c || !ctx) return;
      const lado = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO, LADO);
      setPronta(true);
    };
    img.src = foto;
    return () => { vivo = false; };
  }, [foto]);

  return (
    <>
      <canvas ref={ref} width={LADO} height={LADO} style={{
        width: '100%', height: '100%', imageRendering: 'pixelated', display: pronta ? 'block' : 'none',
      }} />
      {!pronta && (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `repeating-linear-gradient(0deg, #2a1f73 0 40px, #241a66 40px 80px)`,
          fontFamily: PIXEL, fontSize: nome ? 150 : 220, color: AMARELO, textShadow: '10px 10px 0 #000',
        }}>
          {nome ? semAcento(iniciais(nome)) : '?'}
        </div>
      )}
    </>
  );
}

/** Coração de pixel, 7×6. */
function CoracaoPixel({ cheio = true }: { cheio?: boolean }) {
  const mapa = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
  return (
    <svg viewBox="0 0 7 6" width={56} height={48} shapeRendering="crispEdges" aria-hidden>
      {mapa.flatMap((linha, y) => [...linha].map((b, x) => (b === '1'
        ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={cheio ? ROSA : '#3b2f7a'} />
        : null)))}
    </svg>
  );
}

const entra = (atraso: number): CSSProperties => ({ animation: `pixel-entra 500ms steps(5, end) ${atraso}ms both` });

export function DestaquePixel({ v, tela }: PropsEstilo) {
  const d = dadosDoDestaque(v, tela, { dia: 'New high score!', mes: 'Campeao do mes!' });
  const p = d.pessoa;
  const nome = semAcento(d.nome);
  const titulo = semAcento(d.titulo);

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: PIXEL, color: '#fff', background: FUNDO,
    }}>
      {/* Estrelas de pixel e as linhas de tubo. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(#ffffff 0 3px, transparent 3px) 0 0 / 180px 140px,
                     radial-gradient(${CIANO} 0 3px, transparent 3px) 90px 70px / 220px 190px`,
        opacity: 0.55,
      }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 3px, transparent 3px 6px)', zIndex: 5, pointerEvents: 'none' }} />

      {/* O jogador. */}
      <div style={{ position: 'absolute', left: 130, top: 120, width: 700, ...entra(0) }}>
        <div style={{ fontSize: 40, color: AMARELO, marginBottom: 40, textShadow: '6px 6px 0 #000' }}>PLAYER 1</div>
        <div style={{ width: 640, height: 640, ...janela(AMARELO) }}>
          <FotoPixel foto={p?.foto ?? null} nome={p?.nome ?? null} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 50 }}>
          {[0, 1, 2, 3, 4].map(i => <CoracaoPixel key={i} cheio={!!p || i < 2} />)}
        </div>
      </div>

      {/* O placar. */}
      <div style={{ position: 'absolute', left: 940, right: 110, top: 120, bottom: 110, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: caber(titulo, 860, 56, 1, 30), color: VERDE, textShadow: '6px 6px 0 #000', lineHeight: 1.3, ...entra(200) }}>
          {titulo}
        </div>
        {d.quandoNaTela && <div style={{ fontSize: 26, color: CIANO, marginTop: 26, lineHeight: 1.5, ...entra(300) }}>{semAcento(d.quandoNaTela)}</div>}

        <div style={{ marginTop: 56, padding: '40px 40px 44px', ...janela(), ...entra(400) }}>
          <div style={{ fontSize: 24, color: '#b9b0ff' }}>NOME</div>
          <div style={{ fontSize: caber(nome, 760, 64, 1, 30), color: AMARELO, marginTop: 22, lineHeight: 1.3, textShadow: '5px 5px 0 #000', whiteSpace: 'nowrap' }}>
            {nome}
          </div>
          {d.onde && <div style={{ fontSize: 24, marginTop: 24, color: '#fff', lineHeight: 1.5 }}>{semAcento(d.onde)}</div>}
          {!p && <div style={{ fontSize: 22, marginTop: 24, color: ROSA, lineHeight: 1.6 }}>{semAcento(d.motivo)}</div>}
        </div>

        {d.valor && (
          <div style={{ marginTop: 'auto', display: 'flex', gap: 40, alignItems: 'flex-end', ...entra(600) }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 26, color: '#b9b0ff' }}>SCORE</div>
              <div style={{ fontSize: caber(d.valor, 560, 56, 1, 30), color: '#fff', marginTop: 18, textShadow: `5px 5px 0 ${ROSA}`, whiteSpace: 'nowrap' }}>
                {d.valor}
              </div>
            </div>
            {d.pagamentos > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 26, color: '#b9b0ff' }}>COMBO</div>
                <div style={{ fontSize: 56, color: CIANO, marginTop: 18, textShadow: '5px 5px 0 #000' }}>x{d.pagamentos}</div>
              </div>
            )}
          </div>
        )}
        {!d.valor && (
          <div style={{ marginTop: 'auto', fontSize: 40, color: p ? VERDE : ROSA, textShadow: '6px 6px 0 #000', ...entra(600) }}>
            {p ? 'LEVEL UP!' : 'PRESS START'}
          </div>
        )}
      </div>

      <Animacoes css={`
        @font-face { font-family: "Press Start 2P"; src: url("/fonts/press-start-2p.woff2") format("woff2"); font-display: swap; }
        @keyframes pixel-entra { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
      `} />
    </div>
  );
}
