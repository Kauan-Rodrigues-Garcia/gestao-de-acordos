// Tudo que se ouve: as 12 narrações, os efeitos sonoros (cada um amarrado ao
// quadro do que acontece na tela) e, se existir public/musica.mp3, a música —
// que abaixa sozinha enquanto a voz fala.

import { useMemo } from 'react';
import { Audio, getStaticFiles, interpolate, Sequence, staticFile } from 'remotion';
import { rotaDoCursor, tempoApp } from './app/roteiro';
import { temposCena1 } from './cenas/Cena01Problema';
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
    const t1 = temposCena1();
    const t2 = temposCena2();
    const t = tempoApp();
    const c = t.clique;
    const { cliques } = rotaDoCursor(t);
    /** Toques de tecla espalhados por uma digitação. */
    const teclas = (inicio: number, duracaoMs: number, quantas: number, volume = 0.16): Efeito[] =>
      Array.from({ length: quantas }, (_, i) => ({ arquivo: 'tecla.wav', em: inicio + Math.round((ms(duracaoMs) * i) / quantas), volume: volume * (0.8 + 0.4 * ((i * 7) % 5) / 4) }));
    return [
      // abertura
      { arquivo: 'whoosh.wav', em: 4, volume: 0.14 },
      { arquivo: 'pop.wav', em: palavra('cena-01', 'falar') - ms(150), volume: 0.18 },
      { arquivo: 'whoosh.wav', em: t1.organiza - ms(30), volume: 0.3 },
      { arquivo: 'succao.wav', em: t1.recolhe - ms(500), volume: 0.34 },
      { arquivo: 'pop.wav', em: t2.nascem, volume: 0.22 },
      { arquivo: 'impacto.wav', em: t2.fundir - ms(40), volume: 0.5 },
      { arquivo: 'whoosh.wav', em: t2.expandir - ms(60), volume: 0.4 },
      // cliques e digitação
      ...cliques.map((em) => ({ arquivo: 'clique.wav', em, volume: 0.4 })),
      ...teclas(t.digitaNr, 420, 8),
      ...teclas(c.valor + ms(140), 320, 6),
      ...teclas(c.parcelas + ms(150), 60, 1),
      ...teclas(c.campoChat + ms(140), 1050, 18, 0.13),
      // o que responde na tela
      { arquivo: 'pop.wav', em: c.vencimento + ms(60), volume: 0.16 },
      { arquivo: 'ding.wav', em: t.toastNovo - ms(40), volume: 0.3 },
      { arquivo: 'ding.wav', em: c.pago + ms(100), volume: 0.18 },
      { arquivo: 'pop.wav', em: c.reagendar + ms(60), volume: 0.18 },
      { arquivo: 'ding.wav', em: c.confirmar + ms(470), volume: 0.16 },
      { arquivo: 'pop.wav', em: c.desempenho + ms(40), volume: 0.2 },
      { arquivo: 'ding.wav', em: t.atualizado + ms(200), volume: 0.2 },
      { arquivo: 'pop.wav', em: c.whats + ms(60), volume: 0.16 },
      { arquivo: 'whoosh.wav', em: t.abreZap - ms(40), volume: 0.24 },
      { arquivo: 'whoosh.wav', em: t.c9.inicio + ms(20), volume: 0.18 },
      { arquivo: 'pop.wav', em: c.chat + ms(80), volume: 0.2 },
      { arquivo: 'chat-notificacao.mp3', em: t.respostaLider, volume: 0.45 },
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
