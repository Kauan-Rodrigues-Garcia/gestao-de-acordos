/**
 * gravacao.ts — a gravação de uma corrida em um arquivo só, compacto.
 *
 * A corrida é simulada uma vez, no navegador do super admin, e cada tela só
 * reproduz. O arquivo leva as posições de cada bichinho a cada 1/30 s (em
 * Int16, como o motor guarda), os eventos, a narração e o resto do resumo.
 * Com gzip, uma corrida de 44 pessoas fica na casa de algumas centenas de KB.
 *
 *   'CDS1' · u32 tamanho do cabeçalho · cabeçalho JSON · (alinhamento) · os
 *   vetores, um atrás do outro, na ordem de `VETORES`.
 */
import { gunzipSync, gzipSync } from 'fflate';
import type { Gravacao } from './motor/motor';

const MAGICO = 'CDS1';
const VETORES = [
  ['X', Int16Array], ['Y', Int16Array], ['F', Uint8Array], ['tFim', Float32Array], ['ordem', Int16Array],
] as const;
type NomeVetor = (typeof VETORES)[number][0];

const alinhar = (n: number) => (n + 3) & ~3;

export function empacotarGravacao(rec: Gravacao): Uint8Array {
  const cabecalho: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (VETORES.some(([nome]) => nome === k)) continue;
    cabecalho[k] = v;
  }
  const tamanhos: Record<string, number> = {};
  for (const [nome] of VETORES) tamanhos[nome] = (rec[nome] as ArrayLike<number>).length;
  cabecalho.__vetores = tamanhos;
  const json = new TextEncoder().encode(JSON.stringify(cabecalho));
  let total = alinhar(8 + json.length);
  for (const [nome, Tipo] of VETORES) total = alinhar(total + tamanhos[nome] * Tipo.BYTES_PER_ELEMENT);
  const bruto = new Uint8Array(total);
  const vista = new DataView(bruto.buffer);
  for (let i = 0; i < 4; i++) bruto[i] = MAGICO.charCodeAt(i);
  vista.setUint32(4, json.length, true);
  bruto.set(json, 8);
  let pos = alinhar(8 + json.length);
  for (const [nome, Tipo] of VETORES) {
    const v = rec[nome] as InstanceType<typeof Tipo>;
    const copia = new Tipo(v.length); copia.set(v);
    bruto.set(new Uint8Array(copia.buffer), pos);
    pos = alinhar(pos + v.length * Tipo.BYTES_PER_ELEMENT);
  }
  return gzipSync(bruto, { level: 6 });
}

export function desempacotarGravacao(arquivo: Uint8Array): Gravacao {
  const bruto = gunzipSync(arquivo);
  const magico = String.fromCharCode(bruto[0], bruto[1], bruto[2], bruto[3]);
  if (magico !== MAGICO) throw new Error('Arquivo de gravação desconhecido.');
  const vista = new DataView(bruto.buffer, bruto.byteOffset, bruto.byteLength);
  const tam = vista.getUint32(4, true);
  const cabecalho = JSON.parse(new TextDecoder().decode(bruto.subarray(8, 8 + tam))) as Record<string, unknown> & { __vetores: Record<NomeVetor, number> };
  const rec = { ...cabecalho } as Record<string, unknown>;
  delete rec.__vetores;
  let pos = alinhar(8 + tam);
  for (const [nome, Tipo] of VETORES) {
    const n = cabecalho.__vetores[nome];
    const bytes = bruto.slice(pos, pos + n * Tipo.BYTES_PER_ELEMENT);
    rec[nome] = new Tipo(bytes.buffer, 0, n);
    pos = alinhar(pos + n * Tipo.BYTES_PER_ELEMENT);
  }
  return rec as unknown as Gravacao;
}
