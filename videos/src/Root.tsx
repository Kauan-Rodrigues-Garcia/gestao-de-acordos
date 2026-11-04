import { Composition } from 'remotion';
import { Video } from './Video';
import { TOTAL_FRAMES } from './linhaDoTempo';
import { FPS } from './movimento';
import { TOTAL_AUTORIZACOES, VideoAutorizacoes } from './autorizacoes/VideoAutorizacoes';
import { TOTAL_NATAL, VideoNatal } from './natal/VideoNatal';

export const Root: React.FC = () => (
  <>
    <Composition id="Operador" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ medir: false }} />
    {/* 15/10/2026: as autorizações saíram do botão do canto e foram para o chat. */}
    <Composition id="Autorizacoes" component={VideoAutorizacoes} durationInFrames={TOTAL_AUTORIZACOES} fps={FPS} width={1920} height={1080} />
    {/* 28/10/2026: a abertura do Natal, que toca ao abrir o presente no sistema. */}
    {/* 1920 × 936 (2,05:1): a área do navegador com as barras do Chrome, e não 16:9 (Cleber, 28/10). */}
    <Composition id="AberturaNatal" component={VideoNatal} durationInFrames={TOTAL_NATAL} fps={FPS} width={1920} height={936} />
  </>
);
