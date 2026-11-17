// «Entre Metas e Risadas — Bookplay + Cofen 2026 🎬»: vídeo vertical (Reels,
// Status, Stories) passando pelos setores, foto por foto, tema cinema.
// Trilha própria (scripts/musica-fechamento.mjs), cortes presos às batidas.

import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Abertura } from './Abertura';
import { Claquete } from './Claquete';
import { Estrela } from './Estrela';
import { Creditos, Fim, Mosaico } from './Final';
import { Mural } from './Mural';
import { B, TOTAL_FECHAMENTO, TRECHOS } from './tempo';

export { TOTAL_FECHAMENTO };

export const VideoFechamento: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    {TRECHOS.map((t, i) => {
      let cena: React.ReactNode;
      if (t.tipo === 'abertura') cena = <Abertura />;
      else if (t.tipo === 'claquete') cena = <Claquete setor={t.setor} cena={t.cena} />;
      else if (t.tipo === 'estrela') cena = <Estrela setor={t.setor} cena={t.cena} pessoa={t.pessoa} ordem={t.ordem} geral={t.geral} />;
      else if (t.tipo === 'mural') cena = <Mural setor={t.setor} cena={t.cena} />;
      else if (t.tipo === 'mosaico') cena = <Mosaico />;
      else if (t.tipo === 'creditos') cena = <Creditos />;
      else cena = <Fim />;
      return (
        <Sequence key={i} from={t.ini * B} durationInFrames={t.dur * B} name={`${t.tipo} ${'setor' in t ? t.setor.nome : ''} ${'pessoa' in t ? t.pessoa.nome : ''}`}>
          {cena}
        </Sequence>
      );
    })}
    <Audio src={staticFile('fechamento/trilha.wav')} />
  </AbsoluteFill>
);
