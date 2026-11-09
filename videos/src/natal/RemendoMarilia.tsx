// O vídeo de Marília feito por cima do vídeo de Birigui já pronto (09/11/2026).
//
// O render inteiro da abertura (`AberturaNatal` com `cidade="marilia"`) só sai
// no computador que tem as fotos da Erika (`public/natal/erika/`, fora do git
// porque o repositório é público) e as gravações do mural e das corridas. Aqui
// a base é o vídeo de Birigui que foi ao ar
// (`public/video/natal/abertura.mp4` do app, copiado para
// `videos/public/natal/abertura-birigui.mp4`), e por cima dele:
//   1. onde a legenda de Birigui sai, uma faixa do mesmo céu (`Ceu`, desenhado
//      pelo mesmo código e no mesmo quadro) cobre a pílula antiga;
//   2. as legendas de Marília (`legendasDaMontagem`) entram por cima.
// Só nas corridas a pílula antiga precisa sumir: no mural e na Garrafa da
// Erika, Birigui não tem legenda.
//
// Os quadros batem 1 a 1 com a abertura (6840 a 60 fps). Se a abertura mudar,
// copiar o vídeo novo de novo antes de renderizar.

import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { ms } from '../movimento';
import { Ceu } from './Ceu';
import { legendasDaMontagem } from './Montagem';
import { Recados } from './Recado';
import { MONTAGEM } from './VideoNatal';

export const BASE_BIRIGUI = 'natal/abertura-birigui.mp4';

const BIRIGUI = legendasDaMontagem(MONTAGEM, 'birigui');
const MARILIA = legendasDaMontagem(MONTAGEM, 'marilia');
const so = (de: typeof BIRIGUI, fora: typeof BIRIGUI) => de.filter(x => !fora.some(y => y.texto === x.texto));
/** As pílulas de Birigui que Marília não tem: somem debaixo do céu. */
const SOMEM = so(BIRIGUI, MARILIA);
/** As de Marília que Birigui não tem: entram por cima. */
const ENTRAM = so(MARILIA, BIRIGUI);

/**
 * Até onde o céu cobre: a pílula (topo 40, 80 de altura) e a sombra dela. Na
 * Corrida das Almas a janela começa em 140, então a faixa para antes, com a
 * borda esfumada para não marcar.
 */
const FAIXA = 136;
const ESFUMA = 22;

const CeuPorCima: React.FC = () => {
  const f = useCurrentFrame();
  // Do quadro em que a antiga abre até ela terminar de fechar (o `Recados` some em `ate + 450 ms`).
  if (!SOMEM.some(x => f >= x.de - 1 && f < x.ate + ms(450))) return null;
  const mascara = `linear-gradient(to bottom, #000 0, #000 ${FAIXA - ESFUMA}px, transparent ${FAIXA}px)`;
  return (
    <AbsoluteFill style={{ maskImage: mascara, WebkitMaskImage: mascara }}>
      <Ceu />
    </AbsoluteFill>
  );
};

export const RemendoMarilia: React.FC = () => (
  <AbsoluteFill style={{ background: '#08071b', overflow: 'hidden' }}>
    <OffthreadVideo src={staticFile(BASE_BIRIGUI)} style={{ width: '100%', height: '100%' }} />
    <CeuPorCima />
    <Recados itens={ENTRAM} topo={40} />
  </AbsoluteFill>
);
