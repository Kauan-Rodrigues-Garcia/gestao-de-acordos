/**
 * sons.ts — os sons das bruxas, sintetizados na hora como os dos zumbis
 * (`../sons.ts`, de onde vêm as peças e o volume baixo). Nenhum arquivo.
 *
 * O tiro, o headshot (o cérebro gosmento), o respingo e o baque são os mesmos
 * dos zumbis. Daqui saem os dela: a gargalhada, o «puf» da chegada, o grito da
 * queda, o ESPATIFA no chão, a vassoura partindo, o chapéu, o vidro da poção,
 * o miado do gato e o vento do rasante.
 */
import { sintetizador } from '../sons';

const { tocar, tom, chiado, bolha, envelope, ruido, entre } = sintetizador;

/**
 * A gargalhada de bruxa: «he-he-he-he-heeee», cada sílaba mais grave, com a
 * voz trêmula (vibrato) e um filtro que faz o «é» anasalado.
 */
export function somGargalhada(): void {
  tocar(c => {
    const t0 = c.currentTime + 0.02;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1700;
    f.Q.value = 2.4;
    const saida = envelope(c, 0.7, 0.01, 1.25, t0, 0.2);
    f.connect(saida);
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = t0 + i * 0.105;
      const ultima = i === n;
      const dura = ultima ? 0.42 : 0.07;
      const alto = 1180 - i * 75 + entre(-20, 20);
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(alto, t);
      o.frequency.exponentialRampToValueAtTime(alto * (ultima ? 0.62 : 0.86), t + dura);
      const vib = c.createOscillator();
      vib.frequency.value = ultima ? 11 : 16;
      const prof = c.createGain();
      prof.gain.value = alto * 0.035;
      vib.connect(prof);
      prof.connect(o.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
      o.connect(g);
      g.connect(f);
      o.start(t); vib.start(t);
      o.stop(t + dura + 0.02); vib.stop(t + dura + 0.02);
    }
  });
}

/** O «puf» da chegada: fumaça que abre. */
export function somPuf(): void {
  tocar(c => {
    chiado(c, { pico: 0.4, dura: 0.38, filtro: 'bandpass', freq: 380, freqFim: 2400, q: 1.2, taxa: 0.7, ataque: 0.03 });
    tom(c, { tipo: 'sine', de: 90, para: 160, pico: 0.25, dura: 0.2 });
  });
}

/** O vento do rasante: sobe e desce. */
export function somVento(): void {
  tocar(c => {
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = ruido(c);
    src.playbackRate.value = 0.5;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1100, t + 0.35);
    f.frequency.exponentialRampToValueAtTime(260, t + 0.8);
    src.connect(f);
    f.connect(envelope(c, 0.28, 0.25, 0.55, t));
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.9);
  });
}

/** O grito de quem cai: agudo que despenca, tremendo (é longo: dura a queda). */
export function somGrito(): void {
  tocar(c => {
    const t = c.currentTime + 0.03;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1350, t);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.25);
    o.frequency.exponentialRampToValueAtTime(330, t + 1.15);
    const vib = c.createOscillator();
    vib.frequency.value = 9;
    const prof = c.createGain();
    prof.gain.value = 45;
    vib.connect(prof);
    prof.connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1500;
    f.Q.value = 1.6;
    o.connect(f);
    f.connect(envelope(c, 0.42, 0.04, 0.9, t, 0.3));
    o.start(t); vib.start(t);
    o.stop(t + 1.3); vib.stop(t + 1.3);
  });
}

/**
 * ESPATIFA: o corpo batendo no chão. O soco grave, o «splorch» molhado do
 * sangue espirrando, as bolhas e os pingos voltando. `forca` de 0 a 1.
 */
export function somEspatifa(forca: number): void {
  tocar(c => {
    const t = c.currentTime;
    const k = 0.5 + 0.5 * forca;
    tom(c, { tipo: 'sine', de: 150, para: 32, pico: 0.75 * k, dura: 0.28, em: t });
    tom(c, { tipo: 'triangle', de: 90, para: 40, pico: 0.4 * k, dura: 0.16, em: t });
    chiado(c, { pico: 0.55 * k, dura: 0.07, filtro: 'bandpass', freq: 900, em: t });
    chiado(c, { pico: 0.6 * k, dura: 0.45, filtro: 'lowpass', freq: 2000, freqFim: 180, q: 7, taxa: 0.45, em: t + 0.02 });
    for (let i = 0; i < 6; i++) bolha(c, t + entre(0.08, 0.5), entre(160, 380), entre(0.1, 0.2) * k);
    for (let i = 0; i < 7; i++) {
      chiado(c, { pico: entre(0.06, 0.14), dura: 0.03, filtro: 'bandpass', freq: entre(700, 1500), q: 4, em: t + entre(0.25, 1.1), taxa: 0.6 });
    }
  });
}

/** A vassoura partindo: dois estalos secos de madeira e o oco. */
export function somVassouraQuebra(): void {
  tocar(c => {
    const t = c.currentTime;
    chiado(c, { pico: 0.6, dura: 0.035, filtro: 'highpass', freq: 2600, em: t });
    chiado(c, { pico: 0.45, dura: 0.05, filtro: 'bandpass', freq: 1800, q: 3, em: t + 0.04 });
    tom(c, { de: 700, para: 180, pico: 0.3, dura: 0.07, em: t });
    tom(c, { tipo: 'triangle', de: 260, para: 140, pico: 0.25, dura: 0.12, em: t + 0.03 });
  });
}

/** O tiro levou o chapéu: «plinc» e o pano voando. */
export function somChapeu(): void {
  tocar(c => {
    const t = c.currentTime;
    tom(c, { de: 1500, para: 2300, pico: 0.25, dura: 0.06, em: t });
    chiado(c, { pico: 0.3, dura: 0.18, filtro: 'bandpass', freq: 3000, freqFim: 900, q: 2, em: t + 0.02 });
  });
}

/** A bruxa brava: um guincho curto. */
export function somBrava(): void {
  tocar(c => {
    const t = c.currentTime + 0.12;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(1350, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(820, t + 0.32);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1600;
    f.Q.value = 2;
    o.connect(f);
    f.connect(envelope(c, 0.3, 0.02, 0.3, t));
    o.start(t);
    o.stop(t + 0.4);
  });
}

/** Tiro de raspão na capa ou no cabelo: o pano rasgando. */
export function somRasga(): void {
  tocar(c => {
    const t = c.currentTime;
    for (let i = 0; i < 5; i++) chiado(c, { pico: 0.22, dura: 0.025, filtro: 'bandpass', freq: entre(2200, 3400), q: 2, em: t + i * 0.03 });
  });
}

/** A poção estourando no chão: vidro e borbulha. */
export function somVidro(): void {
  tocar(c => {
    const t = c.currentTime;
    chiado(c, { pico: 0.35, dura: 0.08, filtro: 'highpass', freq: 4000, em: t });
    for (let i = 0; i < 6; i++) tom(c, { tipo: 'triangle', de: entre(2600, 5200), para: entre(2400, 5000), pico: 0.12, dura: 0.12, em: t + entre(0, 0.2) });
    for (let i = 0; i < 5; i++) bolha(c, t + entre(0.1, 0.6), entre(250, 500), 0.12);
  });
}

/** O gato pulando fora: «miau» curto. */
export function somMiau(): void {
  tocar(c => {
    const t = c.currentTime + 0.05;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(560, t);
    o.frequency.exponentialRampToValueAtTime(940, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(480, t + 0.4);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(1600, t + 0.15);
    f.frequency.linearRampToValueAtTime(700, t + 0.4);
    f.Q.value = 3;
    o.connect(f);
    f.connect(envelope(c, 0.5, 0.04, 0.36, t));
    o.start(t);
    o.stop(t + 0.45);
  });
}

/** O tiro num fofo: «bonk» de desenho animado e um tilintar de estrelinhas. */
export function somBonk(): void {
  tocar(c => {
    tom(c, { tipo: 'sine', de: 720, para: 180, pico: 0.35, dura: 0.16 });
    tom(c, { tipo: 'triangle', de: 1600, para: 1500, pico: 0.12, dura: 0.08, em: c.currentTime + 0.1 });
    tom(c, { tipo: 'triangle', de: 2100, para: 2000, pico: 0.1, dura: 0.08, em: c.currentTime + 0.17 });
    tom(c, { tipo: 'triangle', de: 2600, para: 2500, pico: 0.08, dura: 0.1, em: c.currentTime + 0.24 });
  });
}

/** O fofo bate no chão e apaga: «boing» que murcha, sem respingo. */
export function somDesmaio(forca: number): void {
  tocar(c => {
    const t = c.currentTime;
    tom(c, { tipo: 'sine', de: 220, para: 90, pico: 0.25 + 0.2 * forca, dura: 0.22 });
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(380, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    const vib = c.createOscillator();
    vib.frequency.value = 14;
    const prof = c.createGain();
    prof.gain.value = 40;
    vib.connect(prof);
    prof.connect(o.frequency);
    o.connect(envelope(c, 0.22, 0.01, 0.45, t + 0.05));
    o.start(t + 0.05); vib.start(t + 0.05);
    o.stop(t + 0.6); vib.stop(t + 0.6);
  });
}

// ── A Bruxa do Pântano (a chefona, a bruxa do Minecraft) ────────────────────
//
// Sons feitos aqui, no espírito dos do jogo (nenhum arquivo do jogo entra):
// a garrafa indo, o gole, o bloco apanhando e quebrando, o teleporte do
// Ender, o «puf» da morte e o tilintar do XP.

/** A garrafa de poção saindo da mão: um sopro curto que sobe. */
export function somArremesso(): void {
  tocar(c => {
    chiado(c, { pico: 0.28, dura: 0.22, filtro: 'bandpass', freq: 700, freqFim: 2600, q: 1.6, taxa: 0.9, ataque: 0.02 });
    tom(c, { tipo: 'triangle', de: 300, para: 620, pico: 0.12, dura: 0.16 });
  });
}

/** Bebendo a poção: três goles graves no ritmo («glub, glub, glub»). */
export function somBeber(): void {
  tocar(c => {
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      bolha(c, t + i * 0.16, entre(110, 150), 0.32);
      tom(c, { tipo: 'sine', de: 180, para: 90, pico: 0.22, dura: 0.08, em: t + i * 0.16 });
    }
  });
}

/** Ela apanha: o «hmf» anasalado, curto, que cai. */
export function somDor(): void {
  tocar(c => {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(entre(520, 600), t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.14);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 3;
    o.connect(f);
    f.connect(envelope(c, 0.3, 0.01, 0.14, t));
    o.start(t);
    o.stop(t + 0.18);
  });
}

/** O tiro no bloco (o caldeirão): o «toc» seco de quem quebra pedra. */
export function somBloco(): void {
  tocar(c => {
    chiado(c, { pico: 0.35, dura: 0.06, filtro: 'bandpass', freq: entre(900, 1300), q: 2.5 });
    tom(c, { tipo: 'square', de: 240, para: 160, pico: 0.1, dura: 0.05 });
  });
}

/** O bloco quebrou: o esfarelar e a poção derramando. */
export function somBlocoQuebra(): void {
  tocar(c => {
    const t = c.currentTime;
    for (let i = 0; i < 4; i++) chiado(c, { pico: 0.4, dura: 0.07, filtro: 'bandpass', freq: entre(600, 1400), q: 1.5, em: t + i * 0.035 });
    chiado(c, { pico: 0.4, dura: 0.7, filtro: 'lowpass', freq: 1600, freqFim: 200, q: 4, taxa: 0.5, em: t + 0.08 });
    for (let i = 0; i < 6; i++) bolha(c, t + entre(0.1, 0.6), entre(150, 400), entre(0.1, 0.18));
  });
}

/** O caldeirão posto no chão: o baque do ferro e o borbulhar. */
export function somCaldeirao(): void {
  tocar(c => {
    const t = c.currentTime;
    tom(c, { tipo: 'triangle', de: 140, para: 60, pico: 0.45, dura: 0.18, em: t });
    chiado(c, { pico: 0.2, dura: 0.08, filtro: 'bandpass', freq: 700, em: t });
    for (let i = 0; i < 8; i++) bolha(c, t + 0.2 + i * entre(0.08, 0.16), entre(90, 220), entre(0.14, 0.24));
  });
}

/** A cura entrando: três notas subindo, brilhantes. */
export function somCura(): void {
  tocar(c => {
    const t = c.currentTime;
    [660, 880, 1320].forEach((f, i) => tom(c, { tipo: 'sine', de: f, para: f * 1.02, pico: 0.16, dura: 0.18, em: t + i * 0.07 }));
  });
}

/** O teleporte da Pérola do Ender: o «vuup» que desce e volta. */
export function somTeleporte(): void {
  tocar(c => {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.16);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.34);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    o.connect(f);
    f.connect(envelope(c, 0.28, 0.02, 0.32, t));
    o.start(t);
    o.stop(t + 0.38);
  });
}

/** A mesa de encantamento: um zumbido grave que sobe, com um brilho por cima. */
export function somEncantamento(): void {
  tocar(c => {
    const t = c.currentTime + 0.02;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 2.6);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 2.6);
    o.connect(f);
    f.connect(envelope(c, 0.35, 0.3, 0.4, t, 2.2));
    o.start(t);
    o.stop(t + 3);
    for (let i = 0; i < 8; i++) tom(c, { tipo: 'triangle', de: 1200 + i * 180, para: 1250 + i * 180, pico: 0.06, dura: 0.12, em: t + 0.3 + i * 0.28 });
  });
}

/** A onda do Encantamento saindo. */
export function somOnda(): void {
  tocar(c => {
    const t = c.currentTime;
    tom(c, { tipo: 'sine', de: 180, para: 30, pico: 0.6, dura: 0.6, em: t });
    chiado(c, { pico: 0.35, dura: 0.7, filtro: 'bandpass', freq: 3000, freqFim: 300, q: 0.8, em: t });
  });
}

/** A morte: o gemido que cai e, depois, o «puf» da fumaça branca. */
export function somMorte(): void {
  tocar(c => {
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.7);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1000;
    f.Q.value = 2;
    o.connect(f);
    f.connect(envelope(c, 0.35, 0.02, 0.7, t));
    o.start(t);
    o.stop(t + 0.75);
  });
}

/** O «puf» do mob sumindo em fumaça. */
export function somPufMorte(): void {
  tocar(c => {
    chiado(c, { pico: 0.5, dura: 0.35, filtro: 'lowpass', freq: 2200, freqFim: 400, taxa: 0.6, ataque: 0.01 });
  });
}

/** O XP: o «plim» agudo, cada orbe num tom. */
export function somXp(): void {
  tocar(c => {
    const f = entre(1500, 2600);
    tom(c, { tipo: 'sine', de: f, para: f * 1.01, pico: 0.14, dura: 0.12 });
    tom(c, { tipo: 'sine', de: f * 1.5, para: f * 1.5, pico: 0.06, dura: 0.08, em: c.currentTime + 0.03 });
  });
}

/** A conquista: a fanfarra curta de desafio concluído, subindo até o acorde. */
export function somConquista(): void {
  tocar(c => {
    const t = c.currentTime + 0.02;
    [523, 659, 784, 1047].forEach((f, i) => tom(c, { tipo: 'square', de: f, para: f, pico: 0.09, dura: 0.12, em: t + i * 0.09 }));
    for (const f of [1047, 1319, 1568]) tom(c, { tipo: 'triangle', de: f, para: f * 1.003, pico: 0.12, dura: 0.7, em: t + 0.38 });
  });
}
