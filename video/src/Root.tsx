import { Composition } from 'remotion';
import { Video } from './Video';
import { TOTAL_FRAMES } from './linhaDoTempo';
import { FPS } from './movimento';
import { TOTAL_AUTORIZACOES, VideoAutorizacoes } from './autorizacoes/VideoAutorizacoes';

export const Root: React.FC = () => (
  <>
    <Composition id="Operador" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ medir: false }} />
    {/* 15/10/2026: as autorizações saíram do botão do canto e foram para o chat. */}
    <Composition id="Autorizacoes" component={VideoAutorizacoes} durationInFrames={TOTAL_AUTORIZACOES} fps={FPS} width={1920} height={1080} />
  </>
);
