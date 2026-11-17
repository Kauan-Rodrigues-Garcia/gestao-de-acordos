// Uma pessoa em cena: a polaroid entra (4 jeitos, alternando), a foto revela,
// o nome é escrito à mão e estrelinhas estouram quando ela assenta.

import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { Pessoa, Setor } from './elenco';
import { ACELERA, C, entre, F, mola, sorte } from './estilo';
import { Flash, FitaLateral, FundoFoto, Grao, LuzVazada, Polaroid, Riscos, Vinheta } from './efeitos';
import { B, ESTRELA } from './tempo';

const FRASES = [
  'Luz, câmera, acordo!',
  'Em cartaz o ano todo',
  'Close certo!',
  'Sucesso de bilheteria',
  'Aplausos!',
  'Brilhou na tela',
  'Estrela da casa',
  'Corta! Ficou perfeito',
  'Sem dublê',
  'Take único',
  'Pede bis!',
  'Direto pro tapete vermelho',
];

const dois = (n: number) => String(n).padStart(2, '0');

export const Estrela: React.FC<{ setor: Setor; cena: number; pessoa: Pessoa; ordem: number; geral: number }> = ({ setor, cena, pessoa, ordem, geral }) => {
  const f = useCurrentFrame();
  const dur = ESTRELA * B;
  const jeito = geral % 4;
  const rot = (sorte(geral + 3) - 0.5) * 7;

  // entrada
  const p = mola(f, 0, { stiffness: 150, damping: 15 });
  let x = 0;
  let y = 0;
  let escala = 1;
  let giro = rot;
  let borrao = 0;
  if (jeito === 0 || jeito === 3) {
    const lado = jeito === 0 ? 1 : -1;
    x = (1 - p) * 1300 * lado;
    giro = rot + (1 - p) * 14 * lado;
    borrao = Math.min(14, Math.abs(1 - p) * 30);
  } else if (jeito === 1) {
    y = (1 - p) * -1700;
    giro = rot - (1 - p) * 25;
    borrao = Math.min(10, Math.abs(1 - p) * 20);
  } else {
    escala = 1 + (1 - p) * 1.3;
    borrao = Math.min(16, Math.abs(1 - p) * 26);
  }

  // saída rápida para o lado, já embalando o corte
  const sai = entre(f, dur - 7, dur, 0, 1, ACELERA);
  x -= sai * 1400 * (geral % 2 ? -1 : 1);
  giro -= sai * 10 * (geral % 2 ? -1 : 1);
  borrao += sai * 14;

  // empurrão lento de câmera
  escala *= 1 + (f / dur) * 0.035;

  const revela = entre(f, 4, 32, 0, 1);
  const escrita = entre(f, 14, 32, 0, 1, (t) => t);
  const pousa = 9;

  const estrelas = Array.from({ length: 9 }, (_, i) => {
    const t = entre(f, pousa, pousa + 26, 0, 1);
    if (t <= 0 || t >= 1) return null;
    const ang = (i / 9) * Math.PI * 2 + sorte(geral * 9 + i) * 0.6;
    const raio = 380 + sorte(geral + i * 3) * 260;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: 540 + Math.cos(ang) * raio * t,
          top: 980 + Math.sin(ang) * raio * t * 1.3,
          fontSize: 34 + sorte(i + geral) * 40,
          color: i % 3 ? C.ouro : setor.cor,
          opacity: 1 - t,
          transform: `translate(-50%,-50%) rotate(${t * 180}deg) scale(${1 - t * 0.4})`,
          textShadow: '0 0 18px rgba(255,200,80,.8)',
        }}
      >
        ✦
      </div>
    );
  });

  const cab = entre(f, 2, 14, 0, 1);
  const frase = entre(f, 22, 34, 0, 1);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <FundoFoto foto={pessoa.foto} cor={setor.cor} escala={1.15 + f * 0.0012} />
      <FitaLateral velocidade={4} opacidade={0.92} />
      <LuzVazada forca={entre(f, 0, 22, 0.55, 0.12)} semente={geral} />

      {/* cabeçalho */}
      <div style={{ position: 'absolute', top: 120, left: 0, right: 0, textAlign: 'center', opacity: cab, transform: `translateY(${(1 - cab) * -30}px)` }}>
        <div style={{ fontFamily: F.letreiro, fontSize: 44, letterSpacing: 10, color: C.ouro, textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>
          CENA {dois(cena)} · {setor.nome.toUpperCase()}
        </div>
        <div style={{ marginTop: 6, fontFamily: F.serifa, fontStyle: 'italic', fontSize: 40, color: C.creme, opacity: 0.85 }}>
          estrela {ordem + 1} de {setor.pessoas.length}
        </div>
      </div>

      {/* polaroid */}
      <div style={{ position: 'absolute', left: 540, top: 1000, transform: `translate(-50%,-50%) translate(${x}px, ${y}px) rotate(${giro}deg) scale(${escala})`, filter: borrao > 0.5 ? `blur(${borrao}px)` : undefined }}>
        <Polaroid foto={pessoa.foto} maxL={800} maxA={1020} legenda={pessoa.nome} tamLegenda={pessoa.nome.length > 11 ? 74 : 92} escrita={escrita} revela={revela} corFita={setor.cor} />
      </div>
      {estrelas}

      {/* frase de cinema */}
      <div style={{ position: 'absolute', bottom: 120, left: 0, right: 0, textAlign: 'center', opacity: frase * (1 - sai), transform: `translateY(${(1 - frase) * 30}px) rotate(-2deg)` }}>
        <span style={{ display: 'inline-block', padding: '10px 34px', background: setor.cor, color: C.tinta, fontFamily: F.letreiro, fontSize: 46, letterSpacing: 3, boxShadow: '0 10px 30px rgba(0,0,0,.4)' }}>
          {FRASES[geral % FRASES.length].toUpperCase()}
        </span>
      </div>

      <Riscos />
      <Grao />
      <Vinheta forca={0.6} />
      <Flash forca={entre(f, 0, 6, 0.5, 0)} />
    </AbsoluteFill>
  );
};
