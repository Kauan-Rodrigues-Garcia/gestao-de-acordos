/**
 * palcoChefona.ts — onde a Bruxa do Pântano flutua, joga poção e morre.
 *
 * A chefona é a BRUXA DO MINECRAFT (`arte.ts`). Um motor sem React, como o
 * `../palco.ts` das bruxas comuns: recebe um elemento e põe nele um canvas de
 * baixa resolução (um pixel do canvas = um pixel da arte, ampliado pelo CSS
 * sem suavizar), as caixas de tiro (a dela e a do caldeirão), a barra de
 * chefe, a contagem e os letreiros.
 *
 * ## A luta
 *
 * - Antes dela, a CONTAGEM (1 min, como o Rei do Pop): o aviso no alto com o
 *   relógio, o tique nos 10 s finais e o 5, 4, 3, 2, 1 grande no meio.
 * - Ela flutua sob Levitação. Tiro por peça: a cabeça é CRÍTICO, o chapéu
 *   quase nada. Cada tiro deixa ela vermelha um instante (o dano do jogo), e
 *   ela vai RACHANDO como bloco sendo quebrado (três estágios). Quanto mais
 *   rachada, mais FRACA e CURTA a poção (nível II → I).
 * - Apanhou demais em pouco tempo: ela bebe uma poção ou usa a pérola do
 *   Ender (`movimento.ts`) e o tiro passa a ser «ESQUIVOU!» até o fim dela.
 * - De tempos em tempos ela para, gargalha, ergue a garrafa e JOGA A POÇÃO: a
 *   garrafa voa em arco, gira, estoura no alvo e o efeito pega a tela. Quem
 *   atira enquanto ela prepara tira mais vida, e dano suficiente QUEBRA a
 *   poção (ela fica tonta).
 * - O forte é o ENCANTAMENTO: a mesa de encantamento aparece no chão, as
 *   runas do Alfabeto Galáctico voam para o livro e giram em volta dela, a
 *   frase dela se escreve em runas no alto, e a página distorce.
 * - Com metade da vida (e de novo perto do fim) ela põe o CALDEIRÃO da
 *   cabana do pântano e bebe a Poção de Cura. O caldeirão leva tiro e racha
 *   como bloco, até quebrar.
 * - Com pouca vida, a FÚRIA: mais rápida, joga mais, desvia mais.
 * - Vida zero: a morte do Minecraft — vermelha, cai, tomba de lado, some num
 *   «puf» de fumaça branca e deixa os drops dela (garrafa, redstone, pedra
 *   luminosa, açúcar, olho de aranha, graveto, pólvora) e as bolinhas de XP,
 *   que voam para a barra. Toda poção ativa se desfaz na hora.
 * - Prazo acabou: ela gargalha e vai embora.
 *
 * Por enquanto vive no laboratório (`../laboratorio.ts`), sem banco: a vida
 * é desta tela. Na caça de verdade a vida será do banco, compartilhada, como
 * a do Rei do Pop (`../../chefao.ts`).
 */
import { furo } from '../../furo';
import { somAcerto, somCerebro, somTiro, somTique } from '../../sons';
import { NUMERO_DA_PARTE, PARTE_DO_NUMERO, alvoDaParte, centroDaParte, parteNoPonto, type Imagem, type NomeParte } from '../arte';
import { canvasDaImagem, miniatura } from '../pixels';
import {
  somArremesso, somBeber, somBloco, somBlocoQuebra, somBrava, somCaldeirao, somConquista, somCura, somDor, somEncantamento,
  somGargalhada, somMorte, somOnda, somPuf, somPufMorte, somTeleporte, somVento, somVidro, somXp,
} from '../sons';
import {
  ALTURA_MC, DROPS, ESCALA_CHEFONA, GARRAFA, LARGURA_MC, NOME_CHEFONA, PIXEL_MC, PONTA_DO_CHAPEU, PRIMEIRO_RINDO_MC,
  QUADROS_FLUTUANDO, cabecaMC, comContorno, coresDaPocao, estagioDoDano, montarBruxaMC, type Item,
} from './arte';
import { ALTURA_CALDEIRAO, COR_CURA, LARGURA_CALDEIRAO, PONTOS_CALDEIRAO, desenharCaldeirao } from './caldeirao';
import {
  FEITICOS, FEITICO_FORTE, LISTA_FEITICOS, alvoDaPocao, alvosPorAtributo, disponivel, duracaoDoFeitico,
  forcaDoFeitico, lancar, nivelDaPocao, type AlvosFeitico, type NomeFeitico,
} from './feiticos';
import { ENCANTO, glifo, letrasComRuna } from './galatico';
import {
  COR_MANOBRA, NOME_MANOBRA, avancarCorpo, balanco, criarCorpo, escolherManobra, iniciarManobra, invulneravel, novoAlvo,
  pairar, type Corpo, type Manobra, type Zona,
} from './movimento';
import './chefona.css';

const LARG = LARGURA_MC;
const ALT = ALTURA_MC;

// ── Os números da luta ─────────────────────────────────────────────────────

export const VIDA_PADRAO = 300;
export const PRAZO_PADRAO_S = 120;
/** A contagem antes dela (s), como a do Rei do Pop. */
export const ESPERA_PADRAO_S = 60;
const TIQUE_S = 10;
const NUMERAO_S = 5;
/** Velocidade de cruzeiro (px da arte/s), e na fúria. */
const VELOCIDADE = 70;
const VELOCIDADE_FURIA = 105;
/** O dano de cada tiro, pela peça. */
export const DANO: Readonly<Record<ReturnType<typeof alvoDaParte>, number>> = {
  cabeca: 6, corpo: 3, vassoura: 2, chapeu: 2, raspao: 1,
};
/** Abaixo desta fração da vida, a fúria. */
export const FURIA_EM = 0.35;
/** Preparando a poção ela apanha 50% a mais; tonta, o dobro. */
const MULT_CONJURANDO = 1.5;
const MULT_TONTA = 2;
/** Dano no preparo (fração da vida máxima) que quebra a poção; o Encantamento pede mais. */
export const QUEBRA_FEITICO = 0.06;
const QUEBRA_FORTE = 0.09;
const CONJURO_S = 1.4;
const CONJURO_FORTE_S = 2.8;
const TONTA_S = 1.8;
/** O vermelho do dano (o do jogo). */
const DOR_MS = 260;
/** Entre uma poção e outra (s), normal e na fúria. A primeira sai mais cedo. */
const INTERVALO: readonly [number, number] = [12, 18];
const INTERVALO_FURIA: readonly [number, number] = [8, 12];
const PRIMEIRO_FEITICO_S = 6;
/** O Encantamento: o primeiro não antes disto (s de luta), e depois um a cada tanto. */
const PRIMEIRO_FORTE_S = 25;
const ENTRE_FORTES_S = 35;
/** Tiros dentro de `JANELA_S` que fazem ela desviar, e a folga entre manobras. */
const JANELA_S = 1.6;
const LIMIAR_DESVIO = 6;
const LIMIAR_DESVIO_FURIA = 4;
const CHANCE_DESVIO = 0.07;
const CHANCE_DESVIO_FURIA = 0.12;
const FOLGA_MANOBRA_S = 2.2;
/** O caldeirão: quanto da vida ele devolve, em quanto tempo, e quando ela o chama. */
export const CURA_FRACAO = 0.22;
/** A conquista de quem ajudou a derrubar a chefona (o desafio do Minecraft). */
export const CONQUISTA = {
  titulo: 'Desafio concluído!',
  nome: 'Quem Mandou Jogar Poção?',
  descricao: `Ajudou a derrubar a ${NOME_CHEFONA}`,
} as const;
const CURA_S = 6;
const CURA_EM: readonly number[] = [0.5, 0.2];
/** A morte: gravidade, o tombo de lado, o tempo deitada e quanto os drops ficam. */
const GRAVIDADE = 330;
const TOMBO_S = 0.45;
const DEITADA_S = 0.9;
const DROPS_S = 12;
const ORBES_XP = 14;

const MAX_PARTICULAS = 700;
const MAX_LETREIROS = 14;
/** As partículas de bruxa (roxas) e as da levitação. */
const CORES_BRUXA = ['#a040e0', '#c070ff', '#7a2ad0'] as const;
const CORES_LEVITACAO = ['#ceffff', '#9ae8f0', '#ffffff'] as const;
const CORES_PORTAL = ['#c040ff', '#8a1ad0', '#e0a0ff', '#2a0a4a'] as const;
const CORES_FUMACA = ['#ffffff', '#e8e8e8', '#c8c8c8', '#a8a8a8'] as const;
const CORES_CRITICO = ['#fff4c8', '#e8c890', '#ffffff'] as const;
const CORES_CURA = [COR_CURA, '#ff8a8a', '#ffc0c0'] as const;
const CORES_MANTO = ['#6a1fb0', '#5a1a9a', '#8a3ad0', '#1f8a2a', '#1a1a1c'] as const;
/** A fumaça roxa que sai da ponta do chapéu (a da referência). */
const CORES_FUMACA_CHAPEU = ['#8a1ad0', '#a83ae8', '#6a10a8', '#c070ff'] as const;
const CORES_FERRO = ['#3c3c40', '#4a4a50', '#6a6a72', '#232326'] as const;

export type Fase =
  | 'fora' | 'chegando' | 'entrando' | 'voando' | 'conjurando' | 'tonta' | 'curando'
  | 'caindo' | 'tombando' | 'fugindo';

export type EventoChefona =
  | { tipo: 'chegando'; segundos: number }
  | { tipo: 'entrou' }
  | { tipo: 'acertou'; dano: number; parte: NomeParte; vida: number; meu: boolean }
  | { tipo: 'errou' }
  | { tipo: 'esquivou'; manobra: Manobra }
  | { tipo: 'manobra'; manobra: Manobra }
  | { tipo: 'conjurando'; feitico: NomeFeitico }
  | { tipo: 'feitico'; feitico: NomeFeitico; forca: number; duracaoMs: number }
  | { tipo: 'quebrou'; feitico: NomeFeitico }
  | { tipo: 'caldeirao' }
  | { tipo: 'curou'; vida: number }
  | { tipo: 'caldeiraoQuebrado' }
  | { tipo: 'furia' }
  | { tipo: 'derrotada'; segundos: number }
  | { tipo: 'fugiu' }
  | { tipo: 'conquista'; nome: string };

export interface OpcoesChefona {
  escala?: number;
  alvos?: AlvosFeitico;
  aoEvento?: (e: EventoChefona) => void;
}

/** ponto, cruz, estrela (o brilho), espiral (a partícula de efeito de poção). */
type Forma = 'ponto' | 'cruz' | 'estrela' | 'espiral';

interface Particula {
  x: number; y: number; vx: number; vy: number;
  vida: number; max: number; cor: string; tam: number; g: number;
  forma: Forma;
  /** Cai no chão e fica um pouco (a poção derramada). */
  gruda: boolean;
}

interface Anel { x: number; y: number; r: number; vr: number; vida: number; max: number; cor: string }

/** A garrafa voando em arco até o alvo. */
interface Garrafa { feitico: NomeFeitico; t: number; dura: number; de: { x: number; y: number }; ate: { x: number; y: number }; altura: number }

interface Caldeirao {
  x: number;
  pontos: number;
  tremor: number;
  t: number;
  aparecendo: number;
  saindo: boolean;
}

interface Cura { etapa: 'indo' | 'bebendo'; curado: number; total: number; proximoNumero: number; proximoGole: number }

interface Queda { vy: number; vx: number }

/** A mesa de encantamento no chão, com o livro. */
interface Mesa { x: number; t: number; aparecendo: number; saindo: boolean }

/** Uma runa voando para o livro da mesa. */
interface RunaVoando { de: { x: number; y: number }; t: number; dura: number; letra: string }

interface Teia { x: number; y: number; nasceu: number; ate: number }

interface Drop { item: Item; x: number; y: number; vx: number; vy: number; t: number; fase: number; noChao: boolean }

interface Orbe { x: number; y: number; vx: number; vy: number; t: number; voando: boolean; tam: number; pegou: boolean }

const entre = (a: number, b: number) => a + Math.random() * (b - a);
const sorteia = <T,>(l: readonly T[]): T => l[Math.floor(Math.random() * l.length)];
const suave = (u: number) => u * u * (3 - 2 * u);

// ── Os desenhos prontos (guardados: são poucos) ────────────────────────────

const cacheImagens = new Map<number, Imagem>();
/** O sprite sem rachadura, para o tiro por peça. */
function imagemDoQuadro(quadro: number): Imagem {
  let img = cacheImagens.get(quadro);
  if (!img) { img = montarBruxaMC(quadro, 0); cacheImagens.set(quadro, img); }
  return img;
}

const cacheSprites = new Map<string, HTMLCanvasElement>();
/** O sprite com as rachaduras do estágio, já virado, e vermelho quando apanha. */
function sprite(estagio: number, quadro: number, lado: 1 | -1, vermelho: boolean): HTMLCanvasElement {
  const chave = `${estagio}:${quadro}:${lado}:${vermelho}`;
  let c = cacheSprites.get(chave);
  if (!c) {
    c = canvasDaImagem(montarBruxaMC(quadro, estagio), lado < 0);
    if (vermelho) {
      const ctx = c.getContext('2d')!;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,30,30,0.55)';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';
    }
    cacheSprites.set(chave, c);
  }
  return c;
}

/** A cor misturada com preto (`k` de 0 a 1): o fundo escuro do líquido. */
function escurecer(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const canal = (s: number) => Math.round(((n >> s) & 255) * (1 - k)).toString(16).padStart(2, '0');
  return `#${canal(16)}${canal(8)}${canal(0)}`;
}

const cacheItens = new Map<Item, Item>();
/** O item com o contorno escuro, guardado (o `miniatura` guarda pelo objeto). */
function contornado(it: Item): Item {
  let c = cacheItens.get(it);
  if (!c) { c = comContorno(it); cacheItens.set(it, c); }
  return c;
}

const cacheGarrafas = new Map<string, Item>();
/** A garrafa de poção do jogo com o líquido da poção. */
function garrafa(cor: string, clara: string): HTMLCanvasElement {
  let it = cacheGarrafas.get(cor);
  if (!it) {
    it = contornado({ nome: cor, linhas: GARRAFA, cores: coresDaPocao(cor, clara, escurecer(cor, 0.45)) });
    cacheGarrafas.set(cor, it);
  }
  return miniatura(it)[0];
}

let teiaPronta: HTMLCanvasElement | null = null;
/** A teia de aranha do jogo: oito fios e dois anéis, com sombra para ler no claro. */
function teia(): HTMLCanvasElement {
  if (teiaPronta) return teiaPronta;
  const N = 21, m = 10;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d')!;
  const fios: [number, number][] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    for (let r = 0; r <= m; r++) fios.push([Math.round(m + Math.cos(a) * r), Math.round(m + Math.sin(a) * r)]);
  }
  for (const r of [4, 8]) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      // O anel do jogo é meio torto.
      const rr = r + (i % 5 === 0 ? 1 : 0);
      fios.push([Math.round(m + Math.cos(a) * rr), Math.round(m + Math.sin(a) * rr)]);
    }
  }
  ctx.fillStyle = 'rgba(40,44,52,0.55)';
  for (const [x, y] of fios) ctx.fillRect(x + 1, y + 1, 1, 1);
  ctx.fillStyle = '#e8ecf2';
  for (const [x, y] of fios) ctx.fillRect(x, y, 1, 1);
  teiaPronta = c;
  return c;
}

export class PalcoChefona {
  readonly raiz: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly c: CanvasRenderingContext2D;
  private readonly caixa: HTMLDivElement;
  private readonly caixaCaldeirao: HTMLDivElement;
  private readonly barra: HTMLDivElement;
  private readonly escala: number;
  private readonly alvos: AlvosFeitico;
  private readonly aoEvento?: (e: EventoChefona) => void;
  private larg = 0;
  private alt = 0;
  private observador: ResizeObserver | null = null;
  private quadroRaf = 0;
  private antes = 0;

  private fase: Fase = 'fora';
  private corpo: Corpo | null = null;
  private vida = 0;
  private vidaMax = VIDA_PADRAO;
  private prazo = PRAZO_PADRAO_S;
  private tempo = 0;
  private relogio = 0;
  private furia = false;
  private tFase = 0;
  private dorAte = 0;
  /** Esta tela acertou ao menos um tiro (nela ou no caldeirão): ganha a conquista. */
  private ajudei = false;
  private relogioConquista: ReturnType<typeof setTimeout> | undefined;
  private ultimaDor = 0;
  private estagioVisto = 0;
  private acertos: number[] = [];
  private folgaManobra = 0;
  private ultimaManobra: Manobra | null = null;
  private proximoFeitico = PRIMEIRO_FEITICO_S;
  private proximoForte = PRIMEIRO_FORTE_S;
  private ultimoFeitico: NomeFeitico | null = null;
  private conjuro: { feitico: NomeFeitico; dano: number } | null = null;
  private voando: Garrafa | null = null;
  private ativos = new Map<NomeFeitico, { desfazer: () => void }>();
  private particulas: Particula[] = [];
  private aneis: Anel[] = [];
  private clarao = 0;
  private sobraRastro = 0;
  private caldeirao: Caldeirao | null = null;
  private cura: Cura | null = null;
  private curasFeitas = 0;
  private mesa: Mesa | null = null;
  private runas: RunaVoando[] = [];
  private teias: Teia[] = [];
  private queda: Queda | null = null;
  private drops: Drop[] = [];
  private orbes: Orbe[] = [];
  private tremeAte = 0;
  private chegaEm = 0;
  private segContagem = -1;
  private hudContagem: HTMLDivElement | null = null;
  private letreiros: HTMLDivElement[] = [];
  /** Câmera lenta (1 = normal). Só no laboratório. */
  lenta = 1;

  constructor(host: HTMLElement, opcoes: OpcoesChefona = {}) {
    this.escala = opcoes.escala ?? ESCALA_CHEFONA;
    this.alvos = opcoes.alvos ?? alvosPorAtributo();
    this.aoEvento = opcoes.aoEvento;
    this.raiz = document.createElement('div');
    this.raiz.className = 'bxc-palco';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bxc-canvas';
    this.caixa = this.novaCaixa(`A ${NOME_CHEFONA}! Atire nela`, (x, y) => this.atirar(x, y));
    this.caixaCaldeirao = this.novaCaixa('O caldeirão! Atire para quebrar', () => this.atirarCaldeirao(true));
    this.barra = document.createElement('div');
    this.barra.className = 'bxc-barra';
    this.barra.hidden = true;
    this.barra.innerHTML = '<div class="bxc-nome"></div><div class="bxc-vida"><i></i><b></b><span></span></div><div class="bxc-tempo"></div>';
    this.barra.querySelector('.bxc-nome')!.textContent = NOME_CHEFONA;
    this.raiz.append(this.canvas, this.caixaCaldeirao, this.caixa, this.barra);
    host.appendChild(this.raiz);
    this.c = this.canvas.getContext('2d')!;
    this.medir();
    this.observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.medir()) : null;
    this.observador?.observe(this.raiz);
    // O sprite fica pronto antes de ela entrar: o primeiro quadro não engasga.
    sprite(0, 0, 1, false);
  }

  private novaCaixa(rotulo: string, aoTiro: (x: number, y: number) => void): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'bxc-caixa';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', rotulo);
    el.style.display = 'none';
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      aoTiro(e.clientX, e.clientY);
    });
    return el;
  }

  // ── Tamanho e zona ───────────────────────────────────────────────────────

  private medir(): void {
    const w = Math.max(1, Math.ceil(this.raiz.clientWidth / this.escala));
    const h = Math.max(1, Math.ceil(this.raiz.clientHeight / this.escala));
    if (w === this.larg && h === this.alt) return;
    this.larg = w;
    this.alt = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${w * this.escala}px`;
    this.canvas.style.height = `${h * this.escala}px`;
    this.c.imageSmoothingEnabled = false;
  }

  private zona(): Zona {
    // Abaixo da barra de chefe e do aviso (uns 130 px da tela): ela nunca some atrás deles.
    const y0 = Math.max(ALT / 2 + 22, Math.round(190 / this.escala));
    const chao = this.alt - 8;
    return {
      x0: LARG / 2 + 8, x1: Math.max(LARG, this.larg - LARG / 2 - 8),
      y0, y1: Math.max(y0 + 10, Math.min(chao - ALT / 2 - 30, this.alt * 0.62)), chao,
    };
  }

  private get fracao(): number {
    return Math.max(0, this.vida) / this.vidaMax;
  }

  private get estagio(): number {
    return estagioDoDano(this.fracao);
  }

  get estado() {
    return {
      fase: this.fase, vida: Math.max(0, Math.round(this.vida)), vidaMax: this.vidaMax, furia: this.furia,
      feiticos: [...this.ativos.keys()], restante: Math.max(0, this.prazo - this.tempo),
      estagio: this.estagio, forca: forcaDoFeitico(this.fracao),
      contagem: this.fase === 'chegando' ? Math.max(0, Math.ceil((this.chegaEm - performance.now()) / 1000)) : 0,
      caldeirao: this.caldeirao ? this.caldeirao.pontos : null,
      drops: this.drops.length, orbes: this.orbes.length,
    };
  }

  // ── Comandos ─────────────────────────────────────────────────────────────

  /** Solta a Bruxa: a contagem (se houver) e depois ela. Soltar de novo recomeça. */
  soltar(o: { vida?: number; prazoS?: number; esperaS?: number } = {}): void {
    this.limpar();
    this.medir();
    this.vidaMax = o.vida ?? VIDA_PADRAO;
    this.vida = this.vidaMax;
    this.prazo = o.prazoS ?? PRAZO_PADRAO_S;
    const espera = o.esperaS ?? ESPERA_PADRAO_S;
    if (espera > 0) {
      this.chegaEm = performance.now() + espera * 1000;
      this.mudarFase('chegando');
      this.montarContagem();
      this.aoEvento?.({ tipo: 'chegando', segundos: espera });
      this.acordar();
      return;
    }
    this.entrar();
  }

  /** O laboratório pula o resto da contagem. */
  pularContagem(): void {
    if (this.fase === 'chegando') this.chegaEm = performance.now();
  }

  private entrar(): void {
    this.desmontarContagem();
    this.tempo = 0;
    this.furia = false;
    this.curasFeitas = 0;
    this.estagioVisto = 0;
    this.ajudei = false;
    this.proximoFeitico = PRIMEIRO_FEITICO_S;
    this.proximoForte = PRIMEIRO_FORTE_S;
    this.corpo = criarCorpo(this.zona(), Math.random);
    this.mudarFase('entrando');
    this.barra.hidden = false;
    this.barra.classList.remove('furia');
    this.caixa.style.display = '';
    somPuf();
    setTimeout(somGargalhada, 200);
    this.aviso(`A ${NOME_CHEFONA} chegou!`, 'Atire nela antes que ela jogue poção no Gestão');
    this.aoEvento?.({ tipo: 'entrou' });
    this.acordar();
  }

  /** Tiro de outra pessoa (os robôs do laboratório): numa peça sorteada, ou no caldeirão. */
  tiroDeOutro(): void {
    const corpo = this.corpo;
    if (!corpo || !this.atingivel()) return;
    if (this.caldeirao && !this.caldeirao.saindo && Math.random() < 0.35) { this.atirarCaldeirao(false); return; }
    if (invulneravel(corpo)) {
      if (Math.random() < 0.25) this.letreiro('ESQUIVOU!', corpo.x, corpo.y - 20, 'esquiva');
      return;
    }
    const sorte = Math.random();
    const parte: NomeParte = sorte < 0.2 ? 'cabeca' : sorte < 0.65 ? 'tronco' : sorte < 0.85 ? 'bracoFrente' : 'chapeu';
    this.ferir(parte, this.pontoDaParte(parte), false);
  }

  /** Tira uma fração da vida de uma vez (o «arrancar» do laboratório). */
  arrancar(fracao: number): void {
    if (!this.corpo || !this.atingivel()) return;
    this.vida -= this.vidaMax * fracao;
    this.doer();
    this.depoisDoDano();
  }

  /** Joga uma poção já (o laboratório escolhe qual). */
  conjurar(f?: NomeFeitico): void {
    if (!this.corpo || !['voando', 'entrando'].includes(this.fase)) return;
    this.corpo.manobra = null;
    this.corpo.visivel = true;
    this.iniciarConjuro(f);
  }

  /** Faz uma manobra já. */
  manobrar(m?: Manobra): void {
    if (!this.corpo || this.fase !== 'voando') return;
    this.fazerManobra(m);
  }

  /** Põe o caldeirão já. */
  curar(): void {
    if (!this.corpo || !['voando', 'entrando'].includes(this.fase)) return;
    this.corpo.manobra = null;
    this.corpo.visivel = true;
    this.iniciarCura();
  }

  enfurecer(): void {
    if (!this.corpo || this.furia || !this.atingivel()) return;
    this.entrarNaFuria();
  }

  /** O prazo acabou: ela gargalha e vai embora. */
  fugir(): void {
    if (this.fase === 'chegando') { this.limpar(); return; }
    if (!this.corpo || ['fora', 'caindo', 'tombando', 'fugindo'].includes(this.fase)) return;
    this.corpo.manobra = null;
    this.corpo.visivel = true;
    this.conjuro = null;
    this.voando = null;
    this.encerrarCaldeirao(false);
    this.encerrarMesa();
    this.mudarFase('fugindo');
    somGargalhada();
    this.aviso('Ela fugiu!', 'A bruxa voltou para a cabana do pântano');
    this.caixa.style.display = 'none';
  }

  /** Apaga tudo e desfaz toda poção. */
  limpar(): void {
    this.desfazerTodos();
    clearTimeout(this.relogioConquista);
    this.raiz.querySelectorAll('.bxc-conquista').forEach(a => a.remove());
    this.desmontarContagem();
    this.fase = 'fora';
    this.corpo = null;
    this.conjuro = null;
    this.voando = null;
    this.queda = null;
    this.caldeirao = null;
    this.cura = null;
    this.mesa = null;
    this.runas = [];
    this.teias = [];
    this.drops = [];
    this.orbes = [];
    this.particulas = [];
    this.aneis = [];
    this.acertos = [];
    this.caixa.style.display = 'none';
    this.caixaCaldeirao.style.display = 'none';
    this.barra.hidden = true;
    for (const l of this.letreiros) l.remove();
    this.letreiros = [];
    this.raiz.querySelectorAll('.bxc-aviso, .bxc-numerao').forEach(a => a.remove());
    this.c.clearRect(0, 0, this.larg, this.alt);
  }

  destruir(): void {
    this.limpar();
    cancelAnimationFrame(this.quadroRaf);
    this.observador?.disconnect();
    this.raiz.remove();
  }

  // ── A contagem ───────────────────────────────────────────────────────────

  private montarContagem(): void {
    this.desmontarContagem();
    const el = document.createElement('div');
    el.className = 'bxc-contagem';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="bxc-contagem-meio"><div class="bxc-contagem-titulo"></div>'
      + '<div class="bxc-contagem-relogio"></div>'
      + '<div class="bxc-contagem-linha">Prepare a mira: todo mundo atira junto na mesma vida.</div></div>';
    el.querySelector('.bxc-contagem-titulo')!.textContent = `A ${NOME_CHEFONA.toUpperCase()} ESTÁ CHEGANDO`;
    const cabeca = canvasDaImagem(cabecaMC(), false);
    cabeca.className = 'bxc-contagem-cabeca';
    cabeca.style.width = `${cabeca.width * 4}px`;
    cabeca.style.height = `${cabeca.height * 4}px`;
    el.prepend(cabeca);
    this.raiz.appendChild(el);
    this.hudContagem = el;
    this.segContagem = -1;
  }

  private desmontarContagem(): void {
    this.hudContagem?.remove();
    this.hudContagem = null;
  }

  private passoContagem(): void {
    const falta = Math.max(0, this.chegaEm - performance.now());
    const seg = Math.ceil(falta / 1000);
    if (seg !== this.segContagem) {
      this.segContagem = seg;
      const relogio = this.hudContagem?.querySelector('.bxc-contagem-relogio');
      if (relogio) {
        relogio.textContent = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
        relogio.classList.toggle('urgente', seg <= TIQUE_S);
      }
      if (seg >= 1 && seg <= TIQUE_S) somTique(seg <= 3);
      if (seg >= 1 && seg <= NUMERAO_S) {
        this.raiz.querySelectorAll('.bxc-numerao').forEach(n => n.remove());
        const n = document.createElement('div');
        n.className = 'bxc-numerao';
        n.setAttribute('aria-hidden', 'true');
        n.textContent = String(seg);
        this.raiz.appendChild(n);
        setTimeout(() => n.remove(), 1000);
      }
    }
    if (falta <= 0) this.entrar();
  }

  // ── O tiro ───────────────────────────────────────────────────────────────

  private atingivel(): boolean {
    return ['entrando', 'voando', 'conjurando', 'tonta', 'curando'].includes(this.fase);
  }

  private quadroAtual(): number {
    const f = Math.max(0, Math.floor((this.relogio * 1000) / 160));
    if (['conjurando', 'tonta', 'fugindo', 'caindo', 'tombando'].includes(this.fase)
      || (this.fase === 'curando' && this.cura?.etapa === 'bebendo')) return PRIMEIRO_RINDO_MC + (f % 2);
    return f % QUADROS_FLUTUANDO;
  }

  private centroSprite(): { x: number; y: number } {
    const corpo = this.corpo!;
    const flutua = !['caindo', 'tombando', 'curando'].includes(this.fase);
    return { x: corpo.x, y: corpo.y + (flutua ? balanco(this.relogio) : 0) };
  }

  /** Ponto da tela (px da arte) → pixel do sprite, desfazendo giro e espelho. */
  private paraSprite(wx: number, wy: number): { lx: number; ly: number } {
    const corpo = this.corpo!;
    const s = this.centroSprite();
    const dx = wx - s.x, dy = wy - s.y;
    const cos = Math.cos(-corpo.giro), sin = Math.sin(-corpo.giro);
    let lx = Math.floor(dx * cos - dy * sin + LARG / 2);
    const ly = Math.floor(dx * sin + dy * cos + ALT / 2);
    if (corpo.lado < 0) lx = LARG - 1 - lx;
    return { lx, ly };
  }

  /** Pixel do sprite → ponto da tela (px da arte). */
  private paraTela(lx: number, ly: number): { x: number; y: number } {
    const corpo = this.corpo!;
    const s = this.centroSprite();
    const px = (corpo.lado < 0 ? LARG - 1 - lx : lx) - LARG / 2;
    const py = ly - ALT / 2;
    const cos = Math.cos(corpo.giro), sin = Math.sin(corpo.giro);
    return { x: s.x + px * cos - py * sin, y: s.y + px * sin + py * cos };
  }

  private pontoDaParte(p: NomeParte): { x: number; y: number } {
    const c = centroDaParte(imagemDoQuadro(this.quadroAtual()), NUMERO_DA_PARTE[p]);
    return this.paraTela(c.x, c.y);
  }

  private atirar(clientX: number, clientY: number): void {
    const corpo = this.corpo;
    if (!corpo || !this.atingivel()) return;
    const r = this.raiz.getBoundingClientRect();
    const wx = (clientX - r.left) / this.escala, wy = (clientY - r.top) / this.escala;
    if (invulneravel(corpo) || !corpo.visivel) {
      somTiro();
      somVento();
      this.letreiro('ESQUIVOU!', wx, wy - 6, 'esquiva');
      this.aoEvento?.({ tipo: 'esquivou', manobra: corpo.manobra?.tipo ?? 'perola' });
      return;
    }
    const { lx, ly } = this.paraSprite(wx, wy);
    const num = parteNoPonto(imagemDoQuadro(this.quadroAtual()), lx, ly);
    if (!num) {
      furo(clientX, clientY);
      this.aoEvento?.({ tipo: 'errou' });
      return;
    }
    somTiro();
    this.ferir(PARTE_DO_NUMERO[num]!, { x: wx, y: wy }, true);
  }

  private ferir(parte: NomeParte, onde: { x: number; y: number }, meu: boolean): void {
    const alvo = alvoDaParte(parte);
    let dano = DANO[alvo];
    if (this.fase === 'conjurando') dano *= MULT_CONJURANDO;
    if (this.fase === 'tonta') dano *= MULT_TONTA;
    this.vida -= dano;
    if (meu) this.ajudei = true;
    this.doer();
    // O empurrão do golpe, como no jogo (só voando: na manobra e na cura ela está presa ao caminho).
    const corpo = this.corpo!;
    if (this.fase === 'voando') corpo.x += Math.sign(corpo.x - onde.x || 1) * 1.5;
    // As lascas do «bloco» que ela é: pedacinhos do manto.
    for (let i = 0; i < (meu ? 6 : 2); i++) {
      this.particula({
        x: onde.x, y: onde.y, vx: entre(-60, 60), vy: entre(-80, 0), vida: entre(0.35, 0.7),
        cor: sorteia(CORES_MANTO), tam: PIXEL_MC, g: GRAVIDADE, forma: 'ponto',
      });
    }
    if (alvo === 'cabeca') {
      // O crítico do jogo: as estrelinhas que espirram em leque.
      for (let i = 0; i < (meu ? 10 : 4); i++) {
        this.particula({
          x: onde.x, y: onde.y, vx: entre(-90, 90), vy: entre(-110, -20), vida: entre(0.4, 0.7),
          cor: sorteia(CORES_CRITICO), tam: 1, g: 160, forma: 'cruz',
        });
      }
    }
    if (meu) {
      if (alvo === 'cabeca') { somCerebro(); this.letreiro('CRÍTICO!', onde.x, onde.y - 8, 'hs'); } else somAcerto();
      if (alvo === 'chapeu') this.letreiro('NO CHAPÉU!', onde.x, onde.y - 8, 'dano');
      else this.letreiro(`-${Math.round(dano)}`, onde.x + entre(-6, 6), onde.y - 4, 'dano');
    }
    this.aoEvento?.({ tipo: 'acertou', dano, parte, vida: Math.max(0, this.vida), meu });
    if (this.conjuro) this.conjuro.dano += dano;
    this.acertos.push(this.tempo);
    this.depoisDoDano();
  }

  /** O vermelho do dano e o «hmf» (o som não repete em rajada). */
  private doer(): void {
    const agora = performance.now();
    this.dorAte = agora + DOR_MS;
    if (agora - this.ultimaDor > 220) { this.ultimaDor = agora; somDor(); }
  }

  private depoisDoDano(): void {
    if (this.vida <= 0) { this.derrotar(); return; }
    // Rachou mais um estágio: as lascas grandes do bloco.
    if (this.estagio > this.estagioVisto) {
      this.estagioVisto = this.estagio;
      const c = this.corpo!;
      somBloco();
      this.estilhacos(c.x, c.y, CORES_MANTO, 24);
    }
    if (!this.furia && this.fracao <= FURIA_EM) this.entrarNaFuria();
    // A poção quebra se o time bater forte enquanto ela prepara.
    const limiar = this.conjuro?.feitico === FEITICO_FORTE ? QUEBRA_FORTE : QUEBRA_FEITICO;
    if (this.conjuro && this.conjuro.dano >= this.vidaMax * limiar) {
      const f = this.conjuro.feitico;
      this.conjuro = null;
      this.encerrarMesa();
      this.mudarFase('tonta');
      somBrava();
      somVidro();
      const c = this.corpo!;
      const mao = this.paraTelaMaoErguida();
      this.estourarGarrafa(mao.x, mao.y, f, 0.6);
      this.letreiro(f === FEITICO_FORTE ? 'ENCANTAMENTO QUEBRADO!' : 'POÇÃO QUEBRADA!', c.x, c.y - ALT / 2 - 6, 'quebra');
      this.aoEvento?.({ tipo: 'quebrou', feitico: f });
      return;
    }
    // Apanhou demais (ou na sorte): ela desvia.
    if (this.fase !== 'voando' || this.folgaManobra > 0) return;
    this.acertos = this.acertos.filter(t => this.tempo - t <= JANELA_S);
    const limiarDesvio = this.furia ? LIMIAR_DESVIO_FURIA : LIMIAR_DESVIO;
    const chance = this.furia ? CHANCE_DESVIO_FURIA : CHANCE_DESVIO;
    if (this.acertos.length >= limiarDesvio || Math.random() < chance) this.fazerManobra();
  }

  private fazerManobra(m?: Manobra): void {
    const corpo = this.corpo!;
    const tipo = m ?? escolherManobra(corpo, this.zona(), Math.random, this.ultimaManobra);
    iniciarManobra(corpo, tipo, this.zona(), Math.random);
    this.ultimaManobra = tipo;
    this.folgaManobra = FOLGA_MANOBRA_S;
    this.acertos = [];
    if (tipo === 'perola') somTeleporte(); else { somBeber(); somVento(); }
    this.efeito(corpo.x, corpo.y, [COR_MANOBRA[tipo], '#ffffff'], 18);
    this.letreiro(NOME_MANOBRA[tipo], corpo.x, corpo.y - ALT / 2 - 8, 'esquiva');
    this.aoEvento?.({ tipo: 'manobra', manobra: tipo });
  }

  private entrarNaFuria(): void {
    this.furia = true;
    this.barra.classList.add('furia');
    somBrava();
    setTimeout(somGargalhada, 250);
    const c = this.corpo!;
    this.letreiro('FÚRIA!', c.x, c.y - ALT / 2 - 8, 'quebra');
    this.proximoFeitico = Math.min(this.proximoFeitico, 3);
    this.aoEvento?.({ tipo: 'furia' });
  }

  // ── O caldeirão ──────────────────────────────────────────────────────────

  private iniciarCura(): void {
    const z = this.zona();
    const corpo = this.corpo!;
    this.curasFeitas += 1;
    const folga = LARGURA_CALDEIRAO / 2 + LARG + 4;
    this.caldeirao = {
      x: Math.max(folga, Math.min(this.larg - folga, corpo.x + corpo.lado * 40)),
      pontos: PONTOS_CALDEIRAO, tremor: 0, t: 0, aparecendo: 0, saindo: false,
    };
    this.cura = { etapa: 'indo', curado: 0, total: this.vidaMax * CURA_FRACAO, proximoNumero: 0, proximoGole: 0 };
    this.efeito(this.caldeirao.x, z.chao - 8, CORES_CURA, 24);
    somCaldeirao();
    this.mudarFase('curando');
    this.aviso('O caldeirão!', 'Ela vai beber a Poção de Cura: quebre o caldeirão a tiro');
    this.letreiro('POÇÃO DE CURA!', corpo.x, corpo.y - ALT / 2 - 8, 'cura');
    this.aoEvento?.({ tipo: 'caldeirao' });
  }

  /** Onde ela fica para beber: ao lado do caldeirão, com o pé no chão. */
  private alvoDaCura(): { x: number; y: number } {
    const z = this.zona();
    const cal = this.caldeirao!;
    const lado = this.corpo!.x <= cal.x ? -1 : 1;
    return { x: cal.x + lado * (LARGURA_CALDEIRAO / 2 + LARG / 2 - 2), y: z.chao - ALT / 2 };
  }

  private passoCura(dt: number): void {
    const corpo = this.corpo!;
    const cura = this.cura!;
    const cal = this.caldeirao!;
    const alvo = this.alvoDaCura();
    if (cura.etapa === 'indo') {
      const k = Math.min(1, dt * 2.6);
      corpo.vx = (alvo.x - corpo.x) * 2.6;
      corpo.x += (alvo.x - corpo.x) * k;
      corpo.y += (alvo.y - corpo.y) * k;
      // Olha para o caldeirão.
      corpo.lado = cal.x >= corpo.x ? 1 : -1;
      if (Math.hypot(alvo.x - corpo.x, alvo.y - corpo.y) < 3 && cal.aparecendo >= 1) {
        cura.etapa = 'bebendo';
        somGargalhada();
      }
      return;
    }
    // Bebendo: a garrafa na boca, as partículas da cura e a vida voltando.
    corpo.x = alvo.x;
    corpo.y = alvo.y;
    corpo.lado = cal.x >= corpo.x ? 1 : -1;
    const passo = (cura.total / CURA_S) * dt;
    const falta = this.vidaMax - this.vida;
    const ganho = Math.min(passo, cura.total - cura.curado, falta);
    this.vida += ganho;
    cura.curado += passo;
    cura.proximoNumero -= dt;
    cura.proximoGole -= dt;
    if (cura.proximoNumero <= 0) {
      cura.proximoNumero = 0.6;
      this.letreiro(`+${Math.max(1, Math.round((cura.total / CURA_S) * 0.6))}`, corpo.x + entre(-8, 8), corpo.y - ALT / 2 - 4, 'cura');
    }
    if (cura.proximoGole <= 0) { cura.proximoGole = 1.1; somBeber(); setTimeout(somCura, 380); }
    if (Math.random() < dt * 30) {
      // As espirais da Poção de Cura subindo em volta dela.
      this.particula({
        x: corpo.x + entre(-LARG / 2, LARG / 2), y: corpo.y + entre(-ALT / 4, ALT / 2), vx: entre(-4, 4), vy: entre(-26, -12), vida: entre(0.6, 1),
        cor: sorteia(CORES_CURA), tam: 1, g: 0, forma: 'espiral',
      });
    }
    if (cura.curado >= cura.total || falta <= 0) this.encerrarCaldeirao(true);
  }

  private atirarCaldeirao(meu: boolean): void {
    const cal = this.caldeirao;
    if (!cal || cal.saindo || cal.aparecendo < 0.5) return;
    const z = this.zona();
    cal.pontos -= 1;
    cal.tremor = 2;
    const topo = z.chao - ALTURA_CALDEIRAO + 8;
    if (meu) { somTiro(); somBloco(); this.ajudei = true; }
    this.estilhacos(cal.x, topo + 8, CORES_FERRO, 5);
    if (meu) this.letreiro('TOC!', cal.x + entre(-8, 8), topo - 6, 'dano');
    if (cal.pontos <= 0) this.quebrarCaldeirao();
  }

  private quebrarCaldeirao(): void {
    const cal = this.caldeirao!;
    const z = this.zona();
    somBlocoQuebra();
    this.estilhacos(cal.x, z.chao - 16, CORES_FERRO, 36);
    for (let i = 0; i < 26; i++) {
      this.particula({
        x: cal.x + entre(-12, 12), y: z.chao - 26, vx: entre(-110, 110), vy: entre(-150, -30), vida: entre(0.8, 1.6),
        cor: sorteia(CORES_CURA), tam: sorteia([1, 2, 2]), g: GRAVIDADE, forma: 'ponto', gruda: true,
      });
    }
    this.letreiro('CALDEIRÃO QUEBRADO!', cal.x, z.chao - 46, 'quebra');
    this.caldeirao = null;
    this.cura = null;
    this.caixaCaldeirao.style.display = 'none';
    this.aoEvento?.({ tipo: 'caldeiraoQuebrado' });
    if (this.fase === 'curando') {
      somBrava();
      this.mudarFase('tonta');
    }
  }

  /** A cura acabou (bebeu tudo) ou foi interrompida (fuga, morte): o caldeirão some. */
  private encerrarCaldeirao(bebeu: boolean): void {
    if (this.caldeirao) {
      this.caldeirao.saindo = true;
      this.efeito(this.caldeirao.x, this.zona().chao - 10, CORES_FUMACA, 16);
    }
    this.caixaCaldeirao.style.display = 'none';
    if (bebeu && this.corpo) {
      this.cura = null;
      somGargalhada();
      this.aviso('Ela bebeu a Poção de Cura!', `Recuperou ${Math.round(CURA_FRACAO * 100)}% da vida`);
      this.aoEvento?.({ tipo: 'curou', vida: Math.round(this.vida) });
      novoAlvo(this.corpo, this.zona(), Math.random);
      this.mudarFase('voando');
    }
    this.cura = null;
  }

  // ── As poções ────────────────────────────────────────────────────────────

  private iniciarConjuro(forcado?: NomeFeitico): void {
    const forteLiberado = this.tempo >= this.proximoForte;
    const possiveis = LISTA_FEITICOS.filter(f => f !== this.ultimoFeitico && !this.ativos.has(f)
      && (f !== FEITICO_FORTE || forteLiberado) && disponivel(f, this.alvos));
    // O forte, quando liberado, sai na frente dos outros na metade das vezes.
    const comuns = possiveis.filter(p => p !== FEITICO_FORTE);
    const f = forcado ?? (possiveis.includes(FEITICO_FORTE) && Math.random() < 0.5
      ? FEITICO_FORTE
      : possiveis.length ? sorteia(comuns.length ? comuns : possiveis) : null);
    if (!f) { this.proximoFeitico = 4; return; }
    if (f === FEITICO_FORTE) this.proximoForte = this.tempo + ENTRE_FORTES_S;
    this.ultimoFeitico = f;
    this.conjuro = { feitico: f, dano: 0 };
    this.mudarFase('conjurando');
    const c = this.corpo!;
    const nivel = nivelDaPocao(forcaDoFeitico(this.fracao));
    if (f === FEITICO_FORTE) {
      somEncantamento();
      this.mesa = { x: c.x, t: 0, aparecendo: 0, saindo: false };
      this.letreiro('ENCANTAMENTO!', c.x, c.y - ALT / 2 - 10, 'quebra');
      this.aviso('Ela está encantando a tela!', 'Atirem nela agora para quebrar o Encantamento');
    } else {
      somGargalhada();
      this.letreiro(`${FEITICOS[f].titulo.toUpperCase()} ${nivel}`, c.x, c.y - ALT / 2 - 8, 'feitico');
    }
    this.aoEvento?.({ tipo: 'conjurando', feitico: f });
  }

  private duracaoDoConjuro(): number {
    return this.conjuro?.feitico === FEITICO_FORTE ? CONJURO_FORTE_S : CONJURO_S;
  }

  /** O preparo terminou sem quebrar: a garrafa sai voando (ou a onda do Encantamento). */
  private soltarFeitico(): void {
    const f = this.conjuro!.feitico;
    this.conjuro = null;
    if (f === FEITICO_FORTE) {
      // O forte não tem garrafa: a onda sai dela e varre a tela inteira.
      const c = this.corpo!;
      somOnda();
      this.anel(c.x, c.y, FEITICOS[f].corClara, 420, 1.1);
      this.anel(c.x, c.y, FEITICOS[f].cor, 300, 1.3);
      this.clarao = 0.4;
      this.tremeAte = performance.now() + 500;
      this.aplicarFeitico(f);
      this.encerrarMesa();
      this.mudarFase('voando');
      return;
    }
    const el = alvoDaPocao(f, this.alvos);
    const ate = el && el !== this.alvos.raiz() ? this.centroDoElemento(el) : { x: this.larg / 2 + entre(-40, 40), y: this.alt * 0.55 };
    const de = this.paraTelaMaoErguida();
    const dist = Math.hypot(ate.x - de.x, ate.y - de.y);
    this.voando = { feitico: f, t: 0, dura: 0.55 + Math.min(0.6, dist / 500), de, ate, altura: 30 + dist * 0.25 };
    somArremesso();
    this.mudarFase('voando');
  }

  private aplicarFeitico(f: NomeFeitico): void {
    const forca = forcaDoFeitico(this.fracao);
    const duracaoMs = duracaoDoFeitico(f, forca);
    // As abas não aguentam dois nomes de uma vez: a nova tira a velha.
    if (f === 'encantamento') this.ativos.get('estranha')?.desfazer();
    if (f === 'estranha') this.ativos.get('encantamento')?.desfazer();
    const l = lancar(f, this.alvos, Math.random, forca);
    const raiz = this.alvos.raiz();
    const info = FEITICOS[f];
    for (const el of l.atingidos.slice(0, 12)) {
      if (el === raiz) continue;
      const p = this.centroDoElemento(el);
      this.efeito(p.x, p.y, [info.cor, info.corClara], 10);
    }
    let desfazer = l.desfazer;
    if (f === 'lentidao') {
      const agora = performance.now();
      const pontos = l.atingidos.filter(el => el !== raiz).map(el => this.centroDoElemento(el));
      while (pontos.length < 4) pontos.push({ x: entre(20, this.larg - 20), y: entre(this.alt * 0.25, this.alt * 0.85) });
      this.teias = pontos.map(p => ({ x: p.x, y: p.y, nasceu: agora + entre(0, 300), ate: agora + duracaoMs }));
      desfazer = () => { l.desfazer(); this.teias = []; };
    }
    this.registrar(f, desfazer, duracaoMs);
    const nivel = nivelDaPocao(forca);
    const fraca = nivel === 'I' ? ' · fraca: ela está rachando' : '';
    this.aviso(f === FEITICO_FORTE ? info.titulo : `${info.titulo} ${nivel}`, `${info.encanto} (${Math.round(duracaoMs / 1000)} s${fraca})`);
    this.aoEvento?.({ tipo: 'feitico', feitico: f, forca, duracaoMs });
  }

  private registrar(f: NomeFeitico, desfazer: () => void, duracaoMs: number): void {
    this.ativos.get(f)?.desfazer();
    let feito = false;
    const desfazerUmaVez = () => {
      if (feito) return;
      feito = true;
      clearTimeout(relogio);
      desfazer();
      if (this.ativos.get(f)?.desfazer === desfazerUmaVez) this.ativos.delete(f);
    };
    const relogio = setTimeout(desfazerUmaVez, duracaoMs);
    this.ativos.set(f, { desfazer: desfazerUmaVez });
  }

  private desfazerTodos(): void {
    for (const a of [...this.ativos.values()]) a.desfazer();
    this.ativos.clear();
    this.teias = [];
  }

  private centroDoElemento(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    const base = this.raiz.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - base.left) / this.escala, y: (r.top + r.height / 2 - base.top) / this.escala };
  }

  /** A garrafa estoura: cacos de vidro e a nuvem da poção abrindo em roda. */
  private estourarGarrafa(x: number, y: number, f: NomeFeitico, forca = 1): void {
    const info = FEITICOS[f];
    for (let i = 0; i < 10 * forca; i++) {
      this.particula({ x, y, vx: entre(-90, 90), vy: entre(-120, -20), vida: entre(0.4, 0.8), cor: sorteia(['#ffffff', '#cfe6f2', '#a0c8e0']), tam: 1, g: GRAVIDADE, forma: 'ponto' });
    }
    const n = Math.round(24 * forca);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + entre(-0.1, 0.1), v = entre(40, 90) * forca;
      this.particula({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 10, vida: entre(0.6, 1.1), cor: k % 3 ? info.cor : info.corClara, tam: 1, g: -6, forma: 'espiral' });
    }
    this.anel(x, y, info.corClara, 90 * forca, 0.45);
  }

  // ── A mesa de encantamento ───────────────────────────────────────────────

  private encerrarMesa(): void {
    if (this.mesa) this.mesa.saindo = true;
  }

  private passoMesa(dt: number): void {
    const m = this.mesa;
    if (!m) return;
    m.t += dt;
    if (m.saindo) {
      m.aparecendo -= dt * 2.5;
      if (m.aparecendo <= 0) this.mesa = null;
      return;
    }
    m.aparecendo = Math.min(1, m.aparecendo + dt * 3);
    // As runas saem de longe e voam para o livro, como das estantes no jogo.
    if (Math.random() < dt * 22) {
      const livro = this.livroDaMesa();
      const a = Math.random() * Math.PI, r = entre(40, 80);
      this.runas.push({
        de: { x: livro.x + Math.cos(a) * r, y: livro.y - Math.sin(a) * r * 0.6 },
        t: 0, dura: entre(0.7, 1.1), letra: sorteia(letrasComRuna(ENCANTO)),
      });
    }
  }

  private livroDaMesa(): { x: number; y: number } {
    return { x: this.mesa?.x ?? this.larg / 2, y: this.zona().chao - 12 * PIXEL_MC - 10 };
  }

  // ── O fim ────────────────────────────────────────────────────────────────

  /** Vida zero: a morte do Minecraft. Vermelha, cai, tomba, «puf», drops. */
  private derrotar(): void {
    this.vida = 0;
    this.conjuro = null;
    this.voando = null;
    const corpo = this.corpo!;
    corpo.manobra = null;
    corpo.visivel = true;
    corpo.giro = 0;
    if (this.caldeirao) this.quebrarCaldeirao();
    this.encerrarCaldeirao(false);
    this.encerrarMesa();
    this.desfazerTodos();
    this.mudarFase('caindo');
    this.caixa.style.display = 'none';
    this.pausa(160);
    somMorte();
    this.queda = { vx: Math.max(-40, Math.min(40, corpo.vx * 0.4)), vy: -60 };
    this.aviso(`A ${NOME_CHEFONA} foi abatida`, 'pelo time do Gestão. As poções se desfizeram');
    this.aoEvento?.({ tipo: 'derrotada', segundos: this.tempo });
    // Quem ajudou ganha a conquista, depois do «puf» (como no jogo, quando o mob some).
    if (this.ajudei) this.relogioConquista = setTimeout(() => this.mostrarConquista(), (TOMBO_S + DEITADA_S) * 1000 + 900);
  }

  private pausaAte = 0;
  private pausa(ms: number): void {
    this.pausaAte = performance.now() + ms;
  }

  /** A queda até o chão (sem a levitação) e o tombo de lado. */
  private passoQueda(): void {
    const corpo = this.corpo!;
    if (this.fase === 'caindo') return;
    // Tombando: gira 90° em volta do pé, para o lado de onde olha.
    const u = Math.min(1, this.tFase / TOMBO_S);
    corpo.giro = corpo.lado * (Math.PI / 2) * suave(u);
    if (this.tFase >= TOMBO_S + DEITADA_S) this.sumirEmFumaca();
  }

  private passoCaindo(dt: number): void {
    const corpo = this.corpo!;
    const q = this.queda!;
    const chaoY = this.zona().chao - ALT / 2;
    q.vy += GRAVIDADE * dt;
    corpo.x += q.vx * dt;
    corpo.y += q.vy * dt;
    corpo.x = Math.max(LARG / 2 + ALT, Math.min(this.larg - LARG / 2 - ALT, corpo.x));
    if (corpo.y < chaoY) return;
    corpo.y = chaoY;
    somBloco();
    this.tremeAte = performance.now() + 200;
    this.estilhacos(corpo.x, this.zona().chao - 2, ['#7a6a5a', '#9a8a7a', '#5a4a3a'], 12);
    this.mudarFase('tombando');
  }

  /** O «puf» de fumaça branca, os drops e o XP. */
  private sumirEmFumaca(): void {
    const corpo = this.corpo!;
    const z = this.zona();
    // Deitada, o meio do corpo fica ao lado do pé.
    const cx = corpo.x + corpo.lado * (LARG / 2 + ALT / 2), cy = z.chao - LARG / 2;
    somPufMorte();
    for (let i = 0; i < 34; i++) {
      this.particula({
        x: cx + entre(-ALT / 2, ALT / 2), y: cy + entre(-LARG / 2, LARG / 4), vx: entre(-14, 14), vy: entre(-30, -6),
        vida: entre(0.6, 1.2), cor: sorteia(CORES_FUMACA), tam: sorteia([2, 3, 4]), g: -10, forma: 'ponto',
      });
    }
    // Cada drop sai 0 ou 1 vez, como na tabela do jogo; nunca menos de dois.
    let itens = DROPS.filter(() => Math.random() < 0.5);
    if (itens.length < 2) itens = [...DROPS].sort(() => Math.random() - 0.5).slice(0, 2);
    this.drops = itens.map(item => ({ item, x: cx + entre(-16, 16), y: cy, vx: entre(-90, 90), vy: entre(-120, -60), t: 0, fase: Math.random() * 6, noChao: false }));
    this.orbes = Array.from({ length: ORBES_XP }, () => ({
      x: cx + entre(-8, 8), y: cy, vx: entre(-70, 70), vy: entre(-140, -50), t: entre(0, 0.3), voando: false, tam: sorteia([2, 2, 3]), pegou: false,
    }));
    this.corpo = null;
    this.queda = null;
    this.fase = 'fora';
    this.barra.hidden = true;
  }

  private passoDrops(dt: number): void {
    const chao = this.zona().chao;
    for (const d of this.drops) {
      d.t += dt;
      if (d.noChao) continue;
      d.vy += GRAVIDADE * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y >= chao - 9) { d.y = chao - 9; d.noChao = true; }
    }
    this.drops = this.drops.filter(d => d.t < DROPS_S);
    // O XP: pula, quica no chão e depois voa para a barra, um «plim» cada.
    const destino = { x: this.larg / 2, y: Math.round(30 / this.escala) };
    for (const o of this.orbes) {
      o.t += dt;
      if (!o.voando) {
        o.vy += GRAVIDADE * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.y >= chao - 3) { o.y = chao - 3; o.vy = -Math.abs(o.vy) * 0.4; o.vx *= 0.6; }
        if (o.t > 1.4 + o.tam * 0.15) o.voando = true;
      } else {
        const dx = destino.x - o.x, dy = destino.y - o.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const v = 120 + Math.max(0, o.t - 1.4) * 260;
        o.x += (dx / d) * Math.min(d, v * dt);
        o.y += (dy / d) * Math.min(d, v * dt);
        if (d < 6) { o.pegou = true; somXp(); }
      }
    }
    this.orbes = this.orbes.filter(o => !o.pegou);
  }

  // ── O relógio ────────────────────────────────────────────────────────────

  private mudarFase(f: Fase): void {
    this.fase = f;
    this.tFase = 0;
  }

  private acordar(): void {
    if (this.quadroRaf) return;
    this.antes = performance.now();
    const passo = (agora: number) => {
      // O carimbo do quadro pode vir ANTES do `performance.now()` de quem acordou
      // o laço: sem o zero, o primeiro passo andava para trás.
      let dt = Math.max(0, Math.min(0.05, (agora - this.antes) / 1000)) * this.lenta;
      this.antes = agora;
      // O tranco do último tiro: o jogo congela um instante.
      if (agora < this.pausaAte) dt = 0;
      this.avancar(dt);
      this.desenhar(agora);
      if (this.vivo()) this.quadroRaf = requestAnimationFrame(passo);
      else { this.quadroRaf = 0; this.c.clearRect(0, 0, this.larg, this.alt); }
    };
    this.quadroRaf = requestAnimationFrame(passo);
  }

  private vivo(): boolean {
    return this.fase !== 'fora' || this.particulas.length > 0 || this.aneis.length > 0 || !!this.caldeirao
      || !!this.mesa || this.runas.length > 0 || this.teias.length > 0 || this.drops.length > 0 || this.orbes.length > 0;
  }

  private avancar(dt: number): void {
    this.relogio += dt;
    this.tFase += dt;
    this.folgaManobra = Math.max(0, this.folgaManobra - dt);
    this.clarao = Math.max(0, this.clarao - dt * 0.9);
    if (this.fase === 'chegando') { this.passoContagem(); return; }
    const corpo = this.corpo;
    const z = this.zona();
    if (corpo && this.atingivel()) {
      this.tempo += dt;
      if (this.tempo >= this.prazo) this.fugir();
    }
    if (corpo) {
      switch (this.fase) {
        case 'entrando':
          avancarCorpo(corpo, z, dt, VELOCIDADE * 1.4, Math.random);
          if (corpo.x > z.x0 && corpo.x < z.x1) this.mudarFase('voando');
          break;
        case 'voando': {
          for (const e of avancarCorpo(corpo, z, dt, this.furia ? VELOCIDADE_FURIA : VELOCIDADE, Math.random)) {
            if (e.tipo === 'some' || e.tipo === 'aparece') { this.efeito(e.x, e.y, CORES_PORTAL, 30); if (e.tipo === 'aparece') somTeleporte(); }
          }
          if (corpo.manobra) {
            // O rastro do efeito da poção que ela bebeu.
            if (corpo.visivel && Math.random() < dt * 40) {
              this.particula({ x: corpo.x + entre(-LARG / 2, LARG / 2), y: corpo.y + entre(-ALT / 2, ALT / 2), vx: -corpo.lado * entre(5, 30), vy: entre(-15, 5), vida: entre(0.4, 0.8), cor: COR_MANOBRA[corpo.manobra.tipo], tam: 1, g: 0, forma: 'espiral' });
            }
            break;
          }
          if (this.voando) break;
          // O caldeirão: na metade da vida e perto do fim, uma vez cada.
          const devida = CURA_EM[this.curasFeitas];
          if (devida !== undefined && this.fracao <= devida && !this.caldeirao) { this.iniciarCura(); break; }
          this.proximoFeitico -= dt;
          if (this.proximoFeitico <= 0) {
            const [a, b] = this.furia ? INTERVALO_FURIA : INTERVALO;
            this.proximoFeitico = entre(a, b);
            this.iniciarConjuro();
          }
          break;
        }
        case 'conjurando':
          pairar(corpo, dt);
          // O Encantamento ela faz no meio da tela, em cima da mesa.
          if (this.conjuro?.feitico === FEITICO_FORTE) {
            const k = Math.min(1, dt * 1.6);
            corpo.x += (this.larg / 2 - corpo.x) * k;
            corpo.y += (Math.max(z.y0 + 10, Math.min(z.y1, this.alt * 0.42)) - corpo.y) * k;
            if (this.mesa) this.mesa.x = corpo.x;
          }
          this.magiaEntrando(dt);
          if (this.tFase >= this.duracaoDoConjuro()) this.soltarFeitico();
          break;
        case 'tonta':
          pairar(corpo, dt);
          corpo.giro = Math.sin(this.tFase * 9) * 0.12;
          if (this.tFase >= TONTA_S) { corpo.giro = 0; novoAlvo(corpo, z, Math.random); this.mudarFase('voando'); }
          break;
        case 'curando':
          if (this.cura && this.caldeirao) this.passoCura(dt);
          else { novoAlvo(corpo, z, Math.random); this.mudarFase('voando'); }
          break;
        case 'fugindo': {
          const dir = corpo.x < this.larg / 2 ? -1 : 1;
          corpo.lado = dir;
          corpo.vx += (dir * 220 - corpo.vx) * Math.min(1, dt * 3);
          corpo.vy += (-60 - corpo.vy) * Math.min(1, dt * 3);
          corpo.x += corpo.vx * dt;
          corpo.y += corpo.vy * dt;
          if (corpo.x < -LARG * 2 || corpo.x > this.larg + LARG * 2 || corpo.y < -ALT * 2) {
            this.corpo = null;
            this.fase = 'fora';
            this.barra.hidden = true;
            this.desfazerTodos();
            this.aoEvento?.({ tipo: 'fugiu' });
          }
          break;
        }
        case 'caindo':
          this.passoCaindo(dt);
          break;
        case 'tombando':
          this.passoQueda();
          break;
        default:
          break;
      }
    }
    if (this.corpo && this.atingivel()) this.rastro(dt);
    if (this.voando) {
      const g = this.voando;
      g.t += dt;
      if (g.t >= g.dura) {
        this.voando = null;
        somVidro();
        this.estourarGarrafa(g.ate.x, g.ate.y, g.feitico);
        this.aplicarFeitico(g.feitico);
      }
    }
    this.passoCaldeirao(dt);
    this.passoMesa(dt);
    for (const r of this.runas) r.t += dt;
    this.runas = this.runas.filter(r => r.t < r.dura);
    const agora = performance.now();
    this.teias = this.teias.filter(t => agora < t.ate + 600);
    this.passoDrops(dt);
    this.moverParticulas(dt);
    this.atualizarBarra();
    this.posicionarCaixas();
  }

  private passoCaldeirao(dt: number): void {
    const cal = this.caldeirao;
    if (!cal) return;
    cal.t += dt;
    cal.tremor = Math.max(0, cal.tremor - dt * 10);
    if (cal.saindo) {
      cal.aparecendo -= dt * 2;
      if (cal.aparecendo <= 0) this.caldeirao = null;
    } else cal.aparecendo = Math.min(1, cal.aparecendo + dt * 1.8);
    // As espirais da poção que saem da boca, como de caldeirão com poção no jogo.
    if (!cal.saindo && Math.random() < dt * 8) {
      const z = this.zona();
      this.particula({ x: cal.x + entre(-10, 10), y: z.chao - ALTURA_CALDEIRAO, vx: entre(-4, 4), vy: entre(-22, -10), vida: entre(0.8, 1.4), cor: sorteia(CORES_CURA), tam: 1, g: -4, forma: 'espiral' });
    }
  }

  /** As espirais da poção entrando na garrafa enquanto ela prepara. */
  private magiaEntrando(dt: number): void {
    const f = this.conjuro?.feitico;
    if (!f) return;
    const forte = f === FEITICO_FORTE;
    if (Math.random() > dt * (forte ? 50 : 30)) return;
    const info = FEITICOS[f];
    const s = this.centroSprite();
    const a = Math.random() * Math.PI * 2;
    const raio = forte ? 46 : LARG * 0.8;
    const x = s.x + Math.cos(a) * raio, y = s.y + Math.sin(a) * raio * 0.9;
    const m = forte ? s : this.paraTelaMaoErguida();
    this.particula({ x, y, vx: (m.x - x) * 2, vy: (m.y - y) * 2, vida: 0.45, cor: Math.random() < 0.3 ? info.corClara : info.cor, tam: 1, g: 0, forma: Math.random() < 0.3 ? 'estrela' : 'espiral' });
  }

  /** Onde fica a garrafa erguida (acima do ombro, do lado para onde ela olha). */
  private paraTelaMaoErguida(): { x: number; y: number } {
    return this.paraTela(LARG + 2, ALT * 0.28);
  }

  /** As partículas de bruxa (roxas) e as da Levitação embaixo do pé. */
  private rastro(dt: number): void {
    const corpo = this.corpo!;
    if (!corpo.visivel) return;
    // A fumaça roxa da ponta do chapéu: quadradinhos que sobem e vão para trás.
    if (Math.random() < dt * (this.furia ? 16 : 9)) {
      const p = this.paraTela(PONTA_DO_CHAPEU.x * PIXEL_MC, PONTA_DO_CHAPEU.y * PIXEL_MC);
      this.particula({
        x: p.x, y: p.y, vx: -corpo.lado * entre(4, 14), vy: entre(-26, -14), vida: entre(0.9, 1.5),
        cor: sorteia(CORES_FUMACA_CHAPEU), tam: PIXEL_MC, g: -4, forma: 'ponto',
      });
    }
    this.sobraRastro += dt * (this.furia ? 30 : 18);
    while (this.sobraRastro >= 1) {
      this.sobraRastro -= 1;
      if (this.fase !== 'curando' && Math.random() < 0.6) {
        const p = this.paraTela(entre(4, LARG - 4), ALT - entre(0, 4));
        this.particula({ x: p.x, y: p.y, vx: entre(-6, 6), vy: entre(4, 16), vida: entre(0.4, 0.8), cor: sorteia(CORES_LEVITACAO), tam: 1, g: 0, forma: 'espiral' });
      } else {
        const p = this.paraTela(entre(0, LARG), entre(0, ALT * 0.7));
        this.particula({ x: p.x, y: p.y, vx: entre(-6, 6), vy: entre(-20, -6), vida: entre(0.5, 0.9), cor: this.furia ? sorteia(['#ff4a3a', '#ff8a6a']) : sorteia(CORES_BRUXA), tam: 1, g: 0, forma: 'cruz' });
      }
    }
  }

  private particula(p: Omit<Particula, 'max' | 'gruda'> & { gruda?: boolean }): void {
    if (this.particulas.length >= MAX_PARTICULAS) this.particulas.shift();
    this.particulas.push({ ...p, gruda: p.gruda ?? false, max: p.vida });
  }

  private anel(x: number, y: number, cor: string, vr: number, vida: number): void {
    this.aneis.push({ x, y, r: 2, vr, vida, max: vida, cor });
  }

  /** A nuvem de partículas de um efeito (poção, teleporte, fumaça). */
  private efeito(x: number, y: number, cores: readonly string[], n = 26): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = entre(10, 55);
      this.particula({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 8, vida: entre(0.5, 1), cor: sorteia(cores), tam: sorteia([1, 2, 2]), g: -12, forma: Math.random() < 0.4 ? 'espiral' : 'ponto' });
    }
  }

  /** As lascas quadradas de bloco quebrando. */
  private estilhacos(x: number, y: number, cores: readonly string[], n: number): void {
    for (let i = 0; i < n; i++) {
      this.particula({ x: x + entre(-8, 8), y: y + entre(-8, 8), vx: entre(-80, 80), vy: entre(-120, -20), vida: entre(0.5, 1), cor: sorteia(cores), tam: sorteia([2, 2, 3]), g: GRAVIDADE, forma: 'ponto' });
    }
  }

  private moverParticulas(dt: number): void {
    const chao = this.zona().chao;
    for (const p of this.particulas) {
      p.vida -= dt;
      if (p.gruda && p.g === 0 && p.vx === 0 && p.vy === 0) continue;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // A poção derramada bate no chão e fica, uma mancha que some devagar.
      if (p.gruda && p.y >= chao - 1) {
        p.y = chao - 1 + Math.round(Math.random());
        p.vx = 0; p.vy = 0; p.g = 0;
        p.vida = p.max = entre(3, 5);
      }
    }
    this.particulas = this.particulas.filter(p => p.vida > 0);
    for (const a of this.aneis) { a.vida -= dt; a.r += a.vr * dt; }
    this.aneis = this.aneis.filter(a => a.vida > 0);
  }

  private atualizarBarra(): void {
    if (this.barra.hidden) return;
    const k = this.fracao;
    const barra = this.barra.querySelector('i') as HTMLElement;
    const largura = `${(k * 100).toFixed(1)}%`;
    if (barra.style.width !== largura) barra.style.width = largura;
    // A cura em andamento aparece na barra, listrada, à frente da vida.
    const cura = this.barra.querySelector('.bxc-vida b') as HTMLElement;
    const resto = this.cura ? Math.max(0, this.cura.total - this.cura.curado) / this.vidaMax : 0;
    const larguraCura = `${(Math.min(1 - k, resto) * 100).toFixed(1)}%`;
    if (cura.style.width !== larguraCura) { cura.style.width = larguraCura; cura.style.left = largura; }
    const texto = `${Math.max(0, Math.ceil(this.vida))} / ${this.vidaMax}`;
    const span = this.barra.querySelector('.bxc-vida span')!;
    if (span.textContent !== texto) span.textContent = texto;
    const resta = Math.max(0, Math.ceil(this.prazo - this.tempo));
    const relogio = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}`;
    const tempo = this.barra.querySelector('.bxc-tempo')!;
    const linha = this.furia ? `FÚRIA · ${relogio}` : relogio;
    if (tempo.textContent !== linha) tempo.textContent = linha;
  }

  private posicionarCaixas(): void {
    const corpo = this.corpo;
    if (corpo && this.atingivel()) {
      const s = this.centroSprite();
      const folga = 6;
      this.caixa.style.width = `${(LARG + folga * 2) * this.escala}px`;
      this.caixa.style.height = `${(ALT + folga * 2) * this.escala}px`;
      this.caixa.style.transform = `translate(${Math.round((s.x - LARG / 2 - folga) * this.escala)}px, ${Math.round((s.y - ALT / 2 - folga) * this.escala)}px)`;
    }
    const cal = this.caldeirao;
    if (cal && !cal.saindo && cal.aparecendo > 0.5) {
      const z = this.zona();
      this.caixaCaldeirao.style.display = '';
      this.caixaCaldeirao.style.width = `${LARGURA_CALDEIRAO * this.escala}px`;
      this.caixaCaldeirao.style.height = `${ALTURA_CALDEIRAO * this.escala}px`;
      this.caixaCaldeirao.style.transform = `translate(${Math.round((cal.x - LARGURA_CALDEIRAO / 2) * this.escala)}px, ${Math.round((z.chao - ALTURA_CALDEIRAO) * this.escala)}px)`;
    } else this.caixaCaldeirao.style.display = 'none';
  }

  // ── O desenho ────────────────────────────────────────────────────────────

  private desenhar(agora: number): void {
    const c = this.c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.larg, this.alt);
    if (agora < this.tremeAte) c.translate(Math.round(entre(-2, 2)), Math.round(entre(-2, 2)));
    if (this.conjuro?.feitico === FEITICO_FORTE) {
      // O céu escurece enquanto o Encantamento cresce.
      c.fillStyle = `rgba(20,6,40,${Math.min(0.32, this.tFase / CONJURO_FORTE_S * 0.32)})`;
      c.fillRect(-4, -4, this.larg + 8, this.alt + 8);
    }
    this.desenharTeias(agora);
    this.desenharMesa();
    if (this.caldeirao) {
      const cal = this.caldeirao;
      desenharCaldeirao(c, cal.x, this.zona().chao, { t: cal.t, inteiro: cal.pontos / PONTOS_CALDEIRAO, tremor: cal.tremor, aparecendo: Math.max(0, cal.aparecendo) });
    }
    this.desenharDrops();
    this.desenharAneis();
    for (const p of this.particulas) this.desenharParticula(p);
    c.globalAlpha = 1;
    this.desenharRunasVoando();
    const corpo = this.corpo;
    if (corpo && corpo.visivel) {
      if (this.conjuro?.feitico === FEITICO_FORTE) this.desenharCirculo(agora);
      this.desenharBruxa(agora);
      if (this.conjuro?.feitico === FEITICO_FORTE) this.desenharEncanto();
    }
    if (this.voando) this.desenharGarrafaVoando();
    this.desenharOrbes(agora);
    if (this.clarao > 0) {
      c.fillStyle = `rgba(230,200,255,${this.clarao})`;
      c.fillRect(-4, -4, this.larg + 8, this.alt + 8);
    }
  }

  private desenharParticula(p: Particula): void {
    const c = this.c;
    c.globalAlpha = Math.max(0, Math.min(1, p.vida / p.max));
    c.fillStyle = p.cor;
    const x = Math.round(p.x), y = Math.round(p.y);
    if (p.forma === 'cruz') {
      c.fillRect(x - 1, y, 3, 1);
      c.fillRect(x, y - 1, 1, 3);
    } else if (p.forma === 'estrela') {
      // A estrelinha: braços que encolhem conforme ela apaga.
      const braco = p.vida / p.max > 0.5 ? 2 : 1;
      c.fillRect(x - braco, y, braco * 2 + 1, 1);
      c.fillRect(x, y - braco, 1, braco * 2 + 1);
      c.fillStyle = '#ffffff';
      c.fillRect(x, y, 1, 1);
    } else if (p.forma === 'espiral') {
      // A partícula de efeito de poção do jogo: um anelzinho de 3 × 3 que vira ponto.
      if (p.vida / p.max > 0.45) {
        c.fillRect(x - 1, y - 1, 3, 1);
        c.fillRect(x - 1, y + 1, 3, 1);
        c.fillRect(x - 1, y, 1, 1);
        c.fillRect(x + 1, y, 1, 1);
      } else c.fillRect(x, y, 1, 1);
    } else c.fillRect(x, y, p.tam, p.tam);
  }

  /** Um círculo de pixels (o anel do estouro, o círculo do Encantamento). */
  private circuloPixel(cx: number, cy: number, r: number, cor: string | ((i: number) => string | null)): void {
    const c = this.c;
    const passos = Math.max(12, Math.round(r * 2 * Math.PI));
    let ultimo = '';
    for (let i = 0; i < passos; i++) {
      const a = (i / passos) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      const chave = `${x},${y}`;
      if (chave === ultimo) continue;
      ultimo = chave;
      const tinta = typeof cor === 'string' ? cor : cor(i);
      if (!tinta) continue;
      c.fillStyle = tinta;
      c.fillRect(x, y, 1, 1);
    }
  }

  private desenharAneis(): void {
    const c = this.c;
    for (const a of this.aneis) {
      c.globalAlpha = Math.max(0, a.vida / a.max);
      this.circuloPixel(a.x, a.y, a.r, a.cor);
      if (a.r > 6) this.circuloPixel(a.x, a.y, a.r - 2, i => (i % 3 === 0 ? '#ffffff' : null));
    }
    c.globalAlpha = 1;
  }

  /** O círculo do Encantamento: dois anéis tracejados girando e as runas. */
  private desenharCirculo(agora: number): void {
    const c = this.c;
    const s = this.centroSprite();
    const k = Math.min(1, this.tFase / 0.4);
    const r = 50 * k;
    const gira = agora / 500;
    const cores = FEITICOS[FEITICO_FORTE];
    c.globalAlpha = 0.85;
    this.circuloPixel(s.x, s.y, r, i => ((Math.floor(i / 3) + Math.floor(gira * 10)) % 2 === 0 ? cores.corClara : null));
    this.circuloPixel(s.x, s.y, Math.max(1, r - 5), i => ((Math.floor(i / 2) - Math.floor(gira * 14)) % 3 === 0 ? cores.cor : null));
    // As runas do Alfabeto Galáctico em volta, girando.
    const letras = letrasComRuna(ENCANTO);
    letras.forEach((l, i) => {
      const g = glifo(l, i % 2 ? cores.corClara : '#ffffff', 14);
      if (!g) return;
      const a = gira * 1.4 + (i * Math.PI * 2) / letras.length;
      const rr = r + 9;
      c.globalAlpha = 0.6 + 0.4 * Math.sin(agora / 150 + i);
      c.drawImage(g, Math.round(s.x + Math.cos(a) * rr - g.width / 2), Math.round(s.y + Math.sin(a) * rr - g.height / 2));
    });
    c.globalAlpha = 1;
  }

  /** A frase dela em runas, se escrevendo letra a letra acima dela. */
  private desenharEncanto(): void {
    const c = this.c;
    const s = this.centroSprite();
    const letras = [...ENCANTO.toLowerCase()];
    const quantas = Math.min(letras.length, Math.floor((this.tFase / (CONJURO_FORTE_S * 0.8)) * letras.length) + 1);
    const glifos = letras.slice(0, quantas).map((l, i) => (l === ' ' ? null : glifo(l, i % 2 ? '#ffffff' : FEITICOS[FEITICO_FORTE].corClara, 15)));
    const largura = glifos.reduce((t, g) => t + (g ? g.width + 3 : 8), 0);
    let x = Math.round(s.x - largura / 2);
    const y = Math.round(s.y - ALT / 2 - 34);
    for (const g of glifos) {
      if (!g) { x += 8; continue; }
      c.drawImage(g, x, y + Math.round(Math.sin(this.relogio * 6 + x) * 1));
      x += g.width + 3;
    }
  }

  /** A mesa de encantamento no chão: tampo vermelho com diamantes, obsidiana, e o livro abrindo. */
  private desenharMesa(): void {
    const m = this.mesa;
    if (!m) return;
    const c = this.c;
    const P = PIXEL_MC;
    const z = this.zona();
    const T = 16, H = 12;
    const x0 = Math.round(m.x - (T * P) / 2);
    const sobe = Math.round((1 - Math.max(0, m.aparecendo)) * H * P);
    const topo = z.chao - H * P + sobe;
    const texel = (x: number, y: number, cor: string) => {
      const py = topo + y * P;
      if (py >= z.chao) return;
      c.fillStyle = cor;
      c.fillRect(x0 + x * P, py, P, Math.min(P, z.chao - py));
    };
    const ruido = (x: number, y: number) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < T; x++) {
        let cor: string;
        if (y <= 1) cor = (x <= 1 || x >= T - 2) && y === 0 ? '#5ae8e0' : ruido(x, y) < 0.5 ? '#c02a34' : '#9a1a24';
        else if (y === 2) cor = '#5a0a10';
        else cor = ['#140c1e', '#1e1430', '#2a1a40'][Math.floor(ruido(x, y) * 3)];
        if (y > 2 && ruido(y, x) < 0.06) cor = '#5a2a8a';
        texel(x, y, cor);
      }
    }
    if (m.aparecendo < 0.8) return;
    // O livro flutuando em cima, abrindo e fechando.
    const aberto = Math.floor(m.t * 3) % 4 < 2;
    const livro = this.livroDaMesa();
    const ly = Math.round(livro.y + Math.sin(m.t * 3) * 2);
    const lx = Math.round(livro.x - 3 * P);
    c.fillStyle = '#6a3a1a';
    c.fillRect(lx, ly + P, 6 * P, P * 2);
    c.fillStyle = '#f0e8d0';
    if (aberto) { c.fillRect(lx, ly, 3 * P - 1, P); c.fillRect(lx + 3 * P + 1, ly, 3 * P - 1, P); }
    else c.fillRect(lx + P, ly, 4 * P, P);
  }

  private desenharRunasVoando(): void {
    if (!this.runas.length) return;
    const c = this.c;
    const livro = this.livroDaMesa();
    for (const r of this.runas) {
      const u = r.t / r.dura;
      const x = r.de.x + (livro.x - r.de.x) * suave(u);
      const y = r.de.y + (livro.y - r.de.y) * u - Math.sin(u * Math.PI) * 10;
      const g = glifo(r.letra, u < 0.5 ? '#ffffff' : FEITICOS[FEITICO_FORTE].corClara, 9);
      if (!g) continue;
      c.globalAlpha = Math.min(1, (1 - u) * 2);
      c.drawImage(g, Math.round(x - g.width / 2), Math.round(y - g.height / 2));
    }
    c.globalAlpha = 1;
  }

  private desenharBruxa(agora: number): void {
    const c = this.c;
    const corpo = this.corpo!;
    const s = this.centroSprite();
    const f = this.quadroAtual();
    const morrendo = this.fase === 'caindo' || this.fase === 'tombando';
    const img = sprite(this.estagio, f, corpo.lado, morrendo || agora < this.dorAte);
    c.save();
    if (this.fase === 'tombando') {
      // O tombo do jogo: gira em volta do canto do pé, do lado para onde cai.
      c.translate(Math.round(s.x + corpo.lado * LARG / 2), Math.round(s.y + ALT / 2));
      c.rotate(corpo.giro);
      c.drawImage(img, corpo.lado > 0 ? -LARG : 0, -ALT);
    } else {
      c.translate(Math.round(s.x), Math.round(s.y));
      if (this.fase === 'tonta') c.translate(Math.round(Math.sin(agora / 40) * 1.5), 0);
      c.rotate(corpo.giro);
      c.drawImage(img, -LARG / 2, -ALT / 2);
    }
    c.restore();
    // A garrafa: erguida enquanto ela prepara, na boca enquanto bebe.
    const preparando = this.fase === 'conjurando' && !!this.conjuro && this.conjuro.feitico !== FEITICO_FORTE;
    const bebendo = this.fase === 'curando' && this.cura?.etapa === 'bebendo';
    if (preparando || bebendo) {
      const info = preparando ? FEITICOS[this.conjuro!.feitico] : { cor: COR_CURA, corClara: '#ff8a8a' };
      const g = garrafa(info.cor, info.corClara);
      const p = preparando ? this.paraTelaMaoErguida() : this.paraTela(LARG * 0.66, ALT * 0.42);
      c.save();
      c.translate(Math.round(p.x), Math.round(p.y + (preparando ? Math.sin(agora / 120) * 1.5 : 0)));
      // Bebendo, o gargalo vai para a boca.
      if (bebendo) c.rotate(-corpo.lado * 2.4);
      c.drawImage(g, -g.width / 2, -g.height / 2);
      c.restore();
    }
    if (this.fase === 'tonta') {
      // As estrelinhas rodando em volta do chapéu.
      for (let i = 0; i < 3; i++) {
        const a = agora / 260 + (i * Math.PI * 2) / 3;
        this.desenharParticula({ x: s.x + Math.cos(a) * 16, y: s.y - ALT / 2 + 6 + Math.sin(a) * 4, vx: 0, vy: 0, vida: 1, max: 1, cor: '#ffe14d', tam: 1, g: 0, forma: 'estrela', gruda: false });
      }
    }
  }

  /** A garrafa em arco: sobe, gira e desce no alvo. */
  private desenharGarrafaVoando(): void {
    const v = this.voando!;
    const c = this.c;
    const u = Math.min(1, v.t / v.dura);
    const x = v.de.x + (v.ate.x - v.de.x) * u;
    const y = v.de.y + (v.ate.y - v.de.y) * u - v.altura * 4 * u * (1 - u);
    const info = FEITICOS[v.feitico];
    const g = garrafa(info.cor, info.corClara);
    c.save();
    c.translate(Math.round(x), Math.round(y));
    // Gira em passos de 45°, como item do jogo voando.
    c.rotate(Math.round(u * 16) * (Math.PI / 4));
    c.drawImage(g, -g.width / 2, -g.height / 2);
    c.restore();
    if (Math.random() < 0.7) this.particula({ x, y, vx: entre(-8, 8), vy: entre(-8, 8), vida: 0.35, cor: info.corClara, tam: 1, g: 0, forma: 'espiral' });
  }

  private desenharTeias(agora: number): void {
    if (!this.teias.length) return;
    const c = this.c;
    const t = teia();
    for (const w of this.teias) {
      const nasce = Math.max(0, Math.min(1, (agora - w.nasceu) / 250));
      const some = agora > w.ate ? Math.max(0, 1 - (agora - w.ate) / 600) : 1;
      if (nasce <= 0) continue;
      c.globalAlpha = 0.95 * nasce * some;
      c.drawImage(t, Math.round(w.x - t.width / 2), Math.round(w.y - t.height / 2));
    }
    c.globalAlpha = 1;
  }

  private desenharDrops(): void {
    if (!this.drops.length) return;
    const c = this.c;
    for (const d of this.drops) {
      // No chão o item flutua, sobe e desce, como no jogo; some piscando no fim.
      if (d.t > DROPS_S - 2 && Math.floor(d.t * 8) % 2 === 0) continue;
      const bob = d.noChao ? Math.round(Math.sin(d.t * 3 + d.fase) * 2) - 2 : 0;
      const [direita, esquerda] = miniatura(contornado(d.item));
      const img = Math.floor((d.t + d.fase) * 1.5) % 2 ? direita : esquerda;
      c.drawImage(img, Math.round(d.x - img.width / 2), Math.round(d.y - img.height / 2 + bob));
    }
  }

  private desenharOrbes(agora: number): void {
    if (!this.orbes.length) return;
    const c = this.c;
    for (const o of this.orbes) {
      // A bolinha de XP do jogo: verde e amarela, piscando de cor.
      const brilho = Math.floor(agora / 90 + o.x) % 2 === 0;
      const x = Math.round(o.x), y = Math.round(o.y + (o.voando ? 0 : Math.sin(o.t * 6)));
      const t = o.tam;
      c.fillStyle = '#2a5a0a';
      c.fillRect(x - 1, y - 1, t + 2, t + 2);
      c.fillStyle = brilho ? '#d8ff4a' : '#8ae01e';
      c.fillRect(x, y, t, t);
      c.fillStyle = '#ffffc8';
      c.fillRect(x, y, 1, 1);
    }
  }

  // ── Letreiros ────────────────────────────────────────────────────────────

  private letreiro(texto: string, x: number, y: number, tipo: 'hs' | 'esquiva' | 'feitico' | 'dano' | 'quebra' | 'cura'): void {
    const el = document.createElement('div');
    el.className = `bxc-letreiro ${tipo}`;
    el.textContent = texto;
    el.style.left = `${Math.round(x * this.escala)}px`;
    // Nunca por cima da barra de chefe e do aviso, lá no alto.
    el.style.top = `${Math.max(Math.round(y * this.escala), 150)}px`;
    this.raiz.appendChild(el);
    this.letreiros.push(el);
    if (this.letreiros.length > MAX_LETREIROS) this.letreiros.shift()!.remove();
    setTimeout(() => {
      el.remove();
      this.letreiros = this.letreiros.filter(l => l !== el);
    }, 1200);
  }

  /**
   * A conquista de quem ajudou: o aviso do canto do jogo, com o retrato dela,
   * «Desafio concluído!» em roxo (a cor dos desafios no Minecraft) e o nome.
   */
  private mostrarConquista(): void {
    this.raiz.querySelectorAll('.bxc-conquista').forEach(a => a.remove());
    const el = document.createElement('div');
    el.className = 'bxc-conquista';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="bxc-conquista-texto"><b></b><span></span><small></small></div>';
    el.querySelector('b')!.textContent = CONQUISTA.titulo;
    el.querySelector('span')!.textContent = CONQUISTA.nome;
    el.querySelector('small')!.textContent = CONQUISTA.descricao;
    const icone = canvasDaImagem(cabecaMC(), false);
    icone.className = 'bxc-conquista-icone';
    el.prepend(icone);
    this.raiz.appendChild(el);
    somConquista();
    this.aoEvento?.({ tipo: 'conquista', nome: CONQUISTA.nome });
    setTimeout(() => el.remove(), 6500);
  }

  private aviso(titulo: string, sub: string): void {
    this.raiz.querySelectorAll('.bxc-aviso').forEach(a => a.remove());
    const el = document.createElement('div');
    el.className = 'bxc-aviso';
    el.innerHTML = '<b></b><span></span>';
    el.querySelector('b')!.textContent = titulo;
    el.querySelector('span')!.textContent = sub;
    this.raiz.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }
}
