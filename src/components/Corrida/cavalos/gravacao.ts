/**
 * gravacao.ts — a gravação da Corrida de Cavalos em um arquivo só, compacto.
 *
 * O super admin simula a corrida (`simulacao.js`) e sobe este arquivo para o
 * bucket `corridas`; cada tela baixa e reproduz. Leva as posições de cada
 * cavalo a cada 1/30 s (Int16, como a simulação guarda) e o resto do
 * resultado no cabeçalho. Uma corrida de 24 cavalos fica em dezenas de KB.
 *
 *   'CAV1' · u32 tamanho do cabeçalho · cabeçalho JSON · (alinhamento) · X
 *
 * Irmão do `../gravacao.ts` (o dos bichinhos, 'CDS1'): formatos diferentes de
 * propósito, e o mágico diz qual é qual.
 */
import { gunzipSync, gzipSync } from 'fflate';
import type { CorridaCavalos } from './simulacao';

const MAGICO = 'CAV1';
const alinhar = (n: number) => (n + 3) & ~3;

export function empacotarCavalos(rec: CorridaCavalos): Uint8Array {
  const { X, ...resto } = rec;
  const json = new TextEncoder().encode(JSON.stringify({ ...resto, __x: X.length }));
  const inicio = alinhar(8 + json.length);
  const bruto = new Uint8Array(inicio + X.length * 2);
  for (let i = 0; i < 4; i++) bruto[i] = MAGICO.charCodeAt(i);
  new DataView(bruto.buffer).setUint32(4, json.length, true);
  bruto.set(json, 8);
  const copia = new Int16Array(X.length); copia.set(X);
  bruto.set(new Uint8Array(copia.buffer), inicio);
  return gzipSync(bruto, { level: 6 });
}

export function desempacotarCavalos(arquivo: Uint8Array): CorridaCavalos {
  const bruto = gunzipSync(arquivo);
  const magico = String.fromCharCode(bruto[0], bruto[1], bruto[2], bruto[3]);
  if (magico !== MAGICO) throw new Error('Arquivo de corrida de cavalos desconhecido.');
  const tam = new DataView(bruto.buffer, bruto.byteOffset, bruto.byteLength).getUint32(4, true);
  const { __x, ...resto } = JSON.parse(new TextDecoder().decode(bruto.subarray(8, 8 + tam))) as Omit<CorridaCavalos, 'X'> & { __x: number };
  const inicio = alinhar(8 + tam);
  const X = new Int16Array(bruto.slice(inicio, inicio + __x * 2).buffer, 0, __x);
  return { ...resto, X };
}
