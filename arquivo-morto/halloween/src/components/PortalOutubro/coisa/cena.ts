/**
 * cena.ts — a Coisa no palco de Derry (`derry.ts`): uma cena, sem luta
 * (pedido de 27/10/2026: «não terá luta de boss, terá uma animação dele
 * dançando, ficando parado babando, a cena clássica, e depois puxando o
 * mural»). Desde 28/10 ela vem ANTES do mural, e a dança acontece na toca
 * dela (as fotos da caverna). Um canvas de 320 × 180; o React (`ACoisa.tsx`)
 * cuida do sangue na tela, da câmera, do close no rosto e do mural.
 *
 *   espera     a chuva e os olhos no bueiro (a tela do Gestão desmanchando
 *              por cima)
 *   subindo    um balão vermelho sai do bueiro e sobe
 *   enchendo   ele treme e enche
 *   nascendo   estoura: o sangue espirra, e as gotas sobem do chão e do
 *              bueiro montando a Coisa, dos pés para a cabeça
 *   dancando   o teto da toca desce sobre a rua, a luz vira fogo, as brasas
 *              sobem, e ela dança — os braços jogados de um lado para o
 *              outro, o corpo indo e vindo com o rastro borrado atrás
 *   babando    ela para, de boca aberta, e a baba escorre (a câmera chega)
 *   perto      o close: o rosto dela de perto (`cabecona.ts`, no React)
 *   fim        ela sai do palco (`sair`) e quem puxa o mural é o desenho
 *              dela por cima da tela (`Puxando.tsx`)
 */
import { sorteador } from '../acaso';
import { pintarPor } from '../cinzas';
import { ALTURA_DA_COISA, BALAO, LARGURA_DA_COISA, PALETA_DA_COISA, PALETA_DO_BALAO } from './arte';
import { BABANDO, CANTOS_DA_BOCA, DANCA, QUADROS } from './desenho';
import { DURA_DA_DANCA, FIM_DA_APRESENTACAO } from './trilha';
import { BUEIRO, CHAO_DA_COISA, COVIL_A, OLHOS_DO_BUEIRO, PALCO_A, PALCO_L, RUA_Y, desenharCovil, desenharDerry, lampada, pintarGrade } from './derry';

export type FaseDaCena = 'espera' | 'subindo' | 'enchendo' | 'nascendo' | 'dancando' | 'babando' | 'perto' | 'fim';

export interface AvisosDaCena {
  fase(f: FaseDaCena): void;
  /** O balão grande estourou (o clarão vermelho e o sangue na tela). */
  estouro(): void;
}

/** Cada pixel da Coisa vale 2 × 2 no palco. */
export const ESCALA = 2;
const L = LARGURA_DA_COISA, A = ALTURA_DA_COISA;
/** O canto de cima à esquerda dela no palco, parada. */
export const BASE_X = PALCO_L / 2 - (L * ESCALA) / 2;
export const BASE_Y = CHAO_DA_COISA - A * ESCALA;
/** Onde fica o rosto no palco (a câmera chega nele quando ela baba). */
export const ROSTO: readonly [number, number] = [BASE_X + (L * ESCALA) / 2, BASE_Y + 20 * ESCALA];

const PASSO_DA_DANCA = 0.15;
/** O close inteiro (`ACoisa.tsx`): ela encarando, a boca abrindo e as luzes mortas. */
export const DURA_DO_CLOSE = 8.6;
/**
 * Os tempos casam com a trilha (`trilha.ts`, 29/10/2026): do balão sair do
 * bueiro até ela dançar são uns 7,8 s (subindo + enchendo + nascendo, ~2,7),
 * e ela espera nascida até `FIM_DA_APRESENTACAO` (o «palhaço dançarino»
 * inteiro) para a música da dança não cortar a fala; a dança dura
 * `DURA_DA_DANCA` (7 s desde 29/10: o trecho inteiro, de 13,7 s, era
 * comprido demais); babando e encarando, o «we'll float down here».
 */
const DURA: Readonly<Partial<Record<FaseDaCena, number>>> = { subindo: 3, enchendo: 2.1, dancando: DURA_DA_DANCA, babando: 1.8, perto: DURA_DO_CLOSE };
/** O quanto o corpo vai e vem na dança, e quantos rastros ficam atrás. */
const VAI_E_VEM = 5;
const RASTROS = 3;
/** Quanto o teto da toca leva para descer. */
const DESCE_O_COVIL = 0.9;

function rgb(hex: string): number { return parseInt(hex.slice(1), 16); }

function mistura(a: number, b: number, k: number): number {
  const m = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

interface Gota { x: number; y: number; vy: number }
interface Brasa { x: number; y: number; vy: number; vida: number }

export class CenaDaCoisa {
  fase: FaseDaCena = 'espera';
  /** Ela saiu do palco: a toca fica vazia. */
  private saiu = false;

  private readonly c: CanvasRenderingContext2D;
  private readonly fundo = desenharDerry();
  private readonly acaso = sorteador(27);
  private t = 0;
  private tFase = 0;
  private tremor = 0;
  /** Quando o balão saiu do bueiro (e a apresentação começou a tocar). */
  private tBalao = 0;

  private readonly letras: string[][] = QUADROS.map(q => q.linhas.join('').split(''));
  private quadro = 0;
  private readonly nasceu = new Uint8Array(L * A);
  private readonly imgCoisa = new ImageData(L, A);
  private readonly cvCoisa = document.createElement('canvas');
  private by = BASE_Y;
  private bx = BASE_X;
  /** Os quadros prontos (o rastro da dança) e por onde ela passou. */
  private readonly cvQuadros: HTMLCanvasElement[];
  private rastro: { quadro: number; x: number; y: number }[] = [];
  private readonly covil = desenharCovil();
  private tCovil = -1;
  private brasas: Brasa[] = [];

  // O sangue, a Coisa nascendo, a baba.
  private readonly sangue: { x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; chao: Float32Array; n: number };
  private readonly nascer: { de: Float32Array; ate: Uint16Array; atraso: Float32Array; n: number };
  private grande: { x: number; y: number; esc: number } | null = null;
  private readonly baba = [0, 0];
  private gotas: Gota[] = [];

  private readonly fx = new ImageData(PALCO_L, PALCO_A);
  private readonly cvFx = document.createElement('canvas');
  private readonly poca = new ImageData(PALCO_L, PALCO_A);
  private readonly cvPoca = document.createElement('canvas');
  private pocaMudou = false;
  private readonly cvBalao = document.createElement('canvas');
  private readonly chuva: Float32Array;

  constructor(canvas: HTMLCanvasElement, private readonly avisos: AvisosDaCena, private readonly leve: boolean) {
    canvas.width = PALCO_L;
    canvas.height = PALCO_A;
    this.c = canvas.getContext('2d')!;
    this.c.imageSmoothingEnabled = false;
    this.cvCoisa.width = L;
    this.cvCoisa.height = A;
    const pixels = this.letras[0].filter(ch => ch !== '.').length;
    const cap = leve ? 600 : 2200;
    this.sangue = { x: new Float32Array(cap), y: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap), chao: new Float32Array(cap), n: 0 };
    this.nascer = { de: new Float32Array(pixels * 2), ate: new Uint16Array(pixels), atraso: new Float32Array(pixels), n: 0 };
    this.cvFx.width = PALCO_L; this.cvFx.height = PALCO_A;
    this.cvPoca.width = PALCO_L; this.cvPoca.height = PALCO_A;
    this.cvBalao.width = 12; this.cvBalao.height = 15;
    pintarGrade(this.cvBalao.getContext('2d')!, BALAO, PALETA_DO_BALAO, 0, 0);
    this.cvQuadros = QUADROS.map(q => {
      const cv = document.createElement('canvas');
      cv.width = L; cv.height = A;
      pintarGrade(cv.getContext('2d')!, q.linhas, PALETA_DA_COISA, 0, 0);
      return cv;
    });

    const gotas = leve ? 50 : 150;
    this.chuva = new Float32Array(gotas * 3);
    for (let i = 0; i < gotas; i++) {
      this.chuva[i * 3] = this.acaso() * (PALCO_L + 60);
      this.chuva[i * 3 + 1] = this.acaso() * PALCO_A;
      this.chuva[i * 3 + 2] = 150 + this.acaso() * 90;
    }
  }

  private mudar(f: FaseDaCena) {
    this.fase = f;
    this.tFase = 0;
    this.avisos.fase(f);
  }

  /** O mural acabou de desmanchar: o balão sai do bueiro. */
  comecarBalao(): void {
    if (this.fase !== 'espera') return;
    this.grande = { x: BUEIRO.x + BUEIRO.l / 2, y: BUEIRO.y + 2, esc: 1 };
    this.tBalao = this.t;
    this.mudar('subindo');
  }

  /** Ela sai do palco (o desenho por cima da tela toma o lugar dela). */
  sair(): void {
    this.saiu = true;
    this.gotas = [];
    this.rastro = [];
  }

  /** Espirra sangue de um ponto: as gotas caem e mancham o chão. */
  private respingar(x: number, y: number, n: number, forca: number) {
    const s = this.sangue;
    for (let k = 0; k < n && s.n < s.x.length; k++) {
      const i = s.n++;
      const ang = this.acaso() * Math.PI * 2;
      const v = forca * (0.3 + this.acaso() * 0.9);
      s.x[i] = x; s.y[i] = y;
      s.vx[i] = Math.cos(ang) * v;
      s.vy[i] = Math.sin(ang) * v - forca * 0.35;
      s.chao[i] = RUA_Y + 6 + this.acaso() * (PALCO_A - RUA_Y - 8);
    }
  }

  private estourarGrande() {
    const g = this.grande!;
    this.respingar(g.x, g.y, this.leve ? 280 : 900, 190);
    this.grande = null;
    this.tremor = 0.5;
    this.avisos.estouro();
    // As gotas que vão montar a Coisa: saem do bueiro e da poça, dos pés para a cabeça.
    const nc = this.nascer;
    nc.n = 0;
    for (let i = 0; i < L * A; i++) {
      if (this.letras[0][i] === '.') continue;
      const k = nc.n++;
      nc.de[k * 2] = BUEIRO.x + this.acaso() * BUEIRO.l + (this.acaso() - 0.5) * 50;
      nc.de[k * 2 + 1] = BUEIRO.y + 2 + this.acaso() * 30;
      nc.ate[k] = i;
      nc.atraso[k] = 0.35 + (1 - Math.floor(i / L) / A) * 1.25 + this.acaso() * 0.45;
    }
    this.mudar('nascendo');
  }

  /** Anda `dt` segundos e pinta o quadro. */
  passo(dt: number): void {
    this.t += dt;
    this.tFase += dt;
    this.tremor = Math.max(0, this.tremor - dt);
    const acabou = (f: FaseDaCena) => this.tFase >= (DURA[f] ?? Infinity);

    switch (this.fase) {
      case 'subindo': {
        const g = this.grande!;
        const k = Math.min(1, this.tFase / DURA.subindo!);
        g.y = BUEIRO.y + 2 - (BUEIRO.y - 74) * (1 - (1 - k) * (1 - k));
        g.x = BUEIRO.x + BUEIRO.l / 2 + Math.sin(this.t * 2.4) * 5 * k;
        g.esc = 1 + k;
        if (k >= 1) this.mudar('enchendo');
        break;
      }
      case 'enchendo': {
        const g = this.grande!;
        const k = Math.min(1, this.tFase / DURA.enchendo!);
        g.esc = 2 + Math.floor(k * 4) * 0.75 + Math.sin(this.t * 40) * 0.08;
        g.x = PALCO_L / 2 + Math.sin(this.t * 2.4) * 5 + (this.acaso() - 0.5) * k * 3;
        if (k >= 1) this.estourarGrande();
        break;
      }
      case 'nascendo': {
        const nc = this.nascer;
        let faltam = 0;
        for (let k = 0; k < nc.n; k++) {
          const i = nc.ate[k];
          if (!this.nasceu[i] && this.tFase >= nc.atraso[k] + 0.7) this.nasceu[i] = 1;
          if (!this.nasceu[i]) faltam++;
        }
        // Nascida, espera parada a apresentação acabar de dizer «dançarino»:
        // a música da dança não corta a fala.
        if (faltam === 0 && this.t - this.tBalao >= FIM_DA_APRESENTACAO) {
          this.nasceu.fill(1); this.tremor = 0.8; this.tCovil = 0; this.mudar('dancando');
        }
        break;
      }
      case 'dancando': {
        const antes = this.quadro;
        this.quadro = DANCA[Math.floor(this.t / PASSO_DA_DANCA) % DANCA.length];
        this.by = BASE_Y - Math.abs(Math.sin(this.t * 10)) * 3;
        this.bx = BASE_X + Math.round(Math.sin(this.tFase * 4.2) * VAI_E_VEM * Math.min(1, this.tFase));
        // O rastro: onde ela estava, a cada passo da dança.
        if (antes !== this.quadro) {
          this.rastro.unshift({ quadro: antes, x: this.bx, y: this.by });
          this.rastro.length = Math.min(this.rastro.length, RASTROS);
        }
        if (acabou('dancando')) { this.quadro = BABANDO; this.by = BASE_Y; this.bx = BASE_X; this.rastro = []; this.mudar('babando'); }
        break;
      }
      case 'babando':
        this.babar(dt);
        if (acabou('babando')) this.mudar('perto');
        break;
      case 'perto':
        this.babar(dt);
        if (acabou('perto')) this.mudar('fim');
        break;
      case 'fim':
        if (!this.saiu) this.babar(dt);
        break;
    }
    if (this.tCovil >= 0) { this.tCovil += dt; this.andarBrasas(dt); }

    this.andarSangue(dt);
    this.andarChuva(dt);
    this.desenhar();
  }

  /** A baba: um fio que estica de cada canto da boca até pingar, e recomeça. */
  private babar(dt: number) {
    for (let k = 0; k < this.baba.length; k++) {
      this.baba[k] += dt * (k ? 7 : 9);
      if (this.baba[k] > 18 + k * 6) {
        const [cx, cy] = CANTOS_DA_BOCA[k];
        this.gotas.push({ x: this.bx + cx * ESCALA, y: this.by + cy * ESCALA + this.baba[k], vy: 20 });
        this.baba[k] = 4;
      }
    }
    for (const g of this.gotas) { g.vy += 300 * dt; g.y += g.vy * dt; }
    this.gotas = this.gotas.filter(g => g.y < CHAO_DA_COISA + 4);
  }

  private andarSangue(dt: number) {
    const s = this.sangue;
    let i = 0;
    while (i < s.n) {
      s.vy[i] += 300 * dt;
      s.x[i] += s.vx[i] * dt;
      s.y[i] += s.vy[i] * dt;
      if (s.y[i] >= s.chao[i] || s.x[i] < -4 || s.x[i] > PALCO_L + 4) {
        if (s.y[i] >= s.chao[i]) this.mancharChao(s.x[i] | 0, s.chao[i] | 0);
        const u = --s.n;
        s.x[i] = s.x[u]; s.y[i] = s.y[u]; s.vx[i] = s.vx[u]; s.vy[i] = s.vy[u]; s.chao[i] = s.chao[u];
        continue;
      }
      i++;
    }
  }

  private mancharChao(x: number, y: number) {
    const l = 1 + Math.floor(this.acaso() * 3);
    for (let k = 0; k < l; k++) {
      const px = x + k - 1;
      if (px < 0 || px >= PALCO_L || y < 0 || y >= PALCO_A) continue;
      const o = (y * PALCO_L + px) * 4;
      const escuro = this.poca.data[o + 3] > 0;
      this.poca.data[o] = escuro ? 74 : 110; this.poca.data[o + 1] = 6; this.poca.data[o + 2] = escuro ? 12 : 18; this.poca.data[o + 3] = 235;
    }
    this.pocaMudou = true;
  }

  /** As brasas do fogo da toca, subindo do chão e piscando. */
  private andarBrasas(dt: number) {
    const max = this.leve ? 14 : 46;
    while (this.brasas.length < max && this.acaso() < dt * 30) {
      this.brasas.push({ x: this.acaso() * PALCO_L, y: PALCO_A - this.acaso() * 12, vy: -(10 + this.acaso() * 22), vida: 2 + this.acaso() * 3 });
    }
    for (const b of this.brasas) { b.y += b.vy * dt; b.x += Math.sin(b.y * 0.12 + b.vida) * 6 * dt; b.vida -= dt; }
    this.brasas = this.brasas.filter(b => b.vida > 0 && b.y > 0);
  }

  private andarChuva(dt: number) {
    const ch = this.chuva;
    for (let i = 0; i < ch.length; i += 3) {
      ch[i] -= ch[i + 2] * 0.25 * dt;
      ch[i + 1] += ch[i + 2] * dt;
      if (ch[i + 1] > PALCO_A) { ch[i + 1] = -4; ch[i] = this.acaso() * (PALCO_L + 60); }
    }
  }

  // ── Pintar ────────────────────────────────────────────────────────────────

  private get naCena(): boolean {
    if (this.saiu) return false;
    return this.fase === 'nascendo' || this.fase === 'dancando' || this.fase === 'babando' || this.fase === 'perto' || this.fase === 'fim';
  }

  private desenhar() {
    const c = this.c;
    const tx = this.tremor > 0 ? Math.round((this.acaso() - 0.5) * 4 * Math.min(1, this.tremor * 3)) : 0;
    const ty = this.tremor > 0 ? Math.round((this.acaso() - 0.5) * 3 * Math.min(1, this.tremor * 3)) : 0;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, PALCO_L, PALCO_A);
    c.setTransform(1, 0, 0, 1, tx, ty);
    c.drawImage(this.fundo, 0, 0);
    // O poste pisca quando ela baba.
    lampada(c, !(this.fase === 'babando' && Math.sin(this.t * 23) > 0.5));

    // Os olhos no bueiro, piscando, até ela sair.
    if (!this.naCena && (this.t % 3.4) > 0.25) {
      c.fillStyle = '#ffd23a';
      for (const [x, y] of OLHOS_DO_BUEIRO) c.fillRect(x, y, 2, 1);
    }

    if (this.pocaMudou) { this.cvPoca.getContext('2d')!.putImageData(this.poca, 0, 0); this.pocaMudou = false; }
    c.drawImage(this.cvPoca, 0, 0);

    // A dança e a baba: a rua vira a toca dela, com o fogo.
    if (this.tCovil >= 0) this.toca(c);

    const fx = this.fx.data;
    fx.fill(0);
    if (this.naCena) this.desenharCoisa();
    if (this.fase === 'nascendo') this.desenharNascendo(fx);
    if (this.grande) this.desenharBalao(this.grande.x, this.grande.y, this.grande.esc);

    const s = this.sangue;
    for (let i = 0; i < s.n; i++) {
      const px = s.x[i] | 0, py = s.y[i] | 0;
      if (px < 0 || py < 0 || px >= PALCO_L || py >= PALCO_A) continue;
      pintarPor(fx, (py * PALCO_L + px) * 4, i % 3 ? 176 : 118, 12, 22, 1);
    }
    this.cvFx.getContext('2d')!.putImageData(this.fx, 0, 0);
    c.drawImage(this.cvFx, 0, 0);
    if ((this.fase === 'babando' || this.fase === 'perto' || this.fase === 'fim') && !this.saiu) this.desenharBaba(c);

    // As brasas, e o teto da toca descendo.
    if (this.tCovil >= 0) {
      for (const b of this.brasas) {
        c.fillStyle = b.vida < 0.6 || (b.vida * 7) % 1 < 0.2 ? '#a8401a' : (b.vida * 3) % 1 < 0.5 ? '#ffb43a' : '#ff6a10';
        c.fillRect(b.x | 0, b.y | 0, 1, 1);
      }
      const k = Math.min(1, this.tCovil / DESCE_O_COVIL);
      c.drawImage(this.covil, 0, Math.round(-COVIL_A * (1 - k) ** 2));
    }

    // A chuva por cima de tudo (na toca ela some).
    c.fillStyle = `rgba(150, 178, 196, ${this.tCovil >= 0 ? Math.max(0, 0.42 - this.tCovil * 0.3) : 0.42})`;
    const ch = this.chuva;
    for (let i = 0; i < ch.length; i += 3) {
      const x = ch[i] | 0, y = ch[i + 1] | 0;
      c.fillRect(x, y, 1, 1);
      c.fillRect(x - 1, y + 1, 1, 1);
      c.fillRect(x - 1, y + 2, 1, 1);
    }
  }

  /**
   * A toca: a rua escurece, a luz de fogo vem de baixo (o chão em brasa e o
   * círculo laranja onde ela pisa) e um cone quente desce nela.
   */
  private toca(c: CanvasRenderingContext2D) {
    const k = Math.min(1, this.tCovil / DESCE_O_COVIL);
    c.fillStyle = `rgba(6, 2, 1, ${0.62 * k})`;
    c.fillRect(0, 0, PALCO_L, PALCO_A);
    // O fogo de baixo: faixas que esquentam perto do chão, pontilhadas entre si.
    const faixas = ['rgba(120, 30, 8, 0.10)', 'rgba(170, 52, 12, 0.14)', 'rgba(220, 90, 20, 0.16)'];
    faixas.forEach((cor, i) => {
      c.fillStyle = cor;
      const y0 = PALCO_A - 70 + i * 22;
      for (let y = y0; y < PALCO_A; y++) for (let x = (y + i) % 2; x < PALCO_L; x += y < y0 + 3 ? 2 : 1) c.fillRect(x, y, 1, 1);
    });
    const cx = Math.round(this.bx + (L * ESCALA) / 2);
    const tremula = 0.85 + Math.sin(this.t * 17) * 0.08 + Math.sin(this.t * 5.3) * 0.07;
    c.fillStyle = `rgba(255, 170, 90, ${0.12 * k * tremula})`;
    for (let y = 0; y < CHAO_DA_COISA; y++) {
      const meia = 10 + (y / CHAO_DA_COISA) * 52;
      for (let x = Math.round(cx - meia) + (y % 2); x < cx + meia; x += 2) c.fillRect(x, y, 1, 1);
    }
    c.fillStyle = `rgba(255, 120, 40, ${0.3 * k * tremula})`;
    for (let dy = -4; dy <= 4; dy++) {
      const meia = Math.sqrt(1 - (dy / 5) ** 2) * 62;
      c.fillRect(Math.round(cx - meia), CHAO_DA_COISA + dy - 1, Math.round(meia * 2), 1);
    }
  }

  private desenharCoisa() {
    const d = this.imgCoisa.data;
    const nascendo = this.fase === 'nascendo';
    const letras = this.letras[this.quadro];
    // Babando, os olhos acendem devagar (as luzes mortas).
    const brilho = this.fase === 'fim' || this.fase === 'perto' ? 1 : this.fase === 'babando' ? Math.min(1, this.tFase / 1.4) : 0;
    for (let i = 0; i < L * A; i++) {
      const o = i * 4;
      const ch = letras[i];
      if (ch === '.' || (nascendo && !this.nasceu[i])) { d[o + 3] = 0; continue; }
      let cor = rgb(PALETA_DA_COISA[ch] ?? '#000000');
      if (brilho > 0 && (ch === 'y' || ch === 'Y')) cor = mistura(cor, 0xffb43a, brilho);
      d[o] = (cor >> 16) & 255; d[o + 1] = (cor >> 8) & 255; d[o + 2] = cor & 255; d[o + 3] = 255;
    }
    this.cvCoisa.getContext('2d')!.putImageData(this.imgCoisa, 0, 0);
    const c = this.c;
    const x = Math.round(this.bx), y = Math.round(this.by);
    c.fillStyle = 'rgba(0, 0, 0, 0.45)';
    c.fillRect(x + 10, CHAO_DA_COISA - 1, L * ESCALA - 20, 2);
    // O rastro borrado da dança (a foto dela correndo na toca), em vermelho.
    if (this.rastro.length) {
      c.filter = 'sepia(1) saturate(4) hue-rotate(-25deg) brightness(0.8)';
      this.rastro.forEach((r, i) => {
        c.globalAlpha = 0.34 - i * 0.1;
        c.drawImage(this.cvQuadros[r.quadro], Math.round(r.x), Math.round(r.y), L * ESCALA, A * ESCALA);
      });
      c.globalAlpha = 1;
      c.filter = 'none';
    }
    c.drawImage(this.cvCoisa, x, y, L * ESCALA, A * ESCALA);
    if (brilho > 0) {
      c.fillStyle = `rgba(255, 170, 60, ${0.22 * brilho})`;
      c.fillRect(x + 26, y + 26, L * ESCALA - 52, 10);
    }
  }

  private desenharBaba(c: CanvasRenderingContext2D) {
    c.fillStyle = 'rgba(214, 232, 222, 0.85)';
    CANTOS_DA_BOCA.forEach(([cx, cy], k) => {
      const x = this.bx + cx * ESCALA + (k ? 1 : 0), y0 = this.by + cy * ESCALA;
      const comp = Math.round(this.baba[k]);
      c.fillRect(x, y0, 1, comp);
      c.fillRect(x - 1, y0 + comp - 1, 3, 2); // a gota pendurada na ponta
    });
    for (const g of this.gotas) c.fillRect(Math.round(g.x), Math.round(g.y), 1, 2);
  }

  private desenharNascendo(fx: Uint8ClampedArray) {
    const nc = this.nascer;
    for (let k = 0; k < nc.n; k++) {
      const i = nc.ate[k];
      if (this.nasceu[i]) continue;
      const q = (this.tFase - nc.atraso[k]) / 0.7;
      if (q < 0) continue;
      const e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
      const tx = BASE_X + (i % L) * ESCALA, ty = BASE_Y + Math.floor(i / L) * ESCALA;
      const x0 = nc.de[k * 2], y0 = nc.de[k * 2 + 1];
      const x = x0 + (tx - x0) * e + Math.sin(q * Math.PI) * ((k % 2) ? 10 : -10);
      const y = y0 + (ty - y0) * e - Math.sin(q * Math.PI) * 14;
      const cor = rgb(PALETA_DA_COISA[this.letras[0][i]] ?? '#000000');
      const r = 150 + (((cor >> 16) & 255) - 150) * e, g = 10 + (((cor >> 8) & 255) - 10) * e, b = 20 + ((cor & 255) - 20) * e;
      for (let s = 0; s < 4; s++) {
        const px = (x | 0) + (s & 1), py = (y | 0) + (s >> 1);
        if (px < 0 || py < 0 || px >= PALCO_L || py >= PALCO_A) continue;
        pintarPor(fx, (py * PALCO_L + px) * 4, r, g, b, 1);
      }
    }
  }

  private desenharBalao(cx: number, cy: number, esc: number) {
    const c = this.c;
    const l = Math.max(12, Math.round(12 * esc)), a = Math.max(15, Math.round(15 * esc));
    c.fillStyle = '#cfcfcf';
    const de = cy + a / 2;
    for (let y = de; y < BUEIRO.y + 2; y += 1) c.fillRect(Math.round(cx + Math.sin((y - de) * 0.2 + this.t * 3) * 1.5), Math.round(y), 1, 1);
    c.drawImage(this.cvBalao, Math.round(cx - l / 2), Math.round(cy - a / 2), l, a);
  }
}
