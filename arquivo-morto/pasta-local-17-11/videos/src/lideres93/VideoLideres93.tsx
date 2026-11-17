// «Líderes que bateram o desafio» — vertical (Reels, Status, Stories).
// Cada líder recebendo o Vale Compra Bandeirante: abertura com o anel do desafio, uma
// cena por entrega (o «ganhou» cai na batida) e o mosaico de parabéns.
// Sem o som original dos vídeos: só a trilha.
//
// Áudio: o da versão em linha.json (trilha própria, ou Uptown Funk / Can't Stop
// the Feeling com os efeitos por baixo), montado por scripts/musica-lideres93.mjs.

import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Abertura } from './Abertura';
import { Cena } from './Cena';
import { C, entre, LINHA } from './estilo';
import { Final } from './Final';
import { EfeitoCorte, Movimento } from './transicoes';

export const TOTAL_LIDERES93 = LINHA.total;
const TRILHA = LINHA.audio ?? 'lideres93/trilha.wav';
const T = LINHA.transicoes;

export const VideoLideres93: React.FC = () => (
  <AbsoluteFill style={{ background: C.noite }}>
    <Sequence durationInFrames={LINHA.abertura.dur} name="abertura">
      <Movimento dur={LINHA.abertura.dur} sai={T[0].tipo}>
        <Abertura />
      </Movimento>
    </Sequence>
    {LINHA.cenas.map((c, i) => (
      <Sequence key={c.n} from={c.ini} durationInFrames={c.dur} name={`líder ${c.n}`}>
        <Movimento dur={c.dur} entra={T[i].tipo} sai={T[i + 1].tipo}>
          <Cena cena={c} />
        </Movimento>
      </Sequence>
    ))}
    <Sequence from={LINHA.final.ini} durationInFrames={LINHA.final.dur} name="final">
      <Movimento dur={LINHA.final.dur} entra={T[T.length - 1].tipo}>
        <Final />
      </Movimento>
    </Sequence>
    <Progresso />
    {T.map((t, i) => (
      <Sequence key={`t${t.q}`} from={t.q - 12} durationInFrames={24} name={`transição ${t.tipo}`} layout="none">
        <EfeitoCorte tipo={t.tipo} semente={i + 1} />
      </Sequence>
    ))}
    <Audio src={staticFile(TRILHA)} />
  </AbsoluteFill>
);

/** Barrinhas de story no topo: uma por líder. */
const Progresso: React.FC = () => {
  const f = useCurrentFrame();
  const cenas = LINHA.cenas;
  const ini = cenas[0].ini;
  if (f < ini || f >= LINHA.final.ini) return null;
  return (
    <div style={{ position: 'absolute', top: 44, left: 40, right: 40, display: 'flex', gap: 6, opacity: entre(f, ini, ini + 10, 0, 1) }}>
      {cenas.map((c) => {
        const p = entre(f, c.ini, c.ini + c.dur, 0, 1, (t) => t);
        return (
          <div key={c.n} style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,.28)', overflow: 'hidden' }}>
            <div style={{ width: `${p * 100}%`, height: '100%', background: p >= 1 ? '#ffffff' : C.ouro }} />
          </div>
        );
      })}
    </div>
  );
};
