import { Composition } from 'remotion';
import { Video } from './Video';
import { TOTAL_FRAMES } from './linhaDoTempo';
import { FPS } from './movimento';

export const Root: React.FC = () => (
  <Composition id="Operador" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
);
