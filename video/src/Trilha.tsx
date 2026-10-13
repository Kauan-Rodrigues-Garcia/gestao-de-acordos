// Tudo que se ouve: as 12 narrações, os efeitos sonoros (cada um amarrado ao
// quadro do que acontece na tela) e, se existir public/musica.mp3, a música —
// que abaixa sozinha enquanto a voz fala.

import { useMemo } from 'react';
import { Audio, getStaticFiles, interpolate, Sequence, staticFile } from 'remotion';
import { rotaDoCursor, tempoApp } from './app/roteiro';
import { temposCena2 } from './cenas/Cena02Virada';
import duracoes from './duracoes.json';
import { cena, CENAS, palavra, TOTAL_FRAMES, type IdCena } from './linhaDoTempo';
import { ms, s } from './movimento';

type Efeito = { arquivo: string; em: number; volume: number };

const Som: React.FC<Efeito> = ({ arquivo, em, volume }) => (
  <Sequence from={Math.max(0, em)} name={arquivo}>
    <Audio src={staticFile(`sons/${arquivo}`)} volume={volume} />
  </Sequence>
);

export const Trilha: React.FC = () => {
  const efeitos = useMemo<Efeito[]>(() => {
    const t2 = temposCena2();
    const t = tempoApp();
    const { cliques } = rotaDoCursor(t);
    return [
      { arquivo: 'areia.wav', em: palavra('cena-01', 'recebeu') - ms(80), volume: 0.32 },
      { arquivo: 'succao.wav', em: t2.convergeEm, volume: 0.38 },
      { arquivo: 'impacto.wav', em: t2.fundir - ms(40), volume: 0.5 },
      { arquivo: 'whoosh.wav', em: t2.expandir - ms(60), volume: 0.4 },
      ...cliques.map((c) => ({ arquivo: 'clique.wav', em: c, volume: 0.42 })),
      { arquivo: 'ding.wav', em: t.toast - ms(60), volume: 0.3 },
      { arquivo: 'ding.wav', em: t.clique.pago, volume: 0.16 },
      { arquivo: 'ding.wav', em: t.atualizado + ms(250), volume: 0.16 },
      { arquivo: 'whoosh.wav', em: t.whatsapp - ms(80), volume: 0.24 },
      { arquivo: 'chat-notificacao.mp3', em: t.avisoChat, volume: 0.45 },
      { arquivo: 'festa.wav', em: t.explode - ms(60), volume: 0.42 },
      { arquivo: 'whoosh.wav', em: t.computador - ms(120), volume: 0.26 },
      { arquivo: 'whoosh.wav', em: t.celular - ms(220), volume: 0.26 },
      { arquivo: 'notificacao.mp3', em: t.celular + ms(420), volume: 0.45 },
      { arquivo: 'whoosh.wav', em: t.c12.inicio - ms(40), volume: 0.26 },
      { arquivo: 'impacto.wav', em: t.c12.inicio + ms(200), volume: 0.3 },
    ];
  }, []);

  const temMusica = useMemo(() => getStaticFiles().some((f) => f.name === 'musica.mp3'), []);

  // janelas em que a voz está falando (para abaixar a música)
  const falas = useMemo(
    () => CENAS.map((id) => [cena(id).voz, cena(id).voz + s((duracoes as Record<IdCena, number>)[id])] as const),
    [],
  );

  return (
    <>
      {CENAS.map((id) => (
        <Sequence key={id} from={cena(id).voz} name={`voz ${id}`}>
          <Audio src={staticFile(`audio/${id}.mp3`)} />
        </Sequence>
      ))}

      {efeitos.map((e, i) => (
        <Som key={i} {...e} />
      ))}

      {temMusica && (
        <Audio
          src={staticFile('musica.mp3')}
          volume={(f) => {
            // abaixa suave (300 ms) antes da fala e sobe devagar (500 ms) depois
            const falando = Math.max(
              0,
              ...falas.map(([a, b]) =>
                Math.min(
                  interpolate(f, [a - ms(300), a], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                  interpolate(f, [b, b + ms(500)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                ),
              ),
            );
            const base = 0.2 - 0.11 * falando;
            const entra = interpolate(f, [0, s(1.2)], [0, 1], { extrapolateRight: 'clamp' });
            const sai = interpolate(f, [TOTAL_FRAMES - s(2), TOTAL_FRAMES - 1], [1, 0], { extrapolateLeft: 'clamp' });
            return base * entra * sai;
          }}
        />
      )}
    </>
  );
};
