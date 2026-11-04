/**
 * derry.ts — o palco da Coisa: uma rua de Derry à noite, em 320 × 180 (o CSS
 * amplia sem borrar), desenhada uma vez só.
 *
 * As referências que todo mundo reconhece: a placa «Bem-vindos a Derry», a
 * caixa d'água no alto da cidade, as casas de madeira de 1962, o poste
 * amarelo, a chuva, o bueiro do meio-fio — com dois olhos amarelos lá
 * dentro — e o barquinho de papel parado perto dele.
 *
 * O que mexe (a chuva, os olhos, o poste piscando) a cena pinta por cima a
 * cada quadro; aqui só as posições.
 */
import { BARCO, PALETA_DO_BARCO, escrever, type Paleta } from './arte';
import { sorteador } from '../acaso';

export const PALCO_L = 320;
export const PALCO_A = 180;

/** O meio-fio, a rua e o bueiro. */
export const CALCADA_Y = 122;
export const MEIO_FIO_Y = 128;
export const RUA_Y = 132;
export const BUEIRO = { x: 146, y: 128, l: 28, a: 4 } as const;
/** Os dois olhos dentro do bueiro. */
export const OLHOS_DO_BUEIRO: readonly (readonly [number, number])[] = [[155, 130], [164, 130]];
/** Onde a Coisa pisa (o pé dela). */
export const CHAO_DA_COISA = 172;
export const POSTE = { x: 274, luz: 66 } as const;

function retangulo(c: CanvasRenderingContext2D, cor: string, x: number, y: number, l: number, a: number) {
  c.fillStyle = cor;
  c.fillRect(x, y, l, a);
}

/** Pinta uma grade de letras com a paleta (o «.» fica vazio). */
export function pintarGrade(c: CanvasRenderingContext2D, linhas: readonly string[], paleta: Paleta, x0: number, y0: number) {
  linhas.forEach((linha, y) => {
    for (let x = 0; x < linha.length; x++) {
      const cor = paleta[linha[x]];
      if (cor) retangulo(c, cor, x0 + x, y0 + y, 1, 1);
    }
  });
}

/** Faixas do céu com o pontilhado entre uma e outra (sem degradê liso). */
function ceu(c: CanvasRenderingContext2D) {
  const faixas = ['#05070a', '#080b10', '#0b1016', '#0f151c', '#131b22', '#182128'];
  const alto = CALCADA_Y / faixas.length;
  faixas.forEach((cor, i) => retangulo(c, cor, 0, Math.floor(i * alto), PALCO_L, Math.ceil(alto) + 1));
  for (let i = 1; i < faixas.length; i++) {
    const y0 = Math.floor(i * alto);
    c.fillStyle = faixas[i];
    for (let y = y0 - 3; y < y0; y++) for (let x = (y % 2); x < PALCO_L; x += 2) c.fillRect(x, y, 1, 1);
  }
}

function lua(c: CanvasRenderingContext2D) {
  const cx = 248, cy = 30, r = 12;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d > r) continue;
      c.fillStyle = d > r - 1.2 ? '#9fa392' : (x + y > 6 ? '#b9bca8' : '#d8dac6');
      c.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  // As crateras e as nuvens passando na frente.
  retangulo(c, '#a7ab98', cx - 5, cy - 3, 3, 2);
  retangulo(c, '#a7ab98', cx + 3, cy + 4, 2, 2);
  for (const [x, y, l] of [[222, 34, 44], [232, 37, 38], [256, 24, 30], [214, 40, 26]] as const) {
    retangulo(c, '#10161c', x, y, l, 2);
    retangulo(c, '#151d24', x + 4, y + 2, l - 8, 1);
  }
}

/** A caixa d'água no alto, à esquerda: o cilindro, o teto de cone, a passarela. */
function caixaDagua(c: CanvasRenderingContext2D) {
  const x = 30, topo = 50, l = 24;
  const cor = '#0c1216', borda = '#16222a';
  retangulo(c, cor, x, topo + 8, l, CALCADA_Y - topo - 8);
  for (let i = 0; i < 8; i++) retangulo(c, cor, x + 4 + i, topo + 8 - i, l - 8 - i * 2 > 0 ? l - 8 - i * 2 : 1, 1);
  retangulo(c, borda, x - 2, topo + 20, l + 4, 1);
  retangulo(c, borda, x, topo + 9, 1, CALCADA_Y - topo - 9);
  for (let y = topo + 24; y < CALCADA_Y; y += 7) retangulo(c, '#10181d', x + 1, y, l - 2, 1);
  // A luz vermelha do alto.
  retangulo(c, '#7a1010', x + l / 2, topo - 1, 1, 1);
}

function casas(c: CanvasRenderingContext2D) {
  const acaso = sorteador(1962);
  const cor = '#0a0f12', telhado = '#0d1317';
  let x = -6;
  while (x < PALCO_L) {
    const l = 26 + Math.floor(acaso() * 22);
    const a = 16 + Math.floor(acaso() * 18);
    const base = CALCADA_Y;
    if (x > 96 && x < 214 && acaso() < 0.5) { x += l + 4; continue; } // abre o meio para a Coisa
    retangulo(c, cor, x, base - a, l, a);
    const meio = Math.floor(l / 2);
    for (let i = 0; i <= meio; i++) retangulo(c, telhado, x + i, base - a - Math.floor(i * 0.6), l - i * 2 > 0 ? l - i * 2 : 1, 1);
    if (acaso() < 0.5) retangulo(c, telhado, x + 4, base - a - 9, 3, 8);
    // Janelas: poucas acesas, um amarelo velho.
    for (let wy = base - a + 4; wy < base - 5; wy += 8) {
      for (let wx = x + 4; wx < x + l - 5; wx += 8) {
        const acesa = acaso() < 0.22;
        retangulo(c, acesa ? '#c8963e' : '#121a1f', wx, wy, 3, 4);
        if (acesa) retangulo(c, '#8a6427', wx, wy + 3, 3, 1);
      }
    }
    x += l + 2 + Math.floor(acaso() * 6);
  }
  // A torre da igreja, à direita.
  retangulo(c, cor, 214, 74, 12, CALCADA_Y - 74);
  for (let i = 0; i < 12; i++) retangulo(c, telhado, 214 + Math.floor(i / 2), 74 - i, 12 - (Math.floor(i / 2) * 2), 1);
  retangulo(c, telhado, 219, 56, 2, 8);
  retangulo(c, telhado, 217, 59, 6, 1);
}

/** A placa da entrada da cidade, de madeira, nos dois postes. */
function placa(c: CanvasRenderingContext2D) {
  const x = 66, y = 96, l = 46, a = 17;
  retangulo(c, '#1e1409', x + 5, y + a, 2, CALCADA_Y - y - a);
  retangulo(c, '#1e1409', x + l - 7, y + a, 2, CALCADA_Y - y - a);
  retangulo(c, '#24170b', x - 1, y - 1, l + 2, a + 2);
  retangulo(c, '#5a3a1d', x, y, l, a);
  retangulo(c, '#6e4826', x, y, l, 1);
  retangulo(c, '#3f2812', x, y + a - 1, l, 1);
  c.fillStyle = '#e9dcb2';
  const linha1 = 'BEM-VINDOS', linha2 = 'A DERRY';
  escrever(linha1, x + Math.floor((l - (linha1.length * 4 - 1)) / 2), y + 2, (px, py) => c.fillRect(px, py, 1, 1));
  escrever(linha2, x + Math.floor((l - (linha2.length * 4 - 1)) / 2), y + 9, (px, py) => c.fillRect(px, py, 1, 1));
}

function rua(c: CanvasRenderingContext2D) {
  retangulo(c, '#2b3032', 0, CALCADA_Y, PALCO_L, MEIO_FIO_Y - CALCADA_Y);
  retangulo(c, '#3a4042', 0, CALCADA_Y, PALCO_L, 1);
  for (let x = 12; x < PALCO_L; x += 24) retangulo(c, '#22272a', x, CALCADA_Y + 1, 1, MEIO_FIO_Y - CALCADA_Y - 1);
  retangulo(c, '#4a5153', 0, MEIO_FIO_Y, PALCO_L, 1);
  retangulo(c, '#1d2123', 0, MEIO_FIO_Y + 1, PALCO_L, RUA_Y - MEIO_FIO_Y - 1);
  retangulo(c, '#121517', 0, RUA_Y, PALCO_L, PALCO_A - RUA_Y);
  // Asfalto molhado: listras de reflexo e a faixa amarela apagada no meio.
  const acaso = sorteador(27);
  for (let i = 0; i < 90; i++) {
    const y = RUA_Y + 2 + Math.floor(acaso() * (PALCO_A - RUA_Y - 2));
    retangulo(c, acaso() < 0.5 ? '#171b1d' : '#1b2023', Math.floor(acaso() * PALCO_L), y, 3 + Math.floor(acaso() * 14), 1);
  }
  for (let x = 4; x < PALCO_L; x += 22) retangulo(c, '#5a4c22', x, 158, 11, 1);
  // O bueiro do meio-fio: a boca escura e a beirada.
  const b = BUEIRO;
  retangulo(c, '#5b6365', b.x - 2, b.y - 1, b.l + 4, 1);
  retangulo(c, '#020203', b.x, b.y, b.l, b.a);
  retangulo(c, '#0a0b0c', b.x, b.y + b.a - 1, b.l, 1);
  // Uma poça embaixo do poste, que pega a luz.
  retangulo(c, '#2a2a1f', POSTE.x - 16, 146, 34, 1);
  retangulo(c, '#3a3726', POSTE.x - 10, 147, 22, 1);
}

function poste(c: CanvasRenderingContext2D) {
  const x = POSTE.x;
  retangulo(c, '#161b1e', x, POSTE.luz, 2, CALCADA_Y + 4 - POSTE.luz);
  retangulo(c, '#161b1e', x - 6, POSTE.luz, 8, 2);
  retangulo(c, '#20272b', x - 8, POSTE.luz + 2, 6, 2);
  // O cone de luz em pontilhado: mais denso perto da lâmpada.
  for (let y = POSTE.luz + 4; y < 150; y++) {
    const k = (y - POSTE.luz) / (150 - POSTE.luz);
    const meia = 3 + k * 26;
    const passo = k < 0.35 ? 2 : k < 0.7 ? 3 : 4;
    c.fillStyle = 'rgba(255, 214, 128, 0.16)';
    for (let px = Math.floor(x - 5 - meia); px < x - 5 + meia; px++) if ((px + y) % passo === 0) c.fillRect(px, y, 1, 1);
  }
}

/** O palco parado inteiro, num canvas de 320 × 180. */
export function desenharDerry(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = PALCO_L;
  cv.height = PALCO_A;
  const c = cv.getContext('2d')!;
  ceu(c);
  lua(c);
  caixaDagua(c);
  casas(c);
  placa(c);
  rua(c);
  poste(c);
  pintarGrade(c, BARCO, PALETA_DO_BARCO, BUEIRO.x - 18, RUA_Y - 3);
  return cv;
}

/** A lâmpada do poste (a cena pinta acesa ou piscando). */
export function lampada(c: CanvasRenderingContext2D, acesa: boolean) {
  c.fillStyle = acesa ? '#ffe3a0' : '#4a4232';
  c.fillRect(POSTE.x - 8, POSTE.luz + 4, 6, 1);
}

/** Quanto o teto da toca desce sobre o palco. */
export const COVIL_A = 78;

/**
 * O teto da toca dela (as fotos da caverna, 28/10/2026): as estalactites
 * pendendo do alto, escuras, com a borda de baixo pegando a luz do fogo, e
 * os fios que escorrem das pontas. Desce sobre a rua quando ela dança.
 */
export function desenharCovil(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = PALCO_L;
  cv.height = COVIL_A;
  const c = cv.getContext('2d')!;
  const acaso = sorteador(1990);
  retangulo(c, '#0c0605', 0, 0, PALCO_L, 8);
  for (let x = 0; x < PALCO_L; x++) if (acaso() < 0.6) retangulo(c, '#0c0605', x, 8, 1, 1 + Math.floor(acaso() * 4));
  let x = -4;
  while (x < PALCO_L) {
    const l = 5 + Math.floor(acaso() * 14);
    // Mais compridas nos cantos, curtas no meio (o holofote fica livre).
    const canto = Math.abs(x + l / 2 - PALCO_L / 2) / (PALCO_L / 2);
    const a = Math.round(12 + acaso() * 22 + canto * canto * 40);
    for (let y = 0; y < a; y++) {
      const k = y / a;
      const meia = (l / 2) * (1 - k) ** 1.3;
      const cx = x + l / 2 + Math.sin(y * 0.3 + x) * 0.6;
      const de = Math.round(cx - meia), ate = Math.round(cx + meia);
      if (ate < de) continue;
      retangulo(c, '#140907', de, y, ate - de + 1, 1);
      // A luz de baixo: a borda da direita e a ponta.
      retangulo(c, k > 0.55 ? '#6b2a10' : '#3a170b', ate, y, 1, 1);
    }
    retangulo(c, '#a8451a', Math.round(x + l / 2), a - 1, 1, 1);
    if (acaso() < 0.35) retangulo(c, '#4a1d0c', Math.round(x + l / 2), a, 1, 2 + Math.floor(acaso() * 5));
    x += l - 1 + Math.floor(acaso() * 5);
  }
  return cv;
}
