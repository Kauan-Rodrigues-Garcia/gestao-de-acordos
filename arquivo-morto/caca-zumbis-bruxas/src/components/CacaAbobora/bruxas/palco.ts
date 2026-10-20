/**
 * palco.ts — onde as bruxas voam, levam o tiro e caem.
 *
 * Um motor só, sem React, para o laboratório e (depois) para a caça de verdade:
 * recebe um elemento e põe dentro dele dois canvas de BAIXA resolução (um pixel
 * do canvas = um pixel da arte; o CSS amplia por `escala` sem suavizar):
 *
 *   chão   o sangue, as poças, os pedaços — muda pouco, e só quando muda
 *   ação   as bruxas, os corpos caindo, o que voa — limpo a cada quadro
 *
 * E uma «caixa de tiro» invisível por bruxa viva, que segue o sprite: só ela
 * pega clique. O resto da página continua clicável por baixo.
 *
 * ## Leve (Cleber: «algo bem otimizado também, leve»)
 *
 * - Nada roda sem bruxa: o laço do `requestAnimationFrame` para sozinho quando
 *   não há o que mexer, e acorda por relógio só na hora de apagar a mancha.
 * - Sprite e giro são canvas prontos (`pixels.ts`): cada quadro é `drawImage`
 *   em posição inteira, sem montar pixel nenhum.
 * - A queda dorme quando assenta (`Queda.quieta`): o corpo no chão não é
 *   simulado, só desenhado.
 * - O rastro e a fumaça têm teto (`MAX_PARTICULAS`).
 * - Aba escondida: o navegador para o `requestAnimationFrame`, e o passo de
 *   tempo é limitado, para ninguém voltar e ver a bruxa teleportar.
 */
import { furo } from '../furo';
import { somAcerto, somBaque, somCerebro, somTiro } from '../sons';
import {
  ALTURA, BRUXAS, LARGURA, MORCEGO, MS_POR_QUADRO, NUMERO_DA_PARTE, PARTE_DO_NUMERO, PRIMEIRO_RINDO, VOO,
  alvoDaParte, centroDaParte, type Bruxa, type Rastro,
} from './arte';
import {
  FLASH_S, avancar, cabecaDaQueda, caixaDoCorpo, chapeuVoando, criarQueda, finalizar, poseDoOsso,
  type Evento, type Morte, type Queda,
} from './queda';
import {
  DIFICULDADE_PADRAO, VELOCIDADES, avancarVoo, balanco, criarVoo, enfurecer, fugir, rindo,
  type Dificuldade, type EventoVoo, type Voo, type Zona,
} from './voo';
import { esquecer, girado, miniatura, quadrosDa } from './pixels';
import {
  somBonk, somBrava, somChapeu, somDesmaio, somEspatifa, somGargalhada, somGrito, somMiau, somPuf, somRasga, somVassouraQuebra, somVento, somVidro,
} from './sons';

const MAX_PARTICULAS = 420;

/** Quanto o corpo fica no chão antes de apagar, e quanto leva apagando (s). */
export const CORPO_S = 9;
const CORPO_APAGA_S = 1.2;
/**
 * O fofo desmaiado é de cada tela (Cleber, 14/10/2026): fica no chão até 2 min
 * esperando o clique de quem está olhando. Quem clicar finaliza só na própria
 * tela, e o corpo some 20 s depois. O clique de outra pessoa não mexe aqui.
 */
export const DESMAIADO_S = 120;
export const FINALIZADO_S = 20;
/** A mancha: inteira até o corpo apagar, depois mais clara até `MANCHA_S`, e então some. */
export const MANCHA_S = 40;
/** O mesmo, contado do fim do corpo (que no fofo não é `CORPO_S`). */
const MANCHA_DEPOIS_S = MANCHA_S - CORPO_S;
const MANCHA_APAGA_S = 8;
const MANCHA_CLARA = 0.45;

/** Quem atirou nesta tela. Os outros chegam com o nome que quem chamou der. */
export const EU = 'eu';

/** De quem é o corpo: a bruxa, e quem a derrubou (para saber se quem finaliza é a mesma pessoa). */
interface Dona { id: number; bruxa: Bruxa; quem: string }

export type EventoPalco =
  /** `bruxa.fofa`: caiu desacordada, não morreu. Conta igual na gincana. `quem` atirou. */
  | { tipo: 'matou'; id: number; bruxa: Bruxa; morte: Morte; ms: number; quem: string }
  /** O fofo desacordado levou o segundo tiro e morreu. `dobrado`: quem finalizou é quem derrubou (o «2x»). */
  | { tipo: 'finalizou'; id: number; bruxa: Bruxa; quem: string; dobrado: boolean }
  | { tipo: 'chapeu'; bruxa: Bruxa }
  | { tipo: 'raspao'; bruxa: Bruxa }
  | { tipo: 'errou' }
  | { tipo: 'fugiu'; bruxa: Bruxa }
  | { tipo: 'soltou'; bruxa: Bruxa };

/**
 * A escala da caça e do laboratório. Era 2; ficou grande demais (Cleber).
 * Com 1,5 a tela de densidade 2 continua nítida (3 px por pixel da arte).
 */
export const ESCALA_BRUXAS = 1.5;

export interface OpcoesPalco {
  /** Quantos px da tela por pixel da arte. */
  escala?: number;
  dificuldade?: Dificuldade;
  /** Quantos px da arte o chão fica acima da borda de baixo (o corpo deitado tem de caber). */
  margemChao?: number;
  aoEvento?: (e: EventoPalco) => void;
  /** Quem atira nesta tela (o id da pessoa, na caça de verdade). Padrão: `EU`. */
  eu?: string;
}

interface Morcego { x: number; y: number; vx: number; vy: number; t: number; lado: 1 | -1; fugindo: boolean }

interface Viva {
  id: number;
  bruxa: Bruxa;
  voo: Voo;
  semChapeu: boolean;
  nasceu: number;
  caixa: HTMLDivElement;
  quadro: number;
  relogio: number;
  sobraRastro: number;
  morcego: Morcego | null;
}

interface QuedaViva {
  q: Queda;
  /** De quem é o corpo: a bruxa e quem a derrubou. */
  dona: Dona | null;
  /** A caixa de clique enquanto ela está desacordada no chão. */
  caixa: HTMLDivElement | null;
  /** O chão desta queda, num canvas próprio (apaga sozinho no fim). */
  chao: HTMLCanvasElement;
  cChao: CanvasRenderingContext2D;
  t: number;
  /** Quando o corpo começa a apagar (s): `CORPO_S`, ou mais no fofo desmaiado. */
  fim: number;
  ids: Set<number>;
  /** O que já está pintado: o raio de cada poça, se chegou mancha no último quadro, e a transparência. */
  raios: number[];
  sujou: boolean;
  alfa: number;
}

interface Particula {
  x: number; y: number; vx: number; vy: number;
  vida: number; max: number; cor: string; tam: number;
  g: number; atrito: number; forma: 'ponto' | 'cruz' | 'petala' | 'pisca';
}

const css = new Map<number, string>();
/** Cor do `ImageData` (ABGR) para o canvas. */
function corCss(u: number): string {
  let s = css.get(u);
  if (!s) {
    s = `rgb(${u & 255},${(u >>> 8) & 255},${(u >>> 16) & 255})`;
    css.set(u, s);
  }
  return s;
}

const entre = (a: number, b: number) => a + Math.random() * (b - a);
const sorteia = <T,>(l: readonly T[]): T => l[Math.floor(Math.random() * l.length)];

export class PalcoBruxas {
  readonly raiz: HTMLDivElement;
  private readonly cChao: CanvasRenderingContext2D;
  private readonly cAcao: CanvasRenderingContext2D;
  private readonly canvasChao: HTMLCanvasElement;
  private readonly canvasAcao: HTMLCanvasElement;
  private readonly escala: number;
  private readonly margemChao: number;
  private larg = 0;
  private alt = 0;
  private vivas: Viva[] = [];
  private quedas: QuedaViva[] = [];
  private particulas: Particula[] = [];
  private morcegos: Morcego[] = [];
  private proximoId = 1;
  private quadroRaf = 0;
  private antes = 0;
  private pausaAte = 0;
  private tremeAte = 0;
  /** O chão de todas precisa ser juntado de novo (entrou ou saiu queda, mudou o tamanho). */
  private chaoMudou = true;
  private acordar: ReturnType<typeof setTimeout> | undefined;
  private ultimoBaque = 0;
  private observador: ResizeObserver | null = null;
  private _dificuldade: Dificuldade;
  private readonly aoEvento?: (e: EventoPalco) => void;
  private readonly eu: string;
  /** Câmera lenta (1 = normal). Só no laboratório. */
  lenta = 1;
  /** Pinta por cima de cada bruxa a área de cada tiro. Só no laboratório. */
  mostrarAreas = false;
  /** Quadros por segundo, medidos (para o laboratório). */
  fps = 0;

  constructor(host: HTMLElement, opcoes: OpcoesPalco = {}) {
    this.escala = opcoes.escala ?? 2;
    this.margemChao = opcoes.margemChao ?? 10;
    this._dificuldade = opcoes.dificuldade ?? DIFICULDADE_PADRAO;
    this.aoEvento = opcoes.aoEvento;
    this.eu = opcoes.eu ?? EU;
    this.raiz = document.createElement('div');
    this.raiz.className = 'bx-palco';
    this.canvasChao = document.createElement('canvas');
    this.canvasAcao = document.createElement('canvas');
    this.canvasChao.className = 'bx-canvas';
    this.canvasAcao.className = 'bx-canvas';
    this.raiz.append(this.canvasChao, this.canvasAcao);
    host.appendChild(this.raiz);
    this.cChao = this.canvasChao.getContext('2d')!;
    this.cAcao = this.canvasAcao.getContext('2d')!;
    this.medir();
    this.observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.medir()) : null;
    this.observador?.observe(this.raiz);
  }

  // ── O tamanho ────────────────────────────────────────────────────────────

  private medir(): void {
    const w = Math.max(1, Math.ceil(this.raiz.clientWidth / this.escala));
    const h = Math.max(1, Math.ceil(this.raiz.clientHeight / this.escala));
    if (w === this.larg && h === this.alt) return;
    this.larg = w;
    this.alt = h;
    for (const c of [this.canvasChao, this.canvasAcao]) {
      c.width = w;
      c.height = h;
      c.style.width = `${w * this.escala}px`;
      c.style.height = `${h * this.escala}px`;
    }
    this.cChao.imageSmoothingEnabled = false;
    this.chaoMudou = true;
    this.cAcao.imageSmoothingEnabled = false;
    this.pedirQuadro();
  }

  /** A linha do chão (px da arte): onde o corpo espatifa. */
  get chao(): number {
    return this.alt - this.margemChao;
  }

  private zona(): Zona {
    const y0 = ALTURA / 2 + 6;
    return { x0: LARGURA / 2 + 6, x1: this.larg - LARGURA / 2 - 6, y0, y1: Math.max(y0 + 20, this.chao - ALTURA - 30) };
  }

  get dificuldade(): Dificuldade {
    return this._dificuldade;
  }

  set dificuldade(d: Dificuldade) {
    this._dificuldade = d;
    for (const v of this.vivas) v.voo.base = VELOCIDADES[d];
  }

  get estatisticas() {
    return { vivas: this.vivas.length, quedas: this.quedas.length, particulas: this.particulas.length, fps: this.fps };
  }

  // ── Soltar, matar, fugir ─────────────────────────────────────────────────

  /** Solta uma bruxa (a de `indice`, ou uma sorteada). Devolve o id. */
  soltar(indice?: number, onde?: { x: number; y: number }): number {
    const bruxa = BRUXAS[indice ?? Math.floor(Math.random() * BRUXAS.length)];
    const voo = criarVoo(this.zona(), VELOCIDADES[this._dificuldade], Math.random, onde);
    const caixa = document.createElement('div');
    caixa.className = 'bx-caixa';
    caixa.style.width = `${LARGURA * this.escala}px`;
    caixa.style.height = `${ALTURA * this.escala}px`;
    caixa.setAttribute('role', 'button');
    caixa.setAttribute('aria-label', `Uma bruxa! Atire: ${bruxa.nome.replace(/^(o|a) /, '')}`);
    const v: Viva = {
      id: this.proximoId++, bruxa, voo, semChapeu: false, nasceu: performance.now(), caixa,
      quadro: PRIMEIRO_RINDO, relogio: 0, sobraRastro: 0,
      morcego: bruxa.companheiro === 'morcego' ? { x: voo.x - 30, y: voo.y - 20, vx: 0, vy: 0, t: 0, lado: 1, fugindo: false } : null,
    };
    caixa.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.atirar(v, e.clientX, e.clientY);
    });
    this.raiz.appendChild(caixa);
    this.vivas.push(v);
    this.fumaca(voo.x, voo.y, bruxa);
    somPuf();
    setTimeout(somGargalhada, 160);
    // PC fraco: o sprite sem chapéu (o tiro no chapéu) fica pronto no tempo
    // ocioso, não no instante do tiro, que é quando um quadro perdido aparece.
    quandoOcioso(() => quadrosDa(bruxa, true));
    this.aoEvento?.({ tipo: 'soltou', bruxa });
    this.pedirQuadro();
    return v.id;
  }

  /** «Outra pessoa matou»: a primeira bruxa viva morre como o vencedor matou. */
  matarPorOutro(morte: Morte, quem = 'outro'): void {
    const v = this.vivas[0];
    if (!v) return;
    const img = quadrosDa(v.bruxa, v.semChapeu).imagens[v.quadro];
    const parte = morte === 'cabeca' ? 'cabeca' : morte === 'vassoura' ? 'vassoura' : 'tronco';
    somTiro();
    this.matar(v, morte, centroDaParte(img, NUMERO_DA_PARTE[parte]), quem);
  }

  /** «Outra pessoa finalizou»: o primeiro fofo desacordado leva o tiro no meio do corpo. */
  finalizarPorOutro(quem = 'outro', id?: number): void {
    // Com `id`, só o corpo daquela bruxa (outro de rodada anterior pode estar no chão).
    const qv = this.quedas.find(o => (id === undefined || o.dona?.id === id) && this.finalizavel(o));
    if (!qv) return;
    const c = caixaDoCorpo(qv.q)!;
    this.finalizarQueda(qv, quem, (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2);
  }

  /**
   * Quem derrubou a última que caiu, de novo: o tiro desta tela derrubou na
   * hora, mas o banco disse que outra pessoa chegou primeiro. É quem o «2x»
   * compara com quem finalizar.
   */
  trocarQuem(quem: string): void {
    for (let i = this.quedas.length - 1; i >= 0; i--) {
      const d = this.quedas[i].dona;
      if (d) { d.quem = quem; return; }
    }
  }

  /** Há alguma no ar? */
  get temViva(): boolean {
    return this.vivas.length > 0;
  }

  /** O tempo acabou: todas vão embora rindo. */
  fugirTodas(): void {
    for (const v of this.vivas) for (const e of fugir(v.voo, this.zona())) this.tocarVoo(e);
    this.pedirQuadro();
  }

  /** Apaga tudo: bruxas, corpos e sangue. */
  limpar(): void {
    for (const v of this.vivas) v.caixa.remove();
    for (const q of this.quedas) { esquecer(q.ids); q.caixa?.remove(); }
    this.vivas = [];
    this.quedas = [];
    this.particulas = [];
    this.morcegos = [];
    this.cChao.clearRect(0, 0, this.larg, this.alt);
    this.chaoMudou = true;
    this.cAcao.clearRect(0, 0, this.larg, this.alt);
  }

  destruir(): void {
    this.limpar();
    cancelAnimationFrame(this.quadroRaf);
    clearTimeout(this.acordar);
    this.observador?.disconnect();
    this.raiz.remove();
  }

  // ── O tiro ───────────────────────────────────────────────────────────────

  private posSprite(v: Viva): { x: number; y: number } {
    return { x: Math.round(v.voo.x - LARGURA / 2), y: Math.round(v.voo.y - ALTURA / 2) + balanco(v.voo) };
  }

  private atirar(v: Viva, clientX: number, clientY: number): void {
    if (!this.vivas.includes(v)) return;
    const r = this.raiz.getBoundingClientRect();
    const wx = (clientX - r.left) / this.escala, wy = (clientY - r.top) / this.escala;
    const s = this.posSprite(v);
    let lx = Math.floor(wx - s.x);
    const ly = Math.floor(wy - s.y);
    if (v.voo.lado < 0) lx = LARGURA - 1 - lx;
    const img = quadrosDa(v.bruxa, v.semChapeu).imagens[v.quadro];
    const dentro = lx >= 0 && ly >= 0 && lx < LARGURA && ly < ALTURA;
    const num = (dentro && img.partes[ly * LARGURA + lx]) || vizinho(img.partes, lx, ly);
    if (!num) {
      furo(clientX, clientY);
      this.aoEvento?.({ tipo: 'errou' });
      return;
    }
    somTiro();
    const parte = PARTE_DO_NUMERO[num]!;
    const alvo = alvoDaParte(parte);
    if (alvo === 'raspao') {
      somRasga();
      const cor = (dentro && img.cores[ly * LARGURA + lx]) || '#2a1a3c';
      for (let i = 0; i < 9; i++) this.particula({ x: wx, y: wy, vx: entre(-60, 60), vy: entre(-70, 10), vida: entre(0.5, 0.9), cor, tam: 1, g: 260 });
      this.aoEvento?.({ tipo: 'raspao', bruxa: v.bruxa });
      return;
    }
    if (alvo === 'chapeu') {
      if (v.semChapeu) return;
      somChapeu();
      this.letreiro('CHAPÉU!', wx, wy - 4, 'chapeu');
      this.adicionarQueda(chapeuVoando({
        bruxa: v.bruxa, quadro: v.quadro, lado: v.voo.lado, x: s.x, y: s.y, vx: v.voo.vx, vy: v.voo.vy,
        impacto: { x: lx, y: ly }, chao: this.chao, largura: this.larg,
      }));
      v.semChapeu = true;
      for (const e of enfurecer(v.voo, this.zona())) this.tocarVoo(e);
      this.aoEvento?.({ tipo: 'chapeu', bruxa: v.bruxa });
      return;
    }
    this.matar(v, alvo, { x: lx, y: ly }, this.eu);
  }

  private matar(v: Viva, morte: Morte, impacto: { x: number; y: number }, quem: string): void {
    const s = this.posSprite(v);
    this.vivas = this.vivas.filter(o => o !== v);
    v.caixa.remove();
    if (v.morcego) { v.morcego.fugindo = true; this.morcegos.push(v.morcego); }
    // O tranco do tiro: o jogo congela um instante (é o que dá peso ao acerto).
    this.pausaAte = performance.now() + 70;
    const fofa = !!v.bruxa.fofa;
    if (morte === 'cabeca') {
      if (!fofa) somCerebro();
      this.letreiro(fofa ? 'BONK!' : 'HEADSHOT!', s.x + LARGURA / 2, s.y, fofa ? 'fofo' : 'hs');
    } else if (morte === 'vassoura') this.letreiro('VASSOURADA!', s.x + LARGURA / 2, s.y + 22, 'vassoura');
    else if (fofa) this.letreiro('NOCAUTE!', s.x + LARGURA / 2, s.y + 6, 'fofo');
    else somAcerto();
    this.adicionarQueda(criarQueda({
      bruxa: v.bruxa, quadro: v.quadro, lado: v.voo.lado, x: s.x, y: s.y, vx: v.voo.vx, vy: v.voo.vy,
      morte, impacto, chao: this.chao, largura: this.larg, semChapeu: v.semChapeu,
    }), { id: v.id, bruxa: v.bruxa, quem });
    this.aoEvento?.({ tipo: 'matou', id: v.id, bruxa: v.bruxa, morte, ms: performance.now() - v.nasceu, quem });
  }

  private adicionarQueda(q: Queda, dona: Dona | null = null): void {
    const chao = document.createElement('canvas');
    chao.width = this.larg;
    chao.height = this.alt;
    const cChao = chao.getContext('2d')!;
    this.quedas.push({ q, dona, caixa: null, chao, cChao, t: 0, fim: q.fofa && dona ? DESMAIADO_S : CORPO_S, ids: new Set(), raios: [], sujou: false, alfa: NaN });
    this.chaoMudou = true;
    this.pedirQuadro();
  }

  // ── O fofo desacordado ───────────────────────────────────────────────────

  /** Desacordado no chão e ainda à vista (o corpo não começou a apagar). */
  private finalizavel(qv: QuedaViva): boolean {
    return qv.t < qv.fim && caixaDoCorpo(qv.q) !== null;
  }

  /** Põe, tira e acompanha a caixa de clique de quem está desacordado no chão. */
  private caixaNoChao(qv: QuedaViva): void {
    const c = this.finalizavel(qv) ? caixaDoCorpo(qv.q) : null;
    if (!c) {
      if (qv.caixa) { qv.caixa.remove(); qv.caixa = null; }
      return;
    }
    if (!qv.caixa) {
      const caixa = document.createElement('div');
      caixa.className = 'bx-caixa bx-caixa-chao';
      caixa.setAttribute('role', 'button');
      caixa.setAttribute('aria-label', 'Desmaiou! Atire de novo para finalizar');
      caixa.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const r = this.raiz.getBoundingClientRect();
        this.finalizarQueda(qv, this.eu, (e.clientX - r.left) / this.escala, (e.clientY - r.top) / this.escala);
      });
      this.raiz.appendChild(caixa);
      qv.caixa = caixa;
    }
    const k = this.escala;
    qv.caixa.style.width = `${Math.round((c.x1 - c.x0) * k)}px`;
    qv.caixa.style.height = `${Math.round((c.y1 - c.y0) * k)}px`;
    qv.caixa.style.transform = `translate(${Math.round(c.x0 * k)}px, ${Math.round(c.y0 * k)}px)`;
  }

  private finalizarQueda(qv: QuedaViva, quem: string, x: number, y: number): void {
    if (!this.finalizavel(qv) || !finalizar(qv.q, x, y)) return;
    qv.fim = qv.t + FINALIZADO_S;
    this.chaoMudou = true;
    qv.caixa?.remove();
    qv.caixa = null;
    somTiro();
    somCerebro();
    this.pausaAte = performance.now() + 70;
    this.tremeAte = performance.now() + 160;
    const dobrado = qv.dona?.quem === quem;
    this.letreiro(dobrado ? '2x!' : 'FINALIZADA!', x, y - 10, dobrado ? 'dobro' : 'final');
    if (qv.dona) this.aoEvento?.({ tipo: 'finalizou', id: qv.dona.id, bruxa: qv.dona.bruxa, quem, dobrado });
    this.pedirQuadro();
  }

  // ── Efeitos ──────────────────────────────────────────────────────────────

  private particula(p: Partial<Particula> & Pick<Particula, 'x' | 'y' | 'cor'>): void {
    if (this.particulas.length >= MAX_PARTICULAS) return;
    const vida = p.vida ?? 0.6;
    this.particulas.push({ vx: 0, vy: 0, tam: 1, g: 0, atrito: 0, forma: 'ponto', ...p, vida, max: vida });
  }

  /** O «puf» da chegada: fumaça roxa que abre e um punhado do rastro dela. */
  private fumaca(x: number, y: number, b: Bruxa): void {
    const cinzas = ['#4a3e58', '#6a5a7a', '#8a7a9a', '#b4a8c4'];
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, v = entre(15, 75);
      this.particula({
        x: x + Math.cos(a) * 4, y: y + Math.sin(a) * 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 10,
        vida: entre(0.45, 1), cor: sorteia(cinzas), tam: sorteia([2, 2, 3]), atrito: 3.5,
      });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, v = entre(30, 90);
      this.particula({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: entre(0.4, 0.8), cor: sorteia(b.rastro.cores), atrito: 2, forma: 'pisca' });
    }
  }

  /** O rastro da vassoura, do jeito de cada bruxa. */
  private rastro(v: Viva, dt: number): void {
    const tipo = v.bruxa.rastro.tipo;
    const taxa: Record<Rastro, number> = { faisca: 28, brasa: 22, poeira: 16, vagalume: 9, estrela: 14, nevoa: 20, petala: 9, moeda: 5 };
    v.sobraRastro += taxa[tipo] * dt * (v.voo.modo === 'paira' ? 0.4 : 1);
    const s = this.posSprite(v);
    const lado = v.voo.lado;
    while (v.sobraRastro >= 1) {
      v.sobraRastro -= 1;
      const lx = entre(0, 4), ly = entre(21, 32);
      const x = s.x + (lado > 0 ? lx : LARGURA - lx), y = s.y + ly;
      const cor = sorteia(v.bruxa.rastro.cores);
      const atras = -lado;
      switch (tipo) {
        case 'faisca': this.particula({ x, y, vx: atras * entre(10, 40), vy: entre(-15, 15), vida: entre(0.3, 0.55), cor, forma: 'pisca' }); break;
        case 'brasa': this.particula({ x, y, vx: atras * entre(5, 25), vy: entre(-30, -8), vida: entre(0.5, 0.8), cor, g: -10 }); break;
        case 'poeira': this.particula({ x, y, vx: atras * entre(10, 25), vy: entre(-8, 8), vida: entre(0.5, 0.9), cor, tam: 2, atrito: 1.5 }); break;
        case 'vagalume': this.particula({ x, y, vx: entre(-14, 14) + atras * 8, vy: entre(-14, 10), vida: entre(1.1, 1.8), cor, forma: 'pisca' }); break;
        case 'estrela': this.particula({ x, y, vx: atras * entre(5, 20), vy: entre(-10, 10), vida: entre(0.6, 1), cor, forma: Math.random() < 0.35 ? 'cruz' : 'pisca' }); break;
        case 'nevoa': this.particula({ x, y, vx: atras * entre(8, 20), vy: entre(-6, 6), vida: entre(0.6, 1), cor, tam: 2, atrito: 1 }); break;
        case 'petala': this.particula({ x, y, vx: atras * entre(5, 25), vy: entre(-15, 0), vida: entre(1.6, 2.4), cor, g: 30, forma: 'petala' }); break;
        case 'moeda': this.particula({ x, y, vx: entre(-15, 15), vy: entre(-50, -15), vida: 2.4, cor, tam: 2, g: 260, forma: 'pisca' }); break;
      }
    }
  }

  private letreiro(texto: string, x: number, y: number, tipo: 'hs' | 'vassoura' | 'chapeu' | 'fofo' | 'final' | 'dobro'): void {
    const el = document.createElement('div');
    el.className = `bx-letreiro bx-letreiro-${tipo}`;
    el.textContent = texto;
    el.style.left = `${x * this.escala}px`;
    el.style.top = `${y * this.escala}px`;
    this.raiz.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  private tocarVoo(e: EventoVoo): void {
    if (e === 'gargalha') somGargalhada();
    else if (e === 'mergulha') somVento();
    else if (e === 'brava') somBrava();
    else if (e === 'foge') somGargalhada();
  }

  private tocarQueda(e: Evento): void {
    switch (e.tipo) {
      case 'espatifa':
        somEspatifa(e.forca);
        this.tremeAte = performance.now() + 120 + 160 * e.forca;
        break;
      case 'baque': {
        const agora = performance.now();
        if (agora - this.ultimoBaque < 70) return;
        this.ultimoBaque = agora;
        somBaque(e.forca);
        break;
      }
      case 'quebra': somVassouraQuebra(); break;
      case 'vidro': somVidro(); break;
      case 'miau': somMiau(); break;
      case 'grito': somGrito(); break;
      case 'cerebro': break;
      case 'bonk': somBonk(); break;
      case 'desmaia': somDesmaio(e.forca); break;
    }
  }

  // ── O laço ───────────────────────────────────────────────────────────────

  private pedirQuadro(): void {
    clearTimeout(this.acordar);
    if (this.quadroRaf) return;
    this.antes = performance.now();
    this.quadroRaf = requestAnimationFrame(this.passo);
  }

  private passo = (agora: number): void => {
    this.quadroRaf = 0;
    const real = Math.min(0.05, Math.max(0, (agora - this.antes) / 1000));
    this.antes = agora;
    if (real > 0) this.fps += (1 / real - this.fps) * 0.1;
    const dt = agora < this.pausaAte ? 0 : real * this.lenta;

    this.moverVivas(dt);
    this.moverParticulas(dt);
    const mexendo = this.moverQuedas(dt, real);
    this.desenhar(agora);

    const tremendo = agora < this.tremeAte;
    if (tremendo) {
      const k = this.escala;
      this.raiz.style.transform = `translate(${(Math.random() < 0.5 ? -1 : 1) * k}px, ${(Math.random() < 0.5 ? -1 : 1) * k}px)`;
    } else if (this.raiz.style.transform) this.raiz.style.transform = '';

    if (this.vivas.length || this.particulas.length || this.morcegos.length || mexendo || tremendo || agora < this.pausaAte) {
      this.quadroRaf = requestAnimationFrame(this.passo);
      return;
    }
    // Nada se mexe: dorme até a próxima mancha começar a apagar.
    const prox = this.proximaMudanca();
    if (prox !== null) this.acordar = setTimeout(() => this.pedirQuadro(), prox * 1000);
  };

  private moverVivas(dt: number): void {
    const z = this.zona();
    for (const v of this.vivas) {
      for (const e of avancarVoo(v.voo, z, dt)) this.tocarVoo(e);
      // O quadro: voo normal, ou a gargalhada quando ela para no ar.
      v.relogio += dt * 1000;
      const ms = rindo(v.voo) ? MS_POR_QUADRO * 1.6 : MS_POR_QUADRO;
      const passo = Math.floor(v.relogio / ms);
      v.quadro = rindo(v.voo) ? PRIMEIRO_RINDO + (passo % 2) : passo % VOO.length;
      this.rastro(v, dt);
      if (v.morcego) this.moverMorcego(v.morcego, dt, v);
    }
    for (const m of this.morcegos) this.moverMorcego(m, dt, null);
    this.morcegos = this.morcegos.filter(m => m.y > -20 && m.x > -30 && m.x < this.larg + 30);
    const foram = this.vivas.filter(v => v.voo.modo === 'fora');
    for (const v of foram) {
      v.caixa.remove();
      if (v.morcego) { v.morcego.fugindo = true; this.morcegos.push(v.morcego); }
      this.aoEvento?.({ tipo: 'fugiu', bruxa: v.bruxa });
    }
    if (foram.length) this.vivas = this.vivas.filter(v => v.voo.modo !== 'fora');
  }

  private moverMorcego(m: Morcego, dt: number, dona: Viva | null): void {
    m.t += dt;
    if (dona && !m.fugindo) {
      // Atrás e acima dela, batendo asa num oito.
      const alvoX = dona.voo.x - dona.voo.lado * 30 + Math.sin(m.t * 2.1) * 6;
      const alvoY = dona.voo.y - 18 + Math.sin(m.t * 4.3) * 5;
      m.vx += (alvoX - m.x) * 7 * dt;
      m.vy += (alvoY - m.y) * 7 * dt;
      m.vx *= 1 - Math.min(1, 3 * dt);
      m.vy *= 1 - Math.min(1, 3 * dt);
      m.lado = dona.voo.lado;
    } else {
      // Foge para cima, zigue-zagueando.
      m.vy -= 170 * dt;
      m.vx += Math.sin(m.t * 9) * 220 * dt + m.lado * 60 * dt;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
  }

  private moverParticulas(dt: number): void {
    if (!dt) return;
    for (const p of this.particulas) {
      p.vida -= dt;
      p.vy += p.g * dt;
      if (p.atrito) { p.vx *= 1 - Math.min(1, p.atrito * dt); p.vy *= 1 - Math.min(1, p.atrito * dt); }
      if (p.forma === 'petala') p.vx += Math.sin(p.vida * 8) * 40 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particulas = this.particulas.filter(p => p.vida > 0 && p.y < this.alt + 4);
  }

  /** Avança as quedas. Devolve se alguma ainda se mexe (ou apaga). */
  private moverQuedas(dt: number, real: number): boolean {
    let mexe = false;
    for (const qv of this.quedas) {
      qv.t += real;
      if (!qv.q.quieta && dt > 0) {
        avancar(qv.q, dt);
        for (const e of qv.q.eventos.splice(0)) this.tocarQueda(e);
      }
      this.caixaNoChao(qv);
      if (!qv.q.quieta) mexe = true;
      if (this.apagando(qv)) mexe = true;
      // Desacordada: as estrelinhas rodam enquanto o corpo está no chão.
      if (qv.q.tonta && qv.t < qv.fim + CORPO_APAGA_S) mexe = true;
    }
    const acabou = this.quedas.filter(qv => qv.t > qv.fim + MANCHA_DEPOIS_S + MANCHA_APAGA_S);
    if (acabou.length) {
      for (const qv of acabou) { esquecer(qv.ids); qv.caixa?.remove(); }
      this.quedas = this.quedas.filter(qv => !acabou.includes(qv));
      this.chaoMudou = true;
      mexe = true;
    }
    return mexe;
  }

  private apagando(qv: QuedaViva): boolean {
    const mancha = qv.fim + MANCHA_DEPOIS_S;
    return (qv.t > qv.fim && qv.t < qv.fim + CORPO_APAGA_S) || (qv.t > mancha && qv.t < mancha + MANCHA_APAGA_S + 0.1);
  }

  /** Em quantos segundos algo muda sozinho (a próxima etapa de apagar). */
  private proximaMudanca(): number | null {
    let prox: number | null = null;
    for (const qv of this.quedas) {
      for (const marco of [qv.fim, qv.fim + MANCHA_DEPOIS_S]) {
        if (qv.t < marco) { prox = prox === null ? marco - qv.t : Math.min(prox, marco - qv.t); break; }
      }
    }
    return prox === null ? null : prox + 0.02;
  }

  // ── A pintura ────────────────────────────────────────────────────────────

  private desenhar(agora: number): void {
    // O chão: cada queda pinta só o que chegou; o chão de todas se junta com a
    // transparência de cada uma. Só quando algo mudou (PC fraco, 14/10/2026):
    // canvas que não é tocado não é recomposto pelo navegador, e o chão
    // parado é a maior parte do tempo.
    let mudou = this.chaoMudou;
    this.chaoMudou = false;
    for (const qv of this.quedas) {
      if (pintarChaoNovo(qv)) mudou = true;
      const a = alfaMancha(qv.t, qv.fim);
      if (a !== qv.alfa) { qv.alfa = a; mudou = true; }
    }
    if (mudou) {
      this.cChao.clearRect(0, 0, this.larg, this.alt);
      for (const qv of this.quedas) {
        if (qv.alfa <= 0) continue;
        this.cChao.globalAlpha = qv.alfa;
        this.cChao.drawImage(qv.chao, 0, 0);
      }
      this.cChao.globalAlpha = 1;
    }

    const c = this.cAcao;
    c.clearRect(0, 0, this.larg, this.alt);
    // O rastro fica atrás de quem voa.
    for (const p of this.particulas) desenharParticula(c, p, agora);
    for (const qv of this.quedas) {
      const a = alfaCorpo(qv.t, qv.fim);
      if (a <= 0) continue;
      c.globalAlpha = a;
      desenharQueda(c, qv);
      if (qv.q.tonta) desenharTontura(c, qv.q, agora);
    }
    c.globalAlpha = 1;
    for (const v of this.vivas) {
      const s = this.posSprite(v);
      const q = quadrosDa(v.bruxa, v.semChapeu);
      c.drawImage((v.voo.lado > 0 ? q.direita : q.esquerda)[v.quadro], s.x, s.y);
      if (this.mostrarAreas) desenharAreas(c, q.imagens[v.quadro].partes, s.x, s.y, v.voo.lado);
      v.caixa.style.transform = `translate(${s.x * this.escala}px, ${s.y * this.escala}px)`;
      if (v.morcego) desenharMorcego(c, v.morcego);
    }
    for (const m of this.morcegos) desenharMorcego(c, m);
  }
}

function vizinho(partes: Uint8Array, x: number, y: number): number {
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const i = x + dx, j = y + dy;
    if (i < 0 || j < 0 || i >= LARGURA || j >= ALTURA) continue;
    if (partes[j * LARGURA + i]) return partes[j * LARGURA + i];
  }
  return 0;
}

function alfaCorpo(t: number, fim: number): number {
  if (t < fim) return 1;
  return Math.max(0, 1 - (t - fim) / CORPO_APAGA_S);
}

function alfaMancha(t: number, fim: number): number {
  const mancha = fim + MANCHA_DEPOIS_S;
  if (t < fim) return 1;
  if (t < fim + CORPO_APAGA_S) return 1 - (1 - MANCHA_CLARA) * ((t - fim) / CORPO_APAGA_S);
  if (t < mancha) return MANCHA_CLARA;
  return Math.max(0, MANCHA_CLARA * (1 - (t - mancha) / MANCHA_APAGA_S));
}

/** As manchas novas e as poças (que só crescem) no canvas do chão da queda. */
/**
 * Pinta no chão da queda o que mudou. Devolve se pintou alguma coisa.
 *
 * As poças cobrem as manchas que caem dentro delas: antes elas eram pintadas
 * de novo a cada quadro. Agora só quando o raio de alguma muda ou quando
 * chegou mancha no quadro anterior — dá o mesmo desenho, sem repintar o
 * que já está lá.
 */
function pintarChaoNovo(qv: QuedaViva): boolean {
  const { q, cChao: c } = qv;
  let raioMudou = q.pocas.length !== qv.raios.length;
  for (let i = 0; i < q.pocas.length && !raioMudou; i++) raioMudou = Math.round(q.pocas[i].r) !== qv.raios[i];
  const repinta = raioMudou || qv.sujou;
  if (repinta) qv.raios = q.pocas.map(p => Math.round(p.r));
  for (const p of repinta ? q.pocas : []) {
    const r = Math.round(p.r);
    if (r < 1) continue;
    const ry = Math.max(1, Math.round(r * 0.3));
    for (let j = -ry; j <= ry; j++) {
      const meia = Math.round(r * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2)));
      c.fillStyle = corCss(p.borda);
      c.fillRect(p.cx - meia, p.cy + j, meia * 2 + 1, 1);
      if (meia > 1 && Math.abs(j) < ry) {
        c.fillStyle = corCss(p.cor);
        c.fillRect(p.cx - meia + 1, p.cy + j, meia * 2 - 1, 1);
      }
    }
    // O brilho da poça molhada, no alto à esquerda (a luz da arte toda).
    if (r >= 5) {
      c.fillStyle = '#ff6b6b';
      c.fillRect(p.cx - Math.round(r * 0.4), p.cy - Math.max(0, ry - 1), r >= 9 ? 2 : 1, 1);
    }
  }
  qv.sujou = q.novas.length > 0;
  if (!qv.sujou) return repinta;
  for (const k of q.novas) {
    const cor = q.manchas.get(k);
    if (cor === undefined) continue;
    c.fillStyle = corCss(cor);
    c.fillRect(k % 4096, Math.floor(k / 4096), 1, 1);
  }
  q.novas.length = 0;
  return true;
}

function desenharQueda(c: CanvasRenderingContext2D, qv: QuedaViva): void {
  const q = qv.q;
  if (q.t < FLASH_S && q.flash) {
    const g = girado(q.flash.rec, 0, 0, 0);
    qv.ids.add(q.flash.rec.id);
    c.drawImage(g.canvas, q.flash.x, q.flash.y);
    return;
  }
  for (const o of q.ossos) {
    if (!o.vivo) continue;
    const p = poseDoOsso(q, o);
    const g = girado(o.rec, o.ax, o.ay, p.giro);
    qv.ids.add(o.rec.id);
    c.drawImage(g.canvas, Math.round(p.x) + g.ox, Math.round(p.y) + g.oy);
  }
  for (const s of q.soltos) {
    const g = girado(s.rec, s.rec.w / 2, s.rec.h / 2, s.ang);
    qv.ids.add(s.rec.id);
    c.drawImage(g.canvas, Math.round(s.cx) + g.ox, Math.round(s.cy) + g.oy);
  }
  for (const gt of q.gotas) {
    c.fillStyle = corCss(gt.cor);
    c.fillRect(Math.round(gt.x), Math.round(gt.y), gt.tam, gt.tam);
  }
}

/**
 * As estrelinhas rodando em cima da cabeça de quem desmaiou: três, numa
 * elipse achatada (o chão tem fundo), a de trás mais apagada.
 */
const ESTRELA_TONTA = ['..y..', '.yyy.', 'yywyy', '.yyy.', '..y..'];
function desenharTontura(c: CanvasRenderingContext2D, q: Queda, agora: number): void {
  const cab = cabecaDaQueda(q);
  if (!cab) return;
  const t = agora / 1000;
  for (let i = 0; i < 3; i++) {
    const a = t * 3.2 + (i * Math.PI * 2) / 3;
    const x = Math.round(cab.x + Math.cos(a) * 9) - 2;
    const y = Math.round(cab.y - 9 + Math.sin(a) * 3) - 2;
    const atras = Math.sin(a) < 0;
    for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) {
      const ch = ESTRELA_TONTA[j][k];
      if (ch === '.') continue;
      c.fillStyle = ch === 'w' ? '#ffffff' : atras ? '#c8a020' : '#ffd34d';
      c.fillRect(x + k, y + j, 1, 1);
    }
  }
}

function desenharParticula(c: CanvasRenderingContext2D, p: Particula, agora: number): void {
  const vida = p.vida / p.max;
  let a = Math.min(1, vida * 1.6);
  if (p.forma === 'pisca') a *= (Math.floor(agora / 70 + p.max * 50) % 3 === 0) ? 0.35 : 1;
  c.globalAlpha = a;
  c.fillStyle = p.cor;
  const x = Math.round(p.x), y = Math.round(p.y);
  if (p.forma === 'cruz') {
    c.fillRect(x - 1, y, 3, 1);
    c.fillRect(x, y - 1, 1, 3);
  } else if (p.forma === 'petala') {
    c.fillRect(x, y, 2, 1);
  } else {
    c.fillRect(x, y, p.tam, p.tam);
  }
  c.globalAlpha = 1;
}

function desenharMorcego(c: CanvasRenderingContext2D, m: Morcego): void {
  const quadro = Math.floor(m.t * 11) % 2;
  const img = miniatura(MORCEGO[quadro])[0];
  c.drawImage(img, Math.round(m.x - img.width / 2), Math.round(m.y - img.height / 2));
}

const COR_DA_AREA: Record<string, string> = {
  cabeca: 'rgba(255,40,60,.55)', corpo: 'rgba(255,210,40,.45)', vassoura: 'rgba(60,160,255,.5)',
  chapeu: 'rgba(200,80,255,.5)', raspao: 'rgba(200,200,200,.3)',
};

function desenharAreas(c: CanvasRenderingContext2D, partes: Uint8Array, x: number, y: number, lado: number): void {
  for (let j = 0; j < ALTURA; j++) for (let i = 0; i < LARGURA; i++) {
    const n = partes[j * LARGURA + i];
    if (!n) continue;
    c.fillStyle = COR_DA_AREA[alvoDaParte(PARTE_DO_NUMERO[n]!)];
    c.fillRect(x + (lado > 0 ? i : LARGURA - 1 - i), y + j, 1, 1);
  }
}

/** Roda quando o navegador estiver à toa (ou logo depois, onde não há `requestIdleCallback`). */
function quandoOcioso(f: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => f(), { timeout: 2000 });
  else setTimeout(f, 300);
}
