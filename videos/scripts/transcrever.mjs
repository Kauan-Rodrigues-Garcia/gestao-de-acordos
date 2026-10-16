// Tira o tempo de cada palavra dos áudios das cenas (public/audio/cena-XX.mp3)
// e grava em src/tempos.json. Roda local com whisper.cpp — nada sai da máquina.
//
//   npm run transcrever
//
// Na primeira vez baixa o whisper.cpp e o modelo para .whisper/ (fora do git).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from '@remotion/install-whisper-cpp';

const RAIZ = path.resolve(import.meta.dirname, '..');
const PASTA_WHISPER = path.join(RAIZ, '.whisper');
const PASTA_AUDIO = path.join(RAIZ, 'public', 'audio');
const PASTA_WAV = path.join(RAIZ, '.wav-16k');
const VERSAO = '1.5.5';
const MODELO = 'small';

mkdirSync(PASTA_WAV, { recursive: true });
await installWhisperCpp({ to: PASTA_WHISPER, version: VERSAO });
await downloadWhisperModel({ model: MODELO, folder: PASTA_WHISPER });

const FFMPEG = path.join(RAIZ, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
const FFPROBE = FFMPEG.replace('ffmpeg.exe', 'ffprobe.exe');
const saida = {};
const duracoes = {};

for (const arquivo of readdirSync(PASTA_AUDIO).filter((f) => /^cena-\d+\.mp3$/.test(f)).sort()) {
  const cena = arquivo.replace('.mp3', '');
  const wav = path.join(PASTA_WAV, `${cena}.wav`);
  if (!existsSync(wav)) {
    // whisper.cpp só aceita WAV 16 kHz mono.
    execFileSync(FFMPEG, ['-y', '-i', path.join(PASTA_AUDIO, arquivo), '-ar', '16000', '-ac', '1', wav], { stdio: 'ignore' });
  }
  duracoes[cena] = Number(
    execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(PASTA_AUDIO, arquivo)]).toString().trim(),
  );
  const resultado = await transcribe({
    inputPath: wav,
    whisperPath: PASTA_WHISPER,
    whisperCppVersion: VERSAO,
    model: MODELO,
    language: 'pt',
    tokenLevelTimestamps: true,
    splitOnWord: true,
  });
  const { captions } = toCaptions({ whisperCppOutput: resultado });
  saida[cena] = captions
    .map((c) => ({ palavra: c.text.trim(), inicioMs: c.startMs, fimMs: c.endMs }))
    .filter((c) => c.palavra.length > 0);
  console.log(cena, saida[cena].map((p) => `${p.palavra}@${p.inicioMs}`).join(' '));
}

writeFileSync(path.join(RAIZ, 'src', 'tempos.json'), JSON.stringify(saida, null, 2));
writeFileSync(path.join(RAIZ, 'src', 'duracoes.json'), JSON.stringify(duracoes, null, 2));
console.log('\nGravado em src/tempos.json');
