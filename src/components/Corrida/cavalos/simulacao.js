/**
 * simulacao.js — a física da Corrida de Cavalos, sem tela nenhuma (JavaScript puro).
 *
 * A corrida é simulada UMA vez — no navegador do super admin, na hora de preparar a
 * largada — e o resultado (as posições de cada cavalo a cada 1/30 s) é gravado. Cada
 * tela só reproduz a gravação: a mesma corrida em todo PC, no mesmo segundo. Por isso
 * este arquivo é o mesmo para quem grava (`admin/acoes.ts`) e para quem assiste
 * (`corrida-cavalos.html`). Mudar a física muda o resultado das próximas corridas, não
 * o das já gravadas.
 *
 * O contrato está em `simulacao.d.ts`. A medida de justiça está no comentário de `simular`.
 */

export const X0 = 64;                    // focinho de todo cavalo na largada
export const DIST = 2400, L = X0 + DIST; // a linha de chegada, no mundo
export const METROS = 1200, PXM = DIST / METROS;
export const FPS = 30;                   // a gravação: 30 quadros por segundo
export const T2 = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const suave = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** Números aleatórios com semente (mulberry32): a mesma semente, a mesma sequência, em todo aparelho. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/*
 * Justiça da largada (medida em 2.000 corridas de 10 cavalos, 21/10/2026): o
 * último aos 3 s vencia 8% e o primeiro 13% — o justo é 10%. A causa era a
 * reação na largada (0,05 a 0,40 s): quem reagia devagar carregava o atraso até
 * o fim. Com a largada mais parelha e o fôlego guardado, toda posição aos 3 s
 * fica entre 9% e 11%, e ainda sobem as ultrapassagens (72 → 77) e as trocas de
 * liderança (5,9 → 6,2). As barreiras não mexem na justiça: mesma chance de
 * bater para todos, sorteada aqui, com o resto da corrida.
 */
export const BARREIRAS_EM = [0.28, 0.52, 0.76], CHANCE_BATER = 0.07, TOMBO = 0.18, TOMBO_PX = 60;
// O obstáculo atravessa a pista em diagonal: a asa do fundo fica no chão OB_Y0 em x − OB_K, a da frente
// no chão OB_Y1 em x + OB_K. Cada raia cruza as varas num ponto próprio (`desvioRaia`).
export const OB_K = 36, OB_Y0 = 125, OB_Y1 = 214, OB_GEO = { k: OB_K, y0: OB_Y0, y1: OB_Y1 };
export const desvioRaia = (i, n) => OB_K * (2 * (Math.round(129 + (i + 0.5) * (76 / n)) - OB_Y0) / (OB_Y1 - OB_Y0) - 1);
// O salto, medido no focinho contra o ponto em que a raia cruza as varas: decola SALTO0 px antes e pousa
// SALTO1 px depois. Quem bate sobe só SALTO_BATE e derruba a vara de cima. SALTO_Q quadros de pose (`quadros`).
export const SALTO0 = -12, SALTO1 = 50, SALTO_ALT = 19, SALTO_BATE = 10, SALTO_Q = 16;
// O pouso: todo cavalo perde ritmo (RECUP no pior ponto) e volta a acelerar ao longo de RECUP_PX.
// É igual para todos, nos mesmos pontos da pista: não mexe na justiça.
export const RECUP = 0.16, RECUP_PX = 110;
export const pouso = d => d <= 0 || d >= RECUP_PX ? 0 : d < 18 ? suave(d / 18) : 1 - suave((d - 18) / (RECUP_PX - 18));
export function simular(seed, n) {
  const r = rng(seed ^ 0x9e3779b9);
  const tipo = ['normal', 'normal', 'pelotao', 'virada', 'disparada'][Math.floor(r() * 5)];
  const k = tipo === 'pelotao' ? 0.45 : 1;
  const P = [];
  for (let i = 0; i < n; i++) P.push({
    reac: 0.05 + r() * 0.12, vmax: 100 * (1 + (r() - 0.5) * 0.04 * k), acel: 50 + r() * 35,
    ff: 0.45 + r() * 0.45, fd: r() * 0.1 * k, kf: 0.6 + r() * 0.28, ks: r() * 0.12 * k,
    ondas: [0, 1, 2].map(() => ({ f: 0.18 + r() * 0.5, ph: r() * T2, a: (0.03 + r() * 0.03) * k })),
    surtos: Array.from({ length: 3 + Math.floor(r() * 3) }, () => ({ t0: 1.5 + r() * 21, d: 1.2 + r() * 2, a: (0.05 + r() * 0.07) * k })),
    // Garra: o quanto ele reage quando fica para trás. As chances já vêm sorteadas
    // aqui, na ordem, para a corrida continuar idêntica em todo aparelho.
    garra: 0.45 + r() * 0.8, chances: Array.from({ length: 7 }, () => [r(), r(), r()]), nArr: 0,
    arr: { t0: 0, d: 1, a: 0, ate: -1, prox: 0 }, gasto: -1,
  });
  // A "personalidade" da corrida cai num cavalo qualquer: o sorteio continua igual para todos.
  // virada: um cavalo larga atrasado e chega forte. Atraso de 0,2 s (era 0,35): com a largada parelha,
  // 0,35 ficou desproporcional e o último dos 3 s passou a vencer 13%.
  if (tipo === 'virada') { const j = Math.floor(r() * n); Object.assign(P[j], { reac: P[j].reac + 0.2, vmax: P[j].vmax * 0.985, kf: 0.68 + r() * 0.1, ks: 0.12 + r() * 0.05, fd: 0 }); }
  if (tipo === 'disparada') { const j = Math.floor(r() * n); Object.assign(P[j], { vmax: P[j].vmax * 1.03, ff: 0.55 + r() * 0.2, fd: 0.06 + r() * 0.06 }); }

  // As barreiras: a mesma chance de bater para todos, sorteada aqui — a corrida segue idêntica em todo aparelho.
  const barreiras = BARREIRAS_EM.map(f => X0 + f * DIST);
  for (const p of P) p.bate = barreiras.map(() => r() < CHANCE_BATER);

  const DT = 1 / 120, PASSO = 120 / FPS;
  const xs = new Float64Array(n).fill(X0), vs = new Float64Array(n), fin = new Float64Array(n).fill(-1);
  const quadrosX = []; let t = 0, step = 0, ultimo = -1;
  while (true) {
    if (step % PASSO === 0) { const q = new Int16Array(n); for (let i = 0; i < n; i++) q[i] = Math.round((xs[i] - X0) * 4); quadrosX.push(q); }
    // o primeiro e o segundo de quem ainda corre: é contra eles que se mede «ficou para trás»
    let x1 = -1e9, x2 = -1e9;
    for (let i = 0; i < n; i++) { if (fin[i] >= 0) continue; if (xs[i] > x1) { x2 = x1; x1 = xs[i]; } else if (xs[i] > x2) x2 = xs[i]; }
    for (let i = 0; i < n; i++) {
      const p = P[i]; let alvo = 0;
      if (fin[i] >= 0) alvo = Math.max(22, p.vmax * (1 - (t - fin[i]) * 0.45));
      else if (t >= p.reac) {
        const prog = (xs[i] - X0) / DIST; let m = 1;
        for (const o of p.ondas) m += o.a * Math.sin(o.f * t * T2 + o.ph);
        for (const s of p.surtos) if (t > s.t0 && t < s.t0 + s.d) m += s.a * Math.sin(Math.PI * (t - s.t0) / s.d);
        if (prog > p.ff) m -= p.fd * suave((prog - p.ff) / (1 - p.ff + 1e-6));
        if (prog > p.kf) m += p.ks * suave((prog - p.kf) / 0.1);
        // Arrancada: quem ficou para trás tenta reagir de vez em quando — nem sempre, e
        // nem todos com a mesma garra. Sem isto o último do meio da corrida nunca voltava.
        const atras = x1 - xs[i], A = p.arr;
        if (t >= A.ate && t >= A.prox && atras > 25 && prog > 0.12 && prog < 0.92 && p.nArr < p.chances.length) {
          const [c1, c2, c3] = p.chances[p.nArr++];
          if (c1 < 0.75 * p.garra) Object.assign(A, { t0: t, d: 1.8 + c3 * 1.8, a: (0.07 + c2 * 0.06) * k, ate: t + 1.8 + c3 * 1.8 });
          A.prox = t + 2.5 + c3 * 3;
        }
        if (t < A.ate) m += A.a * Math.sin(Math.PI * (t - A.t0) / A.d);
        if (atras > 110) m += 0.012 * k * suave((atras - 110) / 200);
        // e quem abre demais sente um pouco: a folga sobre o segundo não cresce para sempre
        if (xs[i] === x1 && x2 > -1e9) { const folga = x1 - x2; if (folga > 24) m -= 0.045 * k * suave((folga - 24) / 90); }
        for (let j = 0; j < n; j++) { if (j === i || fin[j] >= 0) continue; const d = xs[j] - xs[i]; if (d > 6 && d < 45) { m += 0.012; break; } } // vácuo
        // Fôlego guardado: quem estava atrás aos 30% correu poupado e tem um pouco mais na reta final
        // (até +3,5%, proporcional ao atraso, com teto) — o «vem por fora» do turfe.
        if (p.gasto < 0 && prog >= 0.3) p.gasto = clamp(atras / 60, 0, 1);
        if (p.gasto > 0) m += 0.035 * p.gasto * suave((prog - 0.65) / 0.25);
        // Depois do pouso todo mundo se recupera; quem bateu na vara ainda perde ritmo por uns 60 px.
        for (let o = 0; o < barreiras.length; o++) {
          const d = xs[i] - barreiras[o] - desvioRaia(i, n) - SALTO1;
          m -= RECUP * pouso(d);
          if (p.bate[o] && d > 0 && d < TOMBO_PX) m -= TOMBO;
        }
        alvo = p.vmax * m;
      }
      const dv = alvo - vs[i]; vs[i] += dv > 0 ? Math.min(dv, p.acel * DT) : Math.max(dv, -70 * DT);
      const nx = xs[i] + vs[i] * DT;
      if (fin[i] < 0 && nx >= L) fin[i] = t + (L - xs[i]) / (nx - xs[i]) * DT;
      xs[i] = nx;
    }
    t += DT; step++;
    if (ultimo < 0 && fin.every(f => f >= 0)) ultimo = t;
    if ((ultimo >= 0 && t > ultimo + 2.2) || t > 90) break;
  }
  const frames = quadrosX.length, X = new Int16Array(frames * n);
  quadrosX.forEach((q, f) => X.set(q, f * n));
  const ordem = [...Array(n).keys()].sort((a, b) => fin[a] - fin[b] || a - b);
  const gap = fin[ordem[1]] - fin[ordem[0]];
  return { seed, tipo, n, frames, X, fin: Array.from(fin), ordem, barreiras, bate: P.map(p => p.bate), vencedor: ordem[0], tVenc: fin[ordem[0]], gap, apertada: gap < 0.045, dur: (frames - 1) / FPS };
}
