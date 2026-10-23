/*
 * O som da Guerra na Corrida (23/10/2026): tudo sintetizado, nenhum arquivo.
 * O mesmo para a janela da corrida (`naCorrida.js`) e para a página
 * (`palcoGuerra.js`). `volume` de 0 a 1: o operador ouve a 12%, o super_admin
 * inteiro (a mesma regra da Bruxa).
 *
 * As músicas tocam por agendamento (40 ms à frente, como a da corrida): o
 * relógio é o do AudioContext, então não atrasa quando a aba engasga.
 */
const mf = m => 440 * 2 ** ((m - 69) / 12);
const entre = (a, b) => a + Math.random() * (b - a);

export function criarSomGuerra(volume = 1) {
  let ac = null, mestre = null, musG = null, ruidoB = null, dist = null, idSeq = 0, vol = volume;
  const ultimo = {}, seq = { nome: null, prox: 0, i: 0 };
  const pode = (k, ms) => { const n = performance.now(); if (n - (ultimo[k] || 0) < ms) return false; ultimo[k] = n; return true; };
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; return; }
    mestre = ac.createGain(); mestre.gain.value = 0.5 * vol; mestre.connect(ac.destination);
    musG = ac.createGain(); musG.gain.value = 0.6; musG.connect(mestre);
    ruidoB = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = ruidoB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    dist = ac.createWaveShaper(); const cur = new Float32Array(256); for (let i = 0; i < 256; i++) cur[i] = Math.tanh((i / 128 - 1) * 4); dist.curve = cur; dist.connect(mestre);
    idSeq = setInterval(agendar, 40);
  }
  const env = (g, t0, a, v, dur) => { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); };
  function ruido(t0, dur, { f0 = 1200, f1 = f0, tipo = 'lowpass', v = 0.3, q = 0.8, a = 0.004, saida = mestre } = {}) {
    const s = ac.createBufferSource(); s.buffer = ruidoB; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = tipo; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ac.createGain(); env(g, t0, a, v, dur); s.connect(f).connect(g).connect(saida); s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }
  function nota(t0, f0, dur, { f1 = f0, tipo = 'square', v = 0.08, a = 0.01, saida = mestre } = {}) {
    const o = ac.createOscillator(); o.type = tipo; o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain(); env(g, t0, a, v, dur); o.connect(g).connect(saida); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function relinchar(t, base, alto, fim, dur, vib, v, saida) {
    const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(alto, t + dur * 0.25); o.frequency.exponentialRampToValueAtTime(fim, t + dur);
    lfo.frequency.value = vib; lg.gain.value = alto * 0.07; lfo.connect(lg).connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = alto * 1.1; f.Q.value = 1.5; env(g, t, 0.03, v, dur);
    o.connect(f).connect(g).connect(saida); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  const PADROES = {
    guerra: { bpm: 96, passo(i, t, d) {
      const b = i % 16;
      if (b === 0 || b === 7 || b === 10) nota(t, 110, 0.25, { f1: 40, tipo: 'sine', v: 0.35, saida: musG });
      if (b === 4 || b === 12) ruido(t, 0.18, { f0: 2500, f1: 900, tipo: 'bandpass', v: 0.14, saida: musG });
      if (b % 2 === 1) ruido(t, 0.04, { f0: 6000, tipo: 'highpass', v: 0.025, saida: musG });
      if (i % 32 === 0) nota(t, mf(33), d * 30, { tipo: 'sawtooth', v: 0.03, a: 0.4, saida: musG });
      if (i % 64 === 48) nota(t, mf(57), d * 8, { tipo: 'triangle', v: 0.04, saida: musG });
    } },
    luto: { bpm: 56, passo(i, t, d) {
      const mel = [69, 0, 72, 0, 76, 0, 74, 0, 72, 0, 71, 0, 69, 0, 0, 0, 64, 0, 67, 0, 72, 0, 71, 0, 69, 0, 0, 0, 0, 0, 0, 0];
      const m = mel[i % 32]; if (m) nota(t, mf(m), d * 3.2, { tipo: 'triangle', v: 0.07, a: 0.05, saida: musG });
      if (i % 16 === 0) nota(t, mf(45), d * 15, { tipo: 'sine', v: 0.06, a: 0.6, saida: musG });
    } },
    chefao: { bpm: 168, passo(i, t, d) {
      const b = i % 16, raiz = [40, 40, 43, 38][Math.floor(i / 16) % 4];
      if (b % 4 === 0) nota(t, 120, 0.18, { f1: 40, tipo: 'sine', v: 0.4, saida: musG });
      if (b % 8 === 4) ruido(t, 0.14, { f0: 3000, f1: 1000, tipo: 'bandpass', v: 0.15, saida: musG });
      nota(t, mf(raiz + (b % 2 ? 12 : 0)), d * 0.9, { tipo: 'sawtooth', v: 0.035, saida: musG });
      const arp = [64, 67, 71, 67, 64, 67, 72, 71]; if (b % 2 === 0) nota(t, mf(arp[(b >> 1) % 8] + raiz - 40), d * 1.5, { tipo: 'square', v: 0.028, saida: musG });
    } },
  };
  function agendar() {
    if (!ac || !seq.nome || vol <= 0) return;
    const P = PADROES[seq.nome], d = 60 / P.bpm / 4;
    if (seq.prox < ac.currentTime) seq.prox = ac.currentTime + 0.05;
    while (seq.prox < ac.currentTime + 0.15) { P.passo(seq.i, seq.prox, d); seq.prox += d; seq.i++; }
  }
  const ok = () => !!ac && vol > 0;
  const T = () => ac.currentTime;
  return {
    init,
    fechar() { seq.nome = null; clearInterval(idSeq); try { ac?.close(); } catch { /* já fechado */ } ac = null; },
    volume(v) { vol = v; if (mestre) mestre.gain.value = 0.5 * vol; },
    /** 'guerra' | 'luto' | 'chefao' | null */
    musica(nome) { if (seq.nome === nome) return; seq.nome = nome; seq.i = 0; if (ac) seq.prox = ac.currentTime + 0.05; },
    tiro(v = 1) { if (!ok() || !pode('tiro', 55)) return; const t = T(); ruido(t, 0.09, { f0: 2600, f1: 500, tipo: 'bandpass', v: 0.2 * v, q: 0.7 }); nota(t, 180, 0.05, { f1: 60, v: 0.05 * v }); },
    arma() { if (!ok() || !pode('arma', 40)) return; const t = T(); ruido(t, 0.13, { f0: 5000, f1: 700, tipo: 'bandpass', v: 0.32, q: 0.5, a: 0.002 }); nota(t, 140, 0.12, { f1: 45, tipo: 'sine', v: 0.32 }); ruido(t + 0.02, 0.25, { f0: 900, f1: 200, v: 0.06 }); },
    rajada(n = 4) { if (!ok() || !pode('rajada', 200)) return; const t = T(); for (let i = 0; i < n; i++) ruido(t + i * 0.075, 0.07, { f0: 2400, f1: 600, tipo: 'bandpass', v: 0.17, q: 0.7 }); },
    acerto() { if (!ok() || !pode('acerto', 60)) return; ruido(T(), 0.05, { f0: 1200, f1: 300, v: 0.14 }); },
    explosao(g = 1) { if (!ok() || !pode('exp', 90)) return; const t = T(), v = Math.min(1, g); ruido(t, 1.1 * g, { f0: 1400, f1: 60, v: 0.5 * v, a: 0.005 }); nota(t, 90, 0.6 * g, { f1: 30, tipo: 'sine', v: 0.45 * v }); },
    baque() { if (!ok() || !pode('baque', 120)) return; const t = T(); nota(t, 110, 0.25, { f1: 40, tipo: 'sine', v: 0.3 }); ruido(t, 0.25, { f0: 600, f1: 120, v: 0.18 }); },
    assobio() { if (!ok() || !pode('assobio', 350)) return; nota(T(), 1500, 0.85, { f1: 380, tipo: 'sine', v: 0.045 }); },
    aviao() { if (!ok() || !pode('aviao', 1500)) return; const t = T(); ruido(t, 2.6, { f0: 300, f1: 160, tipo: 'bandpass', v: 0.08, q: 3, a: 0.6 }); nota(t, 95, 2.6, { f1: 80, tipo: 'sawtooth', v: 0.025, a: 0.6 }); },
    /** O relincho de um cavalo da corrida (bravo: o da raiva). */
    relincho(bravo = false) { if (!ok() || !pode('rel', 260)) return; const t = T(); if (bravo) relinchar(t, 380, 700, 220, 1, 26, 0.14, dist); else relinchar(t, 620, 1150, 430, 0.95, 17, 0.08, mestre); },
    /** O relincho do chefe: grave, distorcido, com um rugido por baixo. */
    relinchoChefe(dur = 1.6) { if (!ok()) return; const t = T(); relinchar(t, 260, 520, 140, dur, 22, 0.16, dist); relinchar(t + 0.03, 390, 760, 210, dur * 0.9, 31, 0.06, mestre); ruido(t, dur, { f0: 700, f1: 160, v: 0.22, a: 0.05 }); },
    /** O choro do sobrevivente: um relincho baixinho que desce. */
    choro() { if (!ok() || !pode('choro', 900)) return; const t = T(); relinchar(t, 520, 600, 300, 1.4, 6, 0.05, mestre); },
    rumor(dur = 3.5) { if (!ok()) return; const t = T(); ruido(t, dur, { f0: 140, f1: 70, v: 0.3, a: 1.2 }); nota(t, 45, dur, { f1: 38, tipo: 'sine', v: 0.25, a: 1.2 }); },
    brilho(dur = 3) { if (!ok()) return; const t = T(); for (let k = 0; k < 18; k++) nota(t + k * dur / 18, mf(60 + k * 2 + (k % 3) * 3), 0.25, { tipo: 'square', v: 0.035 }); },
    vidro() { if (!ok() || !pode('vidro', 150)) return; const t = T(); ruido(t, 0.5, { f0: 7000, f1: 2500, tipo: 'highpass', v: 0.3, a: 0.002 }); for (let k = 0; k < 12; k++) nota(t + entre(0, 0.45), entre(2200, 5200), 0.07, { tipo: 'sine', v: 0.05 }); },
    crash() { if (!ok() || !pode('crash', 150)) return; const t = T(); nota(t, 80, 0.5, { f1: 30, tipo: 'sine', v: 0.55 }); ruido(t, 0.7, { f0: 2200, f1: 150, v: 0.45, a: 0.002 }); ruido(t, 0.3, { f0: 4000, f1: 1500, tipo: 'bandpass', v: 0.2 }); },
    fogo(dur = 1.6) { if (!ok()) return; ruido(T(), dur, { f0: 700, f1: 1400, tipo: 'bandpass', v: 0.24, q: 0.6, a: 0.12 }); },
    labareda() { if (!ok() || !pode('lab', 120)) return; ruido(T(), 0.5, { f0: 300, f1: 2400, tipo: 'bandpass', v: 0.22, q: 0.8, a: 0.05 }); },
    estouro() { if (!ok() || !pode('estouro', 70)) return; const t = T(); ruido(t, 0.4, { f0: 2400, f1: 300, tipo: 'bandpass', v: 0.25, q: 0.7, a: 0.003 }); nota(t, 220, 0.2, { f1: 70, tipo: 'sine', v: 0.18 }); },
    imune() { if (!ok() || !pode('imune', 90)) return; nota(T(), 1800, 0.12, { f1: 2400, tipo: 'triangle', v: 0.06 }); },
    escudo() { if (!ok()) return; const t = T(); nota(t, 110, 1.4, { f1: 220, tipo: 'sawtooth', v: 0.05, a: 0.2 }); ruido(t, 1.4, { f0: 400, f1: 2000, tipo: 'bandpass', v: 0.18, a: 0.3 }); },
    /** A trombeta do Apocalipse: metal grave, quatro notas. */
    trombeta() {
      if (!ok()) return; const t = T();
      for (const [f, dt] of [[98, 0], [147, 0.45], [131, 0.9], [98, 1.35]]) for (const det of [0.996, 1.004]) {
        const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * det, t + dt);
        fl.type = 'lowpass'; fl.frequency.setValueAtTime(380, t + dt); fl.frequency.linearRampToValueAtTime(1500, t + dt + 0.15); env(g, t + dt, 0.08, 0.07, 0.6);
        o.connect(fl).connect(g).connect(mestre); o.start(t + dt); o.stop(t + dt + 0.65);
      }
      ruido(t, 2.2, { f0: 300, f1: 120, v: 0.12, a: 0.4 });
    },
    maldicao(nome) { if (!ok()) return; const t = T(), base = { peste: 220, fome: 165, morte: 110 }[nome] ?? 150; [0, 0.25, 0.5].forEach((dt, k) => nota(t + dt, base * [1, 0.94, 0.84][k], 0.6, { f1: base * 0.6, tipo: 'triangle', v: 0.08 })); ruido(t, 1, { f0: 900, f1: 200, tipo: 'bandpass', v: 0.1 }); },
    banido() { if (!ok()) return; const t = T(); for (let k = 0; k < 8; k++) nota(t + k * 0.05, mf(76 + k * 2), 0.2, { tipo: 'square', v: 0.035 }); ruido(t, 0.5, { f0: 3000, f1: 800, tipo: 'bandpass', v: 0.18 }); },
    tink() { if (!ok() || !pode('tink', 45)) return; const t = T(); nota(t, entre(2300, 2800), 0.14, { f1: 1900, tipo: 'triangle', v: 0.06 }); ruido(t, 0.05, { f0: 6000, tipo: 'highpass', v: 0.08 }); },
    vitoria() { if (!ok()) return; const t = T(); [[72, 0], [76, 0.18], [79, 0.36], [84, 0.54], [79, 0.9], [84, 1.08]].forEach(([m, dt]) => nota(t + dt, mf(m), dt > 0.8 ? 0.8 : 0.22, { tipo: 'square', v: 0.07 })); },
    /** O coro do anjo descendo: um acorde maior, aberto, que sobe. */
    coro() { if (!ok()) return; const t = T(); for (const [m, dt] of [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36]]) { nota(t + dt, mf(m), 1.6, { tipo: 'sine', v: 0.05, a: 0.25 }); nota(t + dt, mf(m) * 1.003, 1.6, { tipo: 'triangle', v: 0.02, a: 0.3 }); } },
    mastiga() { if (!ok() || !pode('mastiga', 180)) return; const t = T(); ruido(t, 0.16, { f0: 900, f1: 250, v: 0.32, a: 0.003 }); nota(t, 90, 0.12, { f1: 50, tipo: 'sine', v: 0.25 }); },
    arroto() { if (!ok()) return; relinchar(T(), 120, 180, 70, 0.7, 14, 0.12, dist); },
  };
}
