import { Composition, Still } from 'remotion';
import { Video } from './Video';
import { TOTAL_FRAMES } from './linhaDoTempo';
import { FPS } from './movimento';
import { TOTAL_AUTORIZACOES, VideoAutorizacoes } from './autorizacoes/VideoAutorizacoes';
import { TOTAL_NATAL, VideoNatal } from './natal/VideoNatal';
import { RemendoMarilia } from './natal/RemendoMarilia';
import { TOTAL_MODO_TV, VideoModoTV } from './modo-tv/VideoModoTV';
import { Folha } from './fechamento/Folha';
import { TOTAL_FECHAMENTO, VideoFechamento } from './fechamento/VideoFechamento';
import { FPS as FPS_FECHAMENTO } from './fechamento/tempo';
import { TOTAL_LIDERES93, VideoLideres93 } from './lideres93/VideoLideres93';

export const Root: React.FC = () => (
  <>
    <Composition id="Operador" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ medir: false }} />
    {/* 15/10/2026: as autorizações saíram do botão do canto e foram para o chat. */}
    <Composition id="Autorizacoes" component={VideoAutorizacoes} durationInFrames={TOTAL_AUTORIZACOES} fps={FPS} width={1920} height={1080} />
    {/* 28/10/2026: a abertura do Natal, que toca ao abrir o presente no sistema. */}
    {/* 1920 × 936 (2,05:1): a área do navegador com as barras do Chrome, e não 16:9 (Cleber, 28/10). */}
    <Composition id="AberturaNatal" component={VideoNatal} durationInFrames={TOTAL_NATAL} fps={FPS} width={1920} height={936} />
    {/* 09/11/2026: a de Marília, que não teve as corridas nem o mural; muda só a legenda das corridas em diante. */}
    {/* Inteira (precisa das fotos da Erika, que só estão no outro computador) e por cima do vídeo de Birigui pronto. */}
    <Composition id="AberturaNatalMarilia" component={VideoNatal} durationInFrames={TOTAL_NATAL} fps={FPS} width={1920} height={936} defaultProps={{ cidade: 'marilia' as const }} />
    <Composition id="AberturaNatalMariliaRemendo" component={RemendoMarilia} durationInFrames={TOTAL_NATAL} fps={FPS} width={1920} height={936} />
    {/* 27/10/2026: a mesa e a parede do Modo TV, gravadas do código arquivado. */}
    <Composition id="ModoTV" component={VideoModoTV} durationInFrames={TOTAL_MODO_TV} fps={FPS} width={1920} height={1080} />
    {/* 03/11/2026: «Entre Metas e Risadas», vertical para postar, foto por foto dos setores. */}
    <Composition id="Fechamento" component={VideoFechamento} durationInFrames={TOTAL_FECHAMENTO} fps={FPS_FECHAMENTO} width={1080} height={1920} />
    {/* 05/11/2026: «Líderes que bateram o desafio», cada líder ganhando o Vale Compra Bandeirante. */}
    <Composition id="Lideres93" component={VideoLideres93} durationInFrames={TOTAL_LIDERES93} fps={30} width={1080} height={1920} />
    <Still id="FechamentoFolha" component={Folha} width={1918} height={2000} />
  </>
);
