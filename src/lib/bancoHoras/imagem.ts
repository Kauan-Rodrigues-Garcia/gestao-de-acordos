/**
 * A imagem do banco de horas para colar no e-mail (PNG), desenhada no canvas.
 *
 * Com a cara do gestão (18/11/2026): as cores do tema claro (o e-mail abre
 * claro), a faixa na cor da marca — azul BookPlay, verde quando o setor é da
 * Pague Play —, a fonte do app e o mesmo código de cor da tela:
 *
 *   positivas .. a cor da marca      negativas .. vermelho (sempre)
 *   vence 25 ... âmbar               em dia ..... verde
 *
 * Com um setor: cartões de número, os últimos 3 meses e a lista de pessoas
 * (devendo / vence / positivas). Sem setor: o resumo, um setor por linha, com
 * a situação das pessoas de cada um e o total.
 */
import {
  type FiltroSituacao, type Pessoa, type ResumoSetor, type TomGrupo, type Visao,
  grupoDe, grupos, ordemNatural, porSetor, somaDoMes,
} from './calculos';
import { data as fmtData, diaMes, horas, iniciais, MESES_CURTOS, mesLongo, plural } from './formato';

export type ModoImagem = 'todas' | 'vence' | 'neg' | 'pos';
export const MODOS_IMAGEM: { id: ModoImagem; titulo: string }[] = [
  { id: 'todas', titulo: 'Tudo' }, { id: 'vence', titulo: 'Só quem vence' },
  { id: 'neg', titulo: 'Só negativas' }, { id: 'pos', titulo: 'Só positivas' },
];

export const passaModo = (p: Pessoa, m: ModoImagem) =>
  (m === 'vence' ? p.vprox > 0 : m === 'neg' ? p.saldo < 0 : m === 'pos' ? p.saldo > 0 : true);

/** Os tokens do tema claro do gestão (`index.css`), em hex. */
const BASE = {
  tx: '#0f1b20', tx2: '#3c4a50', tx3: '#6b787d', bd: '#d9e1e4', bd2: '#e8eef0',
  bg: '#ffffff', bg2: '#f5f9fb', bg3: '#eef3f5',
  neg: '#c4004f', negB: '#d10054', negS: '#fde8ef',
  warn: '#874f00', warnB: '#d27a00', warnS: '#fff3df',
  ok: '#00701a', okB: '#00801a', okS: '#e3f5e7',
};
/** A cor da marca: BookPlay azul, PaguePlay verde (`lib/marca.ts`). */
const MARCA = {
  bookplay: { cor: '#00648e', escura: '#004a6b', suave: '#e3f0f6', nome: 'BookPlay' },
  pagueplay: { cor: '#006b2c', escura: '#004f20', suave: '#e2f2e8', nome: 'PaguePlay' },
};
const FONTE = 'Inter,"Segoe UI Variable Text","Segoe UI",system-ui,Arial,sans-serif';
const FONTE_TIT = 'Inter,"Segoe UI Variable Display","Segoe UI",system-ui,Arial,sans-serif';

/** A foto vem do storage do gestão: sem `anonymous` o canvas fica «sujo» e não vira PNG. */
const carregar = (src: string) => new Promise<HTMLImageElement | null>(r => {
  const i = new Image();
  i.crossOrigin = 'anonymous';
  i.onload = () => r(i);
  i.onerror = () => r(null);
  i.src = src;
});

export interface OpcoesImagem {
  visao: Visao;
  /** As pessoas que a tela alcança (já recortadas pelo setor e pela busca). */
  pessoas: Pessoa[];
  /** Nome do setor (como a tela mostra) ou vazio para o resumo de todos. */
  setor: string;
  modo: ModoImagem;
  limite: number;
  fotoDe: (p: Pessoa) => string | null;
}

export async function desenharImagem({ visao: v, pessoas, setor, modo, limite, fotoDe }: OpcoesImagem): Promise<HTMLCanvasElement> {
  const W = 960; const PAD = 40; const ESC = 2;
  const sit: FiltroSituacao = modo === 'todas' ? 'todas' : modo;
  const L = pessoas.filter(p => (!setor || p.setor === setor) && passaModo(p, modo));
  const gs = !setor ? porSetor(pessoas.filter(p => passaModo(p, modo)), v.ult3, sit, limite).sort((a, b) => ordemNatural(a.setor, b.setor)) : [];
  const pague = (setor ? L : pessoas).length > 0 && (setor ? L : pessoas).every(p => p.empresa === 'Pague Play');
  const M = pague ? MARCA.pagueplay : MARCA.bookplay;
  const COR: Record<TomGrupo, { tx: string; b: string; s: string }> = {
    pos: { tx: M.cor, b: M.cor, s: M.suave }, neg: { tx: BASE.neg, b: BASE.negB, s: BASE.negS },
    warn: { tx: BASE.warn, b: BASE.warnB, s: BASE.warnS }, ok: { tx: BASE.ok, b: BASE.okB, s: BASE.okS },
  };
  const nomeModo = { todas: '', vence: `Só quem vence em ${fmtData(v.prox)}`, neg: 'Só quem está devendo', pos: 'Só quem tem horas positivas' }[modo];
  const defs = grupos(v, sit, limite);

  const secoes: [string, TomGrupo, Pessoa[]][] = [];
  if (setor) {
    const vence = L.filter(p => p.vprox > 0 && p.saldo >= 0).sort((a, b) => b.vprox - a.vprox);
    const dev = L.filter(p => p.saldo < 0).sort((a, b) => a.saldo - b.saldo);
    const resto = L.filter(p => p.saldo >= 0 && !(p.vprox > 0)).sort((a, b) => b.saldo - a.saldo);
    if (modo === 'vence') secoes.push([`Precisam compensar até ${fmtData(v.prox)}`, 'warn', vence.concat(L.filter(p => p.saldo < 0))]);
    else if (modo === 'neg') secoes.push(['Devendo horas', 'neg', dev]);
    else if (modo === 'pos') secoes.push(['Horas positivas', 'pos', [...L].sort((a, b) => b.saldo - a.saldo)]);
    else secoes.push(['Devendo horas', 'neg', dev], [`Vence em ${fmtData(v.prox)}`, 'warn', vence], ['Horas positivas', 'pos', resto]);
  }
  const sec = secoes.filter(s => s[2].length);
  const ROW = 48;
  const mostraMeses = !!setor && modo !== 'vence';
  const nLin = setor ? sec.reduce((t, s) => t + s[2].length, 0) : gs.length + 1;
  const H = 132 + 150 + (mostraMeses ? 210 : 0) + (setor ? sec.length * 60 : 110) + Math.max(1, nLin) * (setor ? ROW : 58) + 90;

  const cv = document.createElement('canvas');
  cv.width = W * ESC; cv.height = H * ESC;
  const c = cv.getContext('2d');
  if (!c) return cv;
  c.scale(ESC, ESC);
  c.textBaseline = 'alphabetic';
  const fonte = (px: number, peso = 400, tit = false) => `${peso} ${px}px ${tit ? FONTE_TIT : FONTE}`;
  const txt = (t: string, x: number, y: number, px: number, cor: string, peso = 400, al: CanvasTextAlign = 'left', tit = false) => {
    c.font = fonte(px, peso, tit); c.fillStyle = cor; c.textAlign = al; c.fillText(t, x, y); return c.measureText(t).width;
  };
  const largura = (t: string, px: number, peso = 400) => { c.font = fonte(px, peso); return c.measureText(t).width; };
  const corta = (t: string, max: number, px: number, peso = 400) => {
    c.font = fonte(px, peso);
    if (c.measureText(t).width <= max) return t;
    let s = t;
    while (s.length > 1 && c.measureText(`${s}…`).width > max) s = s.slice(0, -1);
    return `${s}…`;
  };
  const caixa = (x: number, y: number, w: number, h: number, r: number, fill?: string, borda?: string) => {
    c.beginPath(); c.roundRect(x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (borda) { c.strokeStyle = borda; c.lineWidth = 1; c.stroke(); }
  };
  const pilula = (t: string, x: number, y: number, px: number, fg: string, bg: string, al: 'left' | 'right' = 'left') => {
    const w = largura(t, px, 700) + 18;
    const x0 = al === 'right' ? x - w : x;
    caixa(x0, y - px - 4, w, px + 11, (px + 11) / 2, bg);
    txt(t, x0 + 9, y + 1, px, fg, 700);
    return w;
  };
  const linhaH = (y: number, cor = BASE.bd2) => { c.fillStyle = cor; c.fillRect(PAD, y, W - PAD * 2, 1); };

  // ── fundo e faixa da marca ─────────────────────────────────────────────────
  c.fillStyle = BASE.bg; c.fillRect(0, 0, W, H);
  const faixa = c.createLinearGradient(0, 0, W, 0);
  faixa.addColorStop(0, M.escura); faixa.addColorStop(1, M.cor);
  c.fillStyle = faixa; c.fillRect(0, 0, W, 112);
  // marca: relógio num quadrado
  caixa(PAD, 30, 52, 52, 14, 'rgba(255,255,255,0.16)');
  c.strokeStyle = '#ffffff'; c.lineWidth = 2.6; c.lineCap = 'round';
  c.beginPath(); c.arc(PAD + 26, 56, 13, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(PAD + 26, 48); c.lineTo(PAD + 26, 56); c.lineTo(PAD + 32, 60); c.stroke();
  txt('BANCO DE HORAS', PAD + 68, 46, 11.5, 'rgba(255,255,255,0.78)', 700);
  txt(corta(setor || 'Todos os setores', 520, 28, 700), PAD + 68, 78, 28, '#ffffff', 700, 'left', true);
  const amostra = L[0];
  const sub = [setor && amostra ? `${amostra.depto} · ${amostra.empresa}` : `Resumo por setor · ${plural(gs.length, 'setor', 'setores')}`,
    plural(L.length, 'pessoa', 'pessoas'), nomeModo].filter(Boolean).join('  ·  ');
  txt(corta(sub, 560, 13, 500), PAD + 68, 98, 13, 'rgba(255,255,255,0.86)', 500);
  // selo da data
  const selo = `Saldo em ${fmtData(v.data)}`;
  const ws = largura(selo, 13, 700) + 28;
  caixa(W - PAD - ws, 40, ws, 32, 16, '#ffffff');
  txt(selo, W - PAD - ws / 2, 61, 13, M.escura, 700, 'center');

  // ── cartões de número ─────────────────────────────────────────────────────
  let bp = 0; let bn = 0; let np = 0; let nn = 0; let vp = 0; let nv = 0;
  for (const p of L) {
    if (p.saldo > 0) { bp += p.saldo; np++; } else if (p.saldo < 0) { bn += p.saldo; nn++; }
    if (p.vprox > 0) { vp += p.vprox; nv++; }
  }
  const K: [string, string, string, TomGrupo][] = [];
  if (modo !== 'neg') K.push(['Horas positivas', horas(bp), plural(np, 'pessoa com horas guardadas', 'pessoas com horas guardadas'), 'pos']);
  if (modo === 'todas' || modo === 'neg') K.push(['Horas negativas', horas(bn), plural(nn, 'pessoa devendo', 'pessoas devendo'), 'neg']);
  if (modo === 'todas' || modo === 'vence') K.push([`Vence em ${diaMes(v.prox)}`, horas(vp), plural(nv, 'pessoa precisa compensar', 'pessoas precisam compensar'), 'warn']);
  if (modo === 'pos') K.push([`Acima de ${limite}h`, String(L.filter(p => p.saldo >= limite * 60).length), 'pessoas para programar folga', 'pos']);
  if (modo === 'neg') {
    const pior = [...L].sort((a, b) => a.saldo - b.saldo)[0];
    K.push(['Maior dívida', pior ? horas(pior.saldo) : '—', pior ? corta(pior.nome, 180, 12, 500) : '', 'neg']);
  }
  if (modo === 'todas' || modo === 'pos') K.push(['Média por pessoa', horas(np ? bp / np : 0), 'das horas positivas', 'pos']);
  const kw = (W - PAD * 2 - 14 * (K.length - 1)) / K.length;
  const ky = 132;
  K.forEach(([k, val, s, tom], i) => {
    const x = PAD + i * (kw + 14);
    const cor = COR[tom];
    caixa(x, ky, kw, 100, 14, BASE.bg, BASE.bd);
    c.save(); c.beginPath(); c.roundRect(x, ky, kw, 100, 14); c.clip();
    c.fillStyle = cor.b; c.fillRect(x, ky, 5, 100);
    c.restore();
    txt(k.toUpperCase(), x + 20, ky + 27, 11, BASE.tx3, 700);
    txt(val, x + 20, ky + 65, 30, cor.tx, 700, 'left', true);
    txt(corta(s, kw - 34, 11.5, 500), x + 20, ky + 86, 11.5, BASE.tx3, 500);
  });
  let y = ky + 100 + 28;

  // ── últimos 3 meses (só para um setor) ─────────────────────────────────────
  if (mostraMeses) {
    const altCard = 178;
    caixa(PAD, y, W - PAD * 2, altCard, 14, BASE.bg2, BASE.bd2);
    txt('Últimos 3 meses', PAD + 20, y + 30, 15, BASE.tx, 700, 'left', true);
    const parcial = +v.data.slice(8) < 28;
    txt(`horas feitas em cada mês${parcial ? ` · ${MESES_CURTOS[+v.data.slice(5, 7) - 1]} vai até ${diaMes(v.data)}` : ''}`, W - PAD - 20, y + 30, 11.5, BASE.tx3, 500, 'right');
    const ds = v.ult3.map(m => somaDoMes(L, m));
    const mx = Math.max(1, ...ds.map(d => Math.max(d.pos, -d.neg)));
    const gw = (W - PAD * 2 - 40) / 3; const bh = 86; const base = y + 52 + bh;
    ds.forEach((d, i) => {
      const cx = PAD + 20 + i * gw + gw / 2; const bw = 40;
      const hp = (d.pos / mx) * bh; const hn = (-d.neg / mx) * bh;
      const doisLados = modo === 'todas';
      if (modo !== 'neg') {
        const xp = doisLados ? cx - bw - 4 : cx - bw / 2;
        caixa(xp, base - Math.max(3, hp), bw, Math.max(3, hp), 6, COR.pos.b);
        txt(horas(d.pos), xp + bw / 2, base - Math.max(3, hp) - 7, 11.5, COR.pos.tx, 700, 'center');
      }
      if (modo !== 'pos') {
        const xn = doisLados ? cx + 4 : cx - bw / 2;
        caixa(xn, base - Math.max(3, hn), bw, Math.max(3, hn), 6, COR.neg.b);
        txt(d.neg ? horas(d.neg) : '0h00', xn + bw / 2, base - Math.max(3, hn) - 7, 11.5, COR.neg.tx, 700, 'center');
      }
      c.fillStyle = BASE.bd; c.fillRect(cx - gw / 2 + 24, base, gw - 48, 1);
      txt(mesLongo(v.ult3[i]), cx, base + 20, 12, BASE.tx2, 600, 'center');
    });
    y += altCard + 26;
  }

  // ── cabeçalho de uma seção ────────────────────────────────────────────────
  const cabec = (tit: string, tom: TomGrupo, n: string, cols: [string, number, CanvasTextAlign][]) => {
    c.fillStyle = COR[tom].b; c.beginPath(); c.roundRect(PAD, y + 9, 4, 18, 2); c.fill();
    const w = txt(tit, PAD + 14, y + 23, 15, BASE.tx, 700, 'left', true);
    txt(n, PAD + 22 + w, y + 23, 12, BASE.tx3, 600);
    cols.forEach(([t, x, al]) => txt(t, x, y + 23, 10.5, BASE.tx3, 700, al));
    y += 36; linhaH(y, BASE.bd); y += 4;
  };

  if (setor) {
    const COLS = { nome: PAD + 58, nomeW: 340, saldo: 640, vence: 750, sit: W - PAD - 12 };
    const fotos = await Promise.all(L.map(p => { const u = fotoDe(p); return u ? carregar(u) : Promise.resolve(null); }));
    const fotoDeP = new Map(L.map((p, i) => [p.key, fotos[i]]));
    if (!sec.length) { txt('Ninguém nesta lista.', PAD, y + 30, 14, BASE.tx3, 500); y += 50; }
    for (const [tit, tom, ps] of sec) {
      cabec(tit, tom, plural(ps.length, 'pessoa', 'pessoas'), [['SALDO DO BANCO', COLS.saldo, 'right'],
        ...(modo !== 'pos' ? [[`VENCE ${diaMes(v.prox)}`, COLS.vence, 'right'] as [string, number, CanvasTextAlign]] : []),
        ['SITUAÇÃO', COLS.sit, 'right']]);
      ps.forEach((p, i) => {
        const neg = p.saldo < 0; const yy = y + ROW / 2;
        if (neg) caixa(PAD, y + 3, W - PAD * 2, ROW - 6, 10, BASE.negS); else if (i % 2) caixa(PAD, y + 3, W - PAD * 2, ROW - 6, 10, BASE.bg2);
        const ax = PAD + 30; const r = 15; const im = fotoDeP.get(p.key);
        const anel = neg ? COR.neg.b : p.vprox > 0 && modo !== 'pos' ? COR.warn.b : COR.pos.b;
        c.beginPath(); c.arc(ax, yy, r + 2, 0, 7); c.fillStyle = anel; c.fill();
        c.save(); c.beginPath(); c.arc(ax, yy, r, 0, 7); c.clip();
        if (im) c.drawImage(im, ax - r, yy - r, r * 2, r * 2);
        else { c.fillStyle = neg ? BASE.negS : COR.pos.s; c.fillRect(ax - r, yy - r, r * 2, r * 2); txt(iniciais(p.nome), ax, yy + 4, 11, neg ? BASE.neg : COR.pos.tx, 700, 'center'); }
        c.restore();
        txt(corta(p.nome, COLS.nomeW, 14, 600), COLS.nome, yy + 5, 14, BASE.tx, 600);
        if (neg) pilula(`${horas(p.saldo)} devendo`, COLS.saldo, yy + 5, 12, '#ffffff', COR.neg.b, 'right');
        else txt(horas(p.saldo), COLS.saldo, yy + 5, 15, COR.pos.tx, 700, 'right', true);
        if (modo !== 'pos') {
          if (p.vprox > 0) txt(horas(p.vprox), COLS.vence, yy + 5, 14, COR.warn.tx, 700, 'right');
          else txt('—', COLS.vence, yy + 5, 14, BASE.tx3, 500, 'right');
        }
        const g = grupoDe(p, modo === 'pos' ? 'pos' : 'todas', limite);
        const tag: [string, TomGrupo] = g === 'dev' ? ['Devendo horas', 'neg'] : g === 'vence' ? [`Vence ${diaMes(v.prox)}`, 'warn']
          : g === 'alto' ? [`Acima de ${limite}h`, 'pos'] : ['Em dia', 'ok'];
        pilula(tag[0], COLS.sit, yy + 5, 11, COR[tag[1]].tx, COR[tag[1]].s, 'right');
        y += ROW;
      });
      y += 18;
    }
  } else {
    // Resumo: um setor por linha, a situação das pessoas em barra e o total.
    // As colunas de número encostam na barra, da direita para a esquerda: com
    // menos colunas (Só negativas) não sobra buraco no meio da linha.
    const numericas = [modo !== 'neg' && 'pos', (modo === 'todas' || modo === 'neg') && 'neg', (modo === 'todas' || modo === 'vence') && 'ven']
      .filter(Boolean) as ('pos' | 'neg' | 'ven')[];
    const posCol = (k: 'pos' | 'neg' | 'ven') => 670 - (numericas.length - 1 - numericas.indexOf(k)) * 100;
    const X = { nome: PAD + 16, pos: posCol('pos'), neg: posCol('neg'), ven: posCol('ven'), barra: 700, barraW: W - PAD - 16 - 700 };
    const cols: [string, number, CanvasTextAlign][] = [];
    if (modo !== 'neg') cols.push(['POSITIVAS', X.pos, 'right']);
    if (modo === 'todas' || modo === 'neg') cols.push(['NEGATIVAS', X.neg, 'right']);
    if (modo === 'todas' || modo === 'vence') cols.push([`VENCE ${diaMes(v.prox)}`, X.ven, 'right']);
    cols.push(['SITUAÇÃO DAS PESSOAS', X.barra, 'left']);
    cabec('Setores', 'pos', plural(gs.length, 'setor', 'setores'), cols);
    const maxPos = Math.max(1, ...gs.map(s => s.bPos));
    const linha = (s: ResumoSetor | null, i: number) => {
      const RH = 58; const yy = y + RH / 2;
      const total = !s;
      const r: Pick<ResumoSetor, 'setor' | 'n' | 'bPos' | 'nPos' | 'bNeg' | 'nNeg' | 'vprox' | 'nV' | 'grupos' | 'empresa'> = s ?? gs.reduce((t, x) => {
        const g = { ...t.grupos };
        for (const [k, n] of Object.entries(x.grupos)) g[k as keyof typeof g] = (g[k as keyof typeof g] || 0) + (n || 0);
        return { ...t, n: t.n + x.n, bPos: t.bPos + x.bPos, nPos: t.nPos + x.nPos, bNeg: t.bNeg + x.bNeg, nNeg: t.nNeg + x.nNeg, vprox: t.vprox + x.vprox, nV: t.nV + x.nV, grupos: g };
      }, { setor: 'Total', n: 0, bPos: 0, nPos: 0, bNeg: 0, nNeg: 0, vprox: 0, nV: 0, grupos: {}, empresa: '' } as Pick<ResumoSetor, 'setor' | 'n' | 'bPos' | 'nPos' | 'bNeg' | 'nNeg' | 'vprox' | 'nV' | 'grupos' | 'empresa'>);
      if (total) { linhaH(y + 2, BASE.bd); caixa(PAD, y + 6, W - PAD * 2, RH - 8, 10, BASE.bg3); }
      else if (i % 2) caixa(PAD, y + 4, W - PAD * 2, RH - 8, 10, BASE.bg2);
      txt(corta(total ? `Total · ${plural(gs.length, 'setor', 'setores')}` : r.setor, 280, 14.5, 700), X.nome, yy - 1, 14.5, BASE.tx, 700);
      txt(total ? plural(r.n, 'pessoa', 'pessoas') : `${r.empresa} · ${plural(r.n, 'pessoa', 'pessoas')}`, X.nome, yy + 16, 11.5, BASE.tx3, 500);
      if (modo !== 'neg') {
        txt(horas(r.bPos), X.pos, yy - 1, 14.5, COR.pos.tx, 700, 'right', true);
        if (!total) {
          const bw = 70; const w = Math.max(2, (r.bPos / maxPos) * bw);
          caixa(X.pos - bw, yy + 9, bw, 4, 2, BASE.bd2); caixa(X.pos - w, yy + 9, w, 4, 2, COR.pos.b);
        } else txt(`média ${horas(r.nPos ? r.bPos / r.nPos : 0)}`, X.pos, yy + 16, 11, BASE.tx3, 500, 'right');
      }
      if (modo === 'todas' || modo === 'neg') {
        if (r.bNeg) pilula(horas(r.bNeg), X.neg, yy + 1, 12, '#ffffff', COR.neg.b, 'right');
        else txt('—', X.neg, yy + 1, 14, BASE.tx3, 500, 'right');
        if (r.nNeg) txt(plural(r.nNeg, 'pessoa', 'pessoas'), X.neg, yy + 18, 10.5, BASE.tx3, 500, 'right');
      }
      if (modo === 'todas' || modo === 'vence') {
        if (r.vprox) txt(horas(r.vprox), X.ven, yy - 1, 14, COR.warn.tx, 700, 'right');
        else txt('—', X.ven, yy - 1, 14, BASE.tx3, 500, 'right');
        if (r.nV) txt(plural(r.nV, 'pessoa', 'pessoas'), X.ven, yy + 16, 10.5, BASE.tx3, 500, 'right');
      }
      // barra da situação
      const tot = defs.reduce((t, d) => t + (r.grupos[d.id] || 0), 0) || 1;
      let bx = X.barra;
      c.save(); c.beginPath(); c.roundRect(X.barra, yy - 7, X.barraW, 12, 6); c.clip();
      c.fillStyle = BASE.bd2; c.fillRect(X.barra, yy - 7, X.barraW, 12);
      for (const d of defs) {
        const n = r.grupos[d.id] || 0;
        if (!n) continue;
        const w = (n / tot) * X.barraW;
        c.globalAlpha = d.forca; c.fillStyle = COR[d.tom].b; c.fillRect(bx, yy - 7, w, 12); c.globalAlpha = 1;
        bx += w;
      }
      c.restore();
      const curto: Record<string, string> = {
        dev: 'devendo', vence: 'vence', alto: `+${limite}h`, ok: 'em dia', f3: 'deve +40h', f2: 'deve 10–40h', f1: 'deve até 10h',
      };
      const resumo = defs.filter(d => r.grupos[d.id]).map(d => `${r.grupos[d.id]} ${curto[d.id]}`).join(' · ');
      txt(corta(resumo, X.barraW, 10.5, 500), X.barra, yy + 20, 10.5, BASE.tx3, 500);
      y += RH;
    };
    gs.forEach((s, i) => linha(s, i));
    if (gs.length > 1) linha(null, 0);
    // legenda
    y += 14;
    let lx = PAD;
    for (const d of defs) {
      c.globalAlpha = d.forca; caixa(lx, y + 2, 10, 10, 3, COR[d.tom].b); c.globalAlpha = 1;
      lx += 16 + txt(d.titulo, lx + 16, y + 11, 11.5, BASE.tx2, 600) + 18;
    }
    y += 24;
  }

  // ── rodapé ────────────────────────────────────────────────────────────────
  y += 6;
  linhaH(y, BASE.bd);
  txt(`Banco de Horas · gestão ${M.nome}`, PAD, y + 26, 11.5, M.cor, 700);
  txt(`Relatório do DP com saldo em ${fmtData(v.data)} · gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`,
    W - PAD, y + 26, 11.5, BASE.tx3, 500, 'right');
  const alt = Math.ceil(y + 46);
  if (alt < H) {
    const c2 = document.createElement('canvas');
    c2.width = W * ESC; c2.height = alt * ESC;
    c2.getContext('2d')?.drawImage(cv, 0, 0);
    return c2;
  }
  return cv;
}

export const nomeDaImagem = (setor: string, modo: ModoImagem, dataSaldo: string) =>
  `Banco de horas - ${(setor || 'todos os setores').replace(/[\\/:*?"<>|]/g, '-')}`
  + `${modo !== 'todas' ? ` - ${MODOS_IMAGEM.find(m => m.id === modo)?.titulo.toLowerCase()}` : ''}`
  + ` - ${dataSaldo.split('-').reverse().join('-')}.png`;
