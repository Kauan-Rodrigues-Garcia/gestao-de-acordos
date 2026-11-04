import { Config } from '@remotion/cli/config';
import { ajustarWebpack } from './webpack.mjs';

// Cor (28/10/2026): com quadros em JPEG o vídeo saía `yuvj420p` (faixa cheia,
// BT.601, sem padrão marcado) e o player do Windows o lia como faixa limitada —
// os claros estouravam, «como se o brilho tivesse estourado». Em BT.709, faixa
// de TV e marcado, todo player mostra igual ao navegador. PNG também não borra
// a pixel art.
Config.setVideoImageFormat('png');
Config.setCodec('h264');
// Só com vídeo: o áudio sozinho (--codec=wav, para conferir a mixagem) não aceita crf.
if (!process.argv.some(a => /wav|mp3|aac/.test(a))) Config.setCrf(16);
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.overrideWebpackConfig(ajustarWebpack);
