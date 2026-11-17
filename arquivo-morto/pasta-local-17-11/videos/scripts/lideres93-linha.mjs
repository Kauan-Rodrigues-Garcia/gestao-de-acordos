// Linha do tempo do «Líderes que bateram o desafio», em quadros (30 fps),
// presa às batidas da música da versão (src/lideres93/versoes.json).
//
// Lê src/lideres93/elenco.json e grava src/lideres93/linha.json, que o vídeo
// (VideoLideres93.tsx) e a trilha (musica-lideres93.mjs) usam igual.
// Cada cena começa numa batida e o «ganhou» (cupom na mão) cai numa batida:
// o começo do primeiro corte é empurrado alguns décimos para isso.
//
//   node scripts/lideres93-linha.mjs [original|uptown|cantstop]

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
export const FPS = 30;
export const ABERTURA = 16; // batidas
export const FINAL = 24;

export function lerVersao(nome = 'original') {
  const versoes = JSON.parse(readFileSync(path.join(RAIZ, 'src', 'lideres93', 'versoes.json'), 'utf8'));
  const v = versoes[nome];
  if (!v || nome.startsWith('_')) throw new Error(`versão desconhecida: ${nome}`);
  return { id: nome, ...v };
}

export function montarLinha(nomeVersao = 'original') {
  const versao = lerVersao(nomeVersao);
  const BPM = versao.bpm;
  const B = (FPS * 60) / BPM; // quadros por batida (pode ser fracionário)
  const BS = 60 / BPM; // segundos por batida
  const q = (batida) => Math.round(batida * B); // quadro inteiro de uma batida

  const elenco = JSON.parse(readFileSync(path.join(RAIZ, 'src', 'lideres93', 'elenco.json'), 'utf8'));
  let batida = ABERTURA;
  const cenas = elenco.cenas.map((cena, n) => {
    const cortes = cena.cortes.map((c) => ({ ...c, vel: c.vel ?? 1 }));
    const dur = (c) => (c.ate - c.de) / c.vel;
    const k = cena.ganhou.corte;
    const g = () => cortes.slice(0, k).reduce((s, c) => s + dur(c), 0) + (cena.ganhou.t - cortes[k].de) / cortes[k].vel;

    // ganhou na batida: mexe no começo do primeiro corte
    // pelo menos 2 batidas antes do ganhou: dá tempo de ver a chegada depois da transição
    let alvo = Math.max(2, Math.round(g() / BS)) * BS;
    for (let tent = 0; tent < 4; tent++) {
      const novoDe = cortes[0].de - (alvo - g()) * cortes[0].vel;
      if (novoDe >= 0 && novoDe < cortes[0].ate - 0.3) {
        cortes[0].de = novoDe;
        break;
      }
      alvo += novoDe < 0 ? -BS : BS;
    }

    // duração inteira em batidas: apara o fim do último corte
    const total = cortes.reduce((s, c) => s + dur(c), 0);
    let batidas = Math.max(4, Math.floor(total / BS + 1e-6));
    // a última cena se estica (até 3 batidas) para o final começar num compasso
    if (n === elenco.cenas.length - 1) while ((batida + batidas) % 4 !== 0) batidas++;
    const sobra = total - batidas * BS;
    const ult = cortes[cortes.length - 1];
    ult.ate -= sobra * ult.vel;
    const limite = elenco.duracoes[ult.clip];
    if (limite && ult.ate > limite + 0.01) throw new Error(`cena ${n + 1}: ${ult.clip} não tem material até ${ult.ate.toFixed(2)} s`);

    const ini = q(batida);
    const durQ = q(batida + batidas) - ini;
    let t = 0;
    const cortesQ = cortes.map((c, i) => {
      const q0 = Math.round(t * FPS);
      t += dur(c);
      const q1 = i === cortes.length - 1 ? durQ : Math.round(t * FPS);
      return { clip: c.clip, de: +c.de.toFixed(3), vel: c.vel, ini: q0, dur: q1 - q0 };
    });
    // o ganhou contado do começo do vídeo, para cair no quadro da batida certa
    const ganhouQ = Math.round((batida * BS + g()) * FPS) - ini;
    batida += batidas;
    return { n: n + 1, ini, dur: durQ, ganhou: ganhouQ, cortes: cortesQ, foto: cena.foto };
  });
  const final = { ini: q(batida), dur: q(batida + FINAL) - q(batida) };
  // transições: em cada começo de cena e no final, revezando três estilos
  const TIPOS = ['faixa', 'zoom', 'chicote'];
  const transicoes = [...cenas.map((c) => c.ini), final.ini].map((qq, i) => ({ q: qq, tipo: i === cenas.length ? 'zoom' : TIPOS[i % 3] }));
  const linha = {
    versao: versao.id,
    fps: FPS,
    bpm: BPM,
    B,
    audio: versao.id === 'original' ? 'lideres93/trilha.wav' : `lideres93/audio-${versao.id}.wav`,
    abertura: { ini: 0, dur: q(ABERTURA), ...elenco.abertura },
    cenas,
    final,
    transicoes,
    total: final.ini + final.dur,
  };
  writeFileSync(path.join(RAIZ, 'src', 'lideres93', 'linha.json'), JSON.stringify(linha, null, 1));
  return linha;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const l = montarLinha(process.argv[2]);
  for (const c of l.cenas) console.log(`cena ${c.n}: ${c.ini}+${c.dur} ganhou ${c.ganhou} (${(c.ganhou / l.B).toFixed(2)} batidas) ${c.cortes.map((x) => `${x.clip}@${x.de}`).join(' ')}`);
  console.log(`${l.versao}: ${l.bpm} bpm, total ${l.total} quadros = ${(l.total / FPS).toFixed(1)} s`);
}
