/**
 * feiticos.ts — as poções que a Bruxa do Pântano joga na tela do Gestão.
 *
 * Como a bruxa do Minecraft, ela ataca com POÇÕES DE ARREMESSO: a garrafa voa
 * em arco, estoura no alvo e o efeito pega o que estiver ali. Cada feitiço é
 * uma poção do jogo, na cor dela (`InfoFeitico.cor`):
 *
 *   dano            Poção de Dano Instantâneo: mexe nos valores de dinheiro
 *   estranha        Poção Estranha: as abas trocam de nome
 *   invisibilidade  Poção de Invisibilidade: acordos ou valores somem
 *   visao           Poção de Visão Noturna: a tela troca de cor
 *   cegueira        Poção de Cegueira: a tela escurece, só um buraco fica à vista
 *   encantamento    o forte, da mesa de encantamento: runas do Alfabeto
 *                   Galáctico e a tela ondulando (a náusea do jogo)
 *
 * ## Menos poções, mais jeitos (16/10/2026)
 *
 * Saíram a Lentidão, o Veneno, a Fraqueza e a Levitação (o Kauan: «já tem
 * muitos efeitos»). No lugar, cada poção que ficou cai de mais de um jeito
 * (`VARIANTES`), e a bruxa sorteia um diferente do da última vez
 * (`escolherVariante`):
 *
 *   dano            negativo (−R$), zerado (R$ 0,00), embaralhado (os dígitos trocam)
 *   estranha        Minecraft (nome do jogo), avesso (de trás para frente),
 *                   trocadas (uma aba com o nome da outra)
 *   invisibilidade  linhas (acordos somem), valores (o dinheiro some),
 *                   fantasma (as linhas piscam meio transparentes)
 *   visao           temas (pisca de cor em cor), negativo (a tela invertida),
 *                   ofuscante (claro demais, pulsando)
 *   cegueira        mouse (o buraco segue o mouse), escuridão (o escuro pulsa,
 *                   o Escuridão do jogo), lanterna (o buraco anda sozinho)
 *   encantamento    abas (as abas viram runas), tudo (abas e valores)
 *
 * Tudo é VISUAL e volta sozinho: nenhum dado muda, nenhum clique é
 * bloqueado, e o operador em atendimento continua trabalhando por baixo.
 *
 * ## Por que não trocar o texto direto
 *
 * O texto das telas é do React. Escrever em `textContent` de um nó dele faz o
 * React se perder na próxima renderização (e ele desfaz o feitiço, ou pior,
 * quebra a tela). Então o feitiço só PÕE coisas por cima: um atributo
 * `data-bx-feitico` com o texto novo e uma classe que zera a letra do original
 * e desenha o novo num `::after` (ver `chefona.css`). Desfazer é tirar a
 * classe e o atributo. Se o React redesenhar o elemento no meio, o pior que
 * acontece é o feitiço acabar antes.
 *
 * ## Onde o feitiço cai
 *
 * Nas peças marcadas com `data-alvo-feitico`:
 *
 *   valor   um número de dinheiro (recebido, projeção)
 *   aba     o rótulo de uma aba ou item do menu
 *   linha   uma linha de acordo
 *
 * e na `raiz` (a página toda), onde a Visão Noturna troca as cores e o
 * Encantamento distorce.
 *
 * ## A força (15/10/2026)
 *
 * Quanto mais rachada ela está, mais fraca a poção: pega menos alvos e dura
 * menos (`forca`, de 0,35 com a vida no fim a 1 com a vida cheia). Na tela
 * isso é o nível da poção, como no jogo: II forte, I fraca (`nivelDaPocao`).
 *
 * ## Leve (computador fraco, 15/10/2026)
 *
 * O `filter` no `#root` obriga o navegador a repintar o Gestão inteiro a cada
 * quadro — num PC sem placa de vídeo isso trava a tela. Com `feiticosLeves`
 * ligado (`leve.ts`), as poções da tela toda viram um VÉU de cor por cima da
 * página, que só é composto, e o Encantamento não distorce (as runas ficam).
 */
import { paraGalatico } from './galatico';

export type NomeFeitico = 'dano' | 'estranha' | 'invisibilidade' | 'visao' | 'cegueira' | 'encantamento';

/** Um jeito de a poção cair, e a linha que aparece no aviso. */
export interface Variante {
  id: string;
  encanto: string;
}

export interface InfoFeitico {
  /** Como aparece no aviso: «Poção de Dano Instantâneo». */
  titulo: string;
  /** Com a força toda. */
  duracaoMs: number;
  /** A cor do líquido e das partículas (as do jogo, puxadas para ler bem). */
  cor: string;
  corClara: string;
  /** Os jeitos de cair; o primeiro é o de sempre. */
  variantes: readonly Variante[];
}

export const FEITICOS: Readonly<Record<NomeFeitico, InfoFeitico>> = {
  dano: {
    titulo: 'Poção de Dano Instantâneo', duracaoMs: 12_000, cor: '#8a1a14', corClara: '#e0503a',
    variantes: [
      { id: 'negativo', encanto: 'Todo saldo virou dívida!' },
      { id: 'zerado', encanto: 'O dinheiro evaporou!' },
      { id: 'embaralhado', encanto: 'Os números se embaralharam!' },
    ],
  },
  estranha: {
    titulo: 'Poção Estranha', duracaoMs: 12_000, cor: '#385dc6', corClara: '#8aa8ff',
    variantes: [
      { id: 'minecraft', encanto: 'Nada tem o nome certo!' },
      { id: 'avesso', encanto: 'Tudo escrito de trás para frente!' },
      { id: 'trocadas', encanto: 'As abas trocaram de nome!' },
    ],
  },
  invisibilidade: {
    titulo: 'Poção de Invisibilidade', duracaoMs: 10_000, cor: '#7f8392', corClara: '#d0d4e0',
    variantes: [
      { id: 'linhas', encanto: 'Os acordos sumiram!' },
      { id: 'valores', encanto: 'O dinheiro sumiu da tela!' },
      { id: 'fantasma', encanto: 'Os acordos viraram fantasmas!' },
    ],
  },
  visao: {
    titulo: 'Poção de Visão Noturna', duracaoMs: 6_000, cor: '#1f1fa1', corClara: '#6a6aff',
    variantes: [
      { id: 'temas', encanto: 'A tela pisca!' },
      { id: 'negativo', encanto: 'A tela virou negativo!' },
      { id: 'ofuscante', encanto: 'Claro demais!' },
    ],
  },
  cegueira: {
    titulo: 'Poção de Cegueira', duracaoMs: 7_000, cor: '#1f1f23', corClara: '#6a6a78',
    variantes: [
      { id: 'mouse', encanto: 'Só dá para ver em volta do mouse!' },
      { id: 'escuridao', encanto: 'A escuridão pulsa!' },
      { id: 'lanterna', encanto: 'A luz anda sozinha!' },
    ],
  },
  encantamento: {
    titulo: 'Encantamento', duracaoMs: 8_000, cor: '#7a2ad0', corClara: '#d08aff',
    variantes: [
      { id: 'abas', encanto: 'A tela inteira se dobra!' },
      { id: 'tudo', encanto: 'Até o dinheiro virou runa!' },
    ],
  },
};

export const LISTA_FEITICOS: readonly NomeFeitico[] = ['dano', 'estranha', 'invisibilidade', 'visao', 'cegueira', 'encantamento'];

/** O feitiço forte: conjuro mais longo, e só sai de vez em quando. */
export const FEITICO_FORTE: NomeFeitico = 'encantamento';

/** O nível da poção pela força: II com ela inteira, I quando já está rachada. */
export function nivelDaPocao(forca: number): 'I' | 'II' {
  return forca >= 0.6 ? 'II' : 'I';
}

export const ATRIBUTO_ALVO = 'data-alvo-feitico';
export const ATRIBUTO_TEXTO = 'data-bx-feitico';

export interface AlvosFeitico {
  /** Onde a Visão Noturna pinta: a página (sem o palco da bruxa). */
  raiz: () => HTMLElement | null;
  valores: () => HTMLElement[];
  abas: () => HTMLElement[];
  linhas: () => HTMLElement[];
}

/** Os alvos marcados com `data-alvo-feitico` dentro de `onde`. */
export function alvosPorAtributo(
  onde: () => ParentNode | null = () => document,
  raiz: () => HTMLElement | null = () => document.getElementById('root'),
): AlvosFeitico {
  const todos = (tipo: string) => {
    const base = onde();
    if (!base) return [];
    return [...base.querySelectorAll<HTMLElement>(`[${ATRIBUTO_ALVO}="${tipo}"]`)]
      .filter(el => el.isConnected && (tipo === 'linha' || (el.textContent ?? '').trim() !== ''));
  };
  return { raiz, valores: () => todos('valor'), abas: () => todos('aba'), linhas: () => todos('linha') };
}

// ── As contas puras ────────────────────────────────────────────────────────

/** A força do feitiço pela vida (0–1): 0,35 no fim, 1 cheia. */
export function forcaDoFeitico(fracaoDaVida: number): number {
  return 0.35 + 0.65 * Math.max(0, Math.min(1, fracaoDaVida));
}

/** Quanto o feitiço dura com essa força (nunca menos de 3 s). */
export function duracaoDoFeitico(f: NomeFeitico, forca: number): number {
  return Math.max(3_000, Math.round(FEITICOS[f].duracaoMs * (0.4 + 0.6 * forca)));
}

/** «R$ 48.312,90» → «-R$ 48.312,90»; «72%» → «-72%». O que já é negativo fica como está. */
export function negativar(texto: string): string {
  const t = texto.trim();
  return t.startsWith('-') ? t : `-${t}`;
}

/** «R$ 48.312,90» → «R$ 0,00»; «72%» → «0%»; o resto, o número vira 0. */
export function zerar(texto: string): string {
  const t = texto.trim();
  if (t.includes('R$')) return 'R$ 0,00';
  if (t.endsWith('%')) return '0%';
  return t.replace(/\d[\d.,]*/, '0');
}

/**
 * Os dígitos trocam de lugar e a pontuação fica: «R$ 48.312,90» →
 * «R$ 91.034,28». Sem dois dígitos diferentes não há o que embaralhar: fica
 * negativo.
 */
export function embaralhar(texto: string, r: () => number): string {
  const t = texto.trim();
  const letras = [...t];
  const posicoes = letras.flatMap((ch, i) => (/\d/.test(ch) ? [i] : []));
  const digitos = posicoes.map(i => letras[i]);
  if (new Set(digitos).size < 2) return negativar(t);
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const ordem = embaralhoDe(posicoes.length, r);
    const novo = [...letras];
    posicoes.forEach((p, k) => { novo[p] = digitos[ordem[k]]; });
    const saida = novo.join('');
    if (saida !== t) return saida;
  }
  return negativar(t);
}

/** Uma permutação de 0 a n-1 (Fisher–Yates). */
function embaralhoDe(n: number, r: () => number): number[] {
  const ordem = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1)) % (i + 1);
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  return ordem;
}

const SEM_ACENTO = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** O nome do Minecraft de cada aba e item do menu (a Poção Estranha). */
export const NOMES_MINECRAFT: Readonly<Record<string, string>> = {
  'inicio': 'Spawn',
  'dashboard': 'Spawn',
  'acordos': 'Trocas com Aldeões',
  'analitico': 'Mapa',
  'metas': 'Conquistas',
  'desafios': 'Avanços',
  'usuarios': 'Aldeões',
  'configuracoes': 'Mesa de Trabalho',
  'pix automatico': 'Circuito de Redstone',
  'pix': 'Redstone',
  'campanha facil': 'Modo Criativo',
  'mensagens': 'Chat',
  'todos': 'Inventário',
  'vendas': 'Esmeraldas',
  'fechamento': 'O Fim',
  'painel do lider': 'Trono do Dragão',
  'painel lider': 'Trono do Dragão',
  'lixeira': 'Lava',
  'chat': 'Chat',
  'tickets': 'Livros e Penas',
  'calendario': 'Relógio',
  'recebimento': 'Esmeraldas',
  'comemoracoes': 'Bolo',
  'vencidos': 'Zumbificados',
  'pagos': 'Diamantes',
  'pendentes': 'Na Fornalha',
};

/** «Zebra» → «Arbez»: de trás para frente, com a primeira maiúscula. */
export function deTrasParaFrente(texto: string): string {
  const invertido = [...texto.trim()].reverse().join('').toLowerCase();
  return invertido.charAt(0).toUpperCase() + invertido.slice(1);
}

/** A aba com nome do Minecraft; sem nome no dicionário, o nome de trás para frente. */
export function nomeEstranho(texto: string): string {
  return NOMES_MINECRAFT[SEM_ACENTO(texto)] ?? deTrasParaFrente(texto);
}

/** `quantas` posições de 0 a n-1, sorteadas, em ordem. */
export function sortear(n: number, quantas: number, r: () => number): number[] {
  const k = Math.max(0, Math.min(n, quantas));
  return embaralhoDe(n, r).slice(0, k).sort((a, b) => a - b);
}

/** Quais linhas somem: perto de 45% com a força toda, nunca nenhuma, nunca todas. */
export function sortearSumico(n: number, r: () => number, forca = 1): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const quantas = Math.min(n - 1, Math.max(1, Math.round(n * 0.45 * forca)));
  return sortear(n, quantas, r);
}

/** Quantos alvos o feitiço pega com essa força (pelo menos um). */
export function quantosAlvos(n: number, forca: number): number {
  return n <= 0 ? 0 : Math.max(1, Math.ceil(n * Math.min(1, forca)));
}

/**
 * Os «temas» da Visão Noturna: no jogo a tela fica clara demais e PISCA
 * quando o efeito vai acabar. Aqui ela pisca o tempo todo, de tema em tema.
 */
export const FILTROS_VISAO: readonly string[] = [
  'brightness(1.6) saturate(1.6)',
  'invert(1) hue-rotate(180deg)',
  'brightness(1.9) hue-rotate(200deg) saturate(1.3)',
  'hue-rotate(110deg) saturate(1.5)',
  'brightness(0.55) contrast(1.4)',
  'hue-rotate(250deg) saturate(1.8)',
];
export const PASSO_VISAO_MS = 380;
/** A Visão Noturna em negativo: a tela invertida, parada (um filtro só, sem piscar). */
export const FILTRO_NEGATIVO = 'invert(1) hue-rotate(180deg)';
/** A Visão Noturna ofuscante: claro demais, e mais claro ainda no pulso. */
export const FILTROS_OFUSCANTE: readonly string[] = ['brightness(1.75) saturate(1.25)', 'brightness(1.3) saturate(1.1)'];
/** O véu por cima da página (Cegueira e as versões leves), embaixo da bruxa, sem pegar clique. */
export const CLASSE_VEU = 'bx-enf-veu';

// ── Os filtros da raiz, empilhados ─────────────────────────────────────────
//
// A Visão Noturna e a distorção mexem no mesmo `style.filter`. Cada um põe o
// seu pedaço numa pilha, e o filtro da raiz é o original + os pedaços: um
// acabar não apaga o outro, e o último a sair devolve o original.

const pilhas = new WeakMap<HTMLElement, { original: string; pedacos: Map<string, string> }>();

let leve = false;
/** Liga o jeito leve das poções da tela toda (ver «Leve» no topo). */
export function feiticosLeves(v: boolean): void { leve = v; }

/** As cores do véu leve, no lugar dos filtros. */
export const VEU_LEVE = {
  negativo: 'rgba(20, 20, 70, .38)',
  ofuscante: 'rgba(255, 255, 255, .42)',
  encantamento: 'rgba(122, 42, 208, .16)',
} as const;
/** A Visão Noturna leve: o véu pisca entre estas cores. */
export const VISAO_LEVE: readonly string[] = [
  'rgba(255, 255, 255, .28)', 'rgba(20, 20, 60, .35)', 'rgba(120, 160, 255, .3)', 'rgba(80, 255, 140, .22)', 'rgba(0, 0, 0, .35)', 'rgba(200, 80, 255, .25)',
];

function porFiltro(raiz: HTMLElement, chave: string, valor: string | null): void {
  let p = pilhas.get(raiz);
  if (!p) {
    if (valor === null) return;
    p = { original: raiz.style.filter, pedacos: new Map() };
    pilhas.set(raiz, p);
  }
  if (valor === null) p.pedacos.delete(chave); else p.pedacos.set(chave, valor);
  if (p.pedacos.size === 0) {
    raiz.style.filter = p.original;
    if (!raiz.getAttribute('style')) raiz.removeAttribute('style');
    pilhas.delete(raiz);
    return;
  }
  raiz.style.filter = [p.original, ...p.pedacos.values()].filter(Boolean).join(' ');
}

// ── A distorção do Encantamento ────────────────────────────────────────────

export const ID_DISTORCAO = 'bx-distorcao';
const PASSO_DISTORCAO_MS = 50;

/** O filtro SVG da distorção: ruído que empurra os pixels da página. */
function filtroDistorcao(): { svg: SVGSVGElement; ruido: SVGElement; desloca: SVGElement } | null {
  if (typeof document === 'undefined') return null;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  const filtro = document.createElementNS(NS, 'filter');
  filtro.setAttribute('id', ID_DISTORCAO);
  filtro.setAttribute('x', '-5%');
  filtro.setAttribute('y', '-5%');
  filtro.setAttribute('width', '110%');
  filtro.setAttribute('height', '110%');
  const ruido = document.createElementNS(NS, 'feTurbulence');
  ruido.setAttribute('type', 'fractalNoise');
  ruido.setAttribute('baseFrequency', '0.008 0.04');
  ruido.setAttribute('numOctaves', '2');
  ruido.setAttribute('seed', '3');
  ruido.setAttribute('result', 'ruido');
  const desloca = document.createElementNS(NS, 'feDisplacementMap');
  desloca.setAttribute('in', 'SourceGraphic');
  desloca.setAttribute('in2', 'ruido');
  desloca.setAttribute('scale', '0');
  desloca.setAttribute('xChannelSelector', 'R');
  desloca.setAttribute('yChannelSelector', 'G');
  filtro.append(ruido, desloca);
  svg.append(filtro);
  document.body.appendChild(svg);
  return { svg, ruido, desloca };
}

// ── Onde cada feitiço cai ──────────────────────────────────────────────────

/** Este jeito da poção tem onde cair nesta tela? */
function varianteCabe(f: NomeFeitico, v: string, alvos: AlvosFeitico): boolean {
  switch (f) {
    case 'dano': return alvos.valores().length > 0;
    case 'estranha': return alvos.abas().length >= (v === 'trocadas' ? 2 : 1);
    case 'invisibilidade': return v === 'valores' ? alvos.valores().length > 0 : alvos.linhas().length > 0;
    default: return !!alvos.raiz();
  }
}

/** Os jeitos da poção que têm onde cair nesta tela. */
export function variantesDisponiveis(f: NomeFeitico, alvos: AlvosFeitico): Variante[] {
  return FEITICOS[f].variantes.filter(v => varianteCabe(f, v.id, alvos));
}

/** O feitiço tem onde cair nesta tela (de algum jeito)? */
export function disponivel(f: NomeFeitico, alvos: AlvosFeitico): boolean {
  return variantesDisponiveis(f, alvos).length > 0;
}

/** Sorteia o jeito da poção, outro que não o da última vez quando há outro. */
export function escolherVariante(f: NomeFeitico, alvos: AlvosFeitico, ultima: string | null | undefined, r: () => number = Math.random): string | null {
  const cabem = variantesDisponiveis(f, alvos);
  if (cabem.length === 0) return null;
  const outras = cabem.filter(v => v.id !== ultima);
  const lista = outras.length ? outras : cabem;
  return lista[Math.floor(r() * lista.length) % lista.length].id;
}

/** A linha do aviso daquele jeito da poção. */
export function encantoDa(f: NomeFeitico, variante?: string | null): string {
  const vs = FEITICOS[f].variantes;
  return (vs.find(v => v.id === variante) ?? vs[0]).encanto;
}

/** Onde a garrafa estoura (o primeiro alvo; a página, nas poções que pegam a tela toda). */
export function alvoDaPocao(f: NomeFeitico, alvos: AlvosFeitico, variante?: string | null): HTMLElement | null {
  if (f === 'dano') return alvos.valores()[0] ?? null;
  if (f === 'estranha') return alvos.abas()[0] ?? null;
  if (f === 'invisibilidade') return (variante === 'valores' ? alvos.valores()[0] : alvos.linhas()[0]) ?? null;
  return alvos.raiz();
}

export interface Lancado {
  desfazer: () => void;
  /** Os elementos atingidos (a tela solta fumaça em cada um). */
  atingidos: HTMLElement[];
}

const NADA: Lancado = { desfazer: () => {}, atingidos: [] };

function sobrepor(el: HTMLElement, texto: string, classe: string): () => void {
  // O tamanho da letra antes do feitiço: o texto novo nasce do mesmo tamanho.
  el.style.setProperty('--bx-enf-fs', getComputedStyle(el).fontSize);
  el.setAttribute(ATRIBUTO_TEXTO, texto);
  el.classList.add('bx-enf-texto', classe);
  return () => {
    el.removeAttribute(ATRIBUTO_TEXTO);
    el.classList.remove('bx-enf-texto', classe);
    el.style.removeProperty('--bx-enf-fs');
    if (!el.getAttribute('style')) el.removeAttribute('style');
    if (!el.getAttribute('class')) el.removeAttribute('class');
  };
}

/** Põe a classe nos elementos (com um atraso de animação diferente em cada, se pedido) e devolve o desfazer. */
function marcar(els: HTMLElement[], classe: string, atrasoS?: number): () => void {
  els.forEach((el, i) => {
    if (atrasoS) el.style.setProperty('--bx-enf-atraso', `${-((i * 0.37) % atrasoS).toFixed(2)}s`);
    el.classList.add(classe);
  });
  return () => els.forEach(el => {
    el.classList.remove(classe);
    if (atrasoS) el.style.removeProperty('--bx-enf-atraso');
    if (!el.getAttribute('style')) el.removeAttribute('style');
    if (!el.getAttribute('class')) el.removeAttribute('class');
  });
}

/** O véu por cima da página (a Cegueira, as poções leves). Some no `desfazer`. */
function veu(tipo: 'cegueira' | 'tinta'): { el: HTMLDivElement; desfazer: () => void } {
  const el = document.createElement('div');
  el.className = `${CLASSE_VEU} ${CLASSE_VEU}-${tipo}`;
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  return { el, desfazer: () => el.remove() };
}

/**
 * A raiz troca de filtro em roda (`filtros`) a cada `passoMs`; leve, é o véu
 * que troca de cor (`cores`), e a página por baixo não é repintada. Um filtro
 * só (ou uma cor só) fica parado.
 */
function tingir(raiz: HTMLElement, chave: string, filtros: readonly string[], cores: readonly string[], passoMs: number): () => void {
  let i = 0;
  if (leve) {
    const v = veu('tinta');
    v.el.style.background = cores[0];
    const relogio = cores.length > 1
      ? setInterval(() => { i = (i + 1) % cores.length; v.el.style.background = cores[i]; }, passoMs)
      : undefined;
    return () => { clearInterval(relogio); v.desfazer(); };
  }
  porFiltro(raiz, chave, filtros[0]);
  const relogio = filtros.length > 1
    ? setInterval(() => { i = (i + 1) % filtros.length; porFiltro(raiz, chave, filtros[i]); }, passoMs)
    : undefined;
  return () => { clearInterval(relogio); porFiltro(raiz, chave, null); };
}

/**
 * O buraco da Cegueira. A posição muda no máximo uma vez por quadro (o
 * `pointermove` pode vir bem mais vezes que isso, e cada mudança repinta o
 * véu da tela toda).
 */
function cegar(variante: string, forca: number): () => void {
  const v = veu('cegueira');
  if (variante === 'escuridao') v.el.classList.add(`${CLASSE_VEU}-escuridao`);
  // Quanto mais forte, menor o que dá para ver; a lanterna é um pouco maior (ela anda).
  const raio = Math.round((variante === 'lanterna' ? 220 : 190) - 70 * forca);
  v.el.style.setProperty('--bx-veu-raio', `${raio}px`);
  let x = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
  let y = typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
  let pedido = 0;
  const pintar = () => {
    pedido = 0;
    v.el.style.setProperty('--bx-veu-x', `${Math.round(x)}px`);
    v.el.style.setProperty('--bx-veu-y', `${Math.round(y)}px`);
  };
  const pedir = () => {
    if (pedido) return;
    pedido = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(pintar) : (pintar(), 0);
  };
  if (variante === 'lanterna') {
    // A luz passeia sozinha pela tela, numa curva de Lissajous (a 15 quadros por segundo basta).
    const inicio = typeof performance !== 'undefined' ? performance.now() : 0;
    const relogio = setInterval(() => {
      const t = ((typeof performance !== 'undefined' ? performance.now() : 0) - inicio) / 1000;
      x = window.innerWidth * (0.5 + 0.38 * Math.sin(t * 0.9));
      y = window.innerHeight * (0.5 + 0.34 * Math.sin(t * 1.3 + 1));
      pedir();
    }, 66);
    pintar();
    return () => { clearInterval(relogio); if (pedido) cancelAnimationFrame(pedido); v.desfazer(); };
  }
  const mover = (e: PointerEvent) => { x = e.clientX; y = e.clientY; pedir(); };
  window.addEventListener('pointermove', mover, { passive: true });
  pintar();
  return () => {
    window.removeEventListener('pointermove', mover);
    if (pedido) cancelAnimationFrame(pedido);
    v.desfazer();
  };
}

// ── O que cada feitiço faz ─────────────────────────────────────────────────

/** Lança o feitiço com a força dada (1 = vida cheia), do jeito pedido (o primeiro, se nenhum). */
export function lancar(
  f: NomeFeitico, alvos: AlvosFeitico, r: () => number = Math.random, forca = 1, variante: string = FEITICOS[f].variantes[0].id,
): Lancado {
  if (f === 'dano') {
    const todos = alvos.valores();
    const els = sortear(todos.length, quantosAlvos(todos.length, forca), r).map(i => todos[i]);
    const novo = (t: string) => (variante === 'zerado' ? zerar(t) : variante === 'embaralhado' ? embaralhar(t, r) : negativar(t));
    const desfaz = els.map(el => sobrepor(el, novo(el.textContent ?? ''), 'bx-enf-negativo'));
    return { desfazer: () => desfaz.forEach(x => x()), atingidos: els };
  }
  if (f === 'estranha') {
    const todos = alvos.abas();
    const trocadas = variante === 'trocadas' && todos.length >= 2;
    const els = sortear(todos.length, Math.max(trocadas ? 2 : 1, quantosAlvos(todos.length, forca)), r).map(i => todos[i]);
    const textos = els.map(el => (el.textContent ?? '').trim());
    const novo = (i: number) => (trocadas ? textos[(i + 1) % els.length] : variante === 'avesso' ? deTrasParaFrente(textos[i]) : nomeEstranho(textos[i]));
    const desfaz = els.map((el, i) => sobrepor(el, novo(i), 'bx-enf-aba'));
    return { desfazer: () => desfaz.forEach(x => x()), atingidos: els };
  }
  if (f === 'invisibilidade') {
    if (variante === 'valores') {
      const valores = alvos.valores();
      const els = sortear(valores.length, quantosAlvos(valores.length, forca), r).map(i => valores[i]);
      return { desfazer: marcar(els, 'bx-enf-sumido'), atingidos: els };
    }
    const linhas = alvos.linhas();
    if (variante === 'fantasma') {
      // Mais linhas que no sumiço, mas nenhuma some de vez: piscam, cada uma no seu tempo.
      const els = sortear(linhas.length, quantosAlvos(Math.ceil(linhas.length * 0.7), forca), r).map(i => linhas[i]);
      return { desfazer: marcar(els, 'bx-enf-fantasma', 1.4), atingidos: els };
    }
    const els = sortearSumico(linhas.length, r, forca).map(i => linhas[i]);
    return { desfazer: marcar(els, 'bx-enf-sumido'), atingidos: els };
  }
  if (f === 'visao') {
    const raiz = alvos.raiz();
    if (!raiz) return NADA;
    const desfazer = variante === 'negativo'
      ? tingir(raiz, 'visao', [FILTRO_NEGATIVO], [VEU_LEVE.negativo], PASSO_VISAO_MS)
      : variante === 'ofuscante'
        ? tingir(raiz, 'visao', FILTROS_OFUSCANTE, [VEU_LEVE.ofuscante, 'rgba(255, 255, 255, .2)'], PASSO_VISAO_MS * 1.5)
        : tingir(raiz, 'visao', FILTROS_VISAO, VISAO_LEVE, PASSO_VISAO_MS);
    return { desfazer, atingidos: [raiz] };
  }
  if (f === 'cegueira') {
    const raiz = alvos.raiz();
    if (!raiz) return NADA;
    return { desfazer: cegar(variante, forca), atingidos: [raiz] };
  }
  if (f === 'encantamento') {
    const raiz = alvos.raiz();
    if (!raiz) return NADA;
    // As abas viram runas, todas: o feitiço forte não escolhe. No «tudo», os valores também.
    const textos = variante === 'tudo' ? [...alvos.abas(), ...alvos.valores()] : alvos.abas();
    const desfazTextos = textos.map(el => sobrepor(el, paraGalatico(el.textContent ?? ''), 'bx-enf-galatico'));
    // Leve: sem a distorção (o filtro SVG na página toda é o mais caro de todos); fica um véu roxo.
    const d = leve ? null : filtroDistorcao();
    const veuLeve = leve ? veu('tinta') : null;
    if (veuLeve) veuLeve.el.style.background = VEU_LEVE.encantamento;
    let fase = 0;
    let passo = 0;
    const forte = 8 + 14 * forca;
    if (d) porFiltro(raiz, 'encantamento', `url(#${ID_DISTORCAO})`);
    const relogio = d ? setInterval(() => {
      fase += 0.35;
      passo += 1;
      // A onda respira, e o ruído troca de semente aos saltos (o «glitch»).
      d.desloca.setAttribute('scale', (forte * (0.55 + 0.45 * Math.sin(fase))).toFixed(1));
      d.ruido.setAttribute('baseFrequency', `0.008 ${(0.03 + 0.015 * Math.sin(fase * 0.7)).toFixed(4)}`);
      if (passo % 6 === 0) d.ruido.setAttribute('seed', String(1 + (passo % 50)));
    }, PASSO_DISTORCAO_MS) : undefined;
    return {
      desfazer: () => {
        clearInterval(relogio);
        if (d) porFiltro(raiz, 'encantamento', null);
        d?.svg.remove();
        veuLeve?.desfazer();
        desfazTextos.forEach(x => x());
      },
      atingidos: [raiz, ...textos],
    };
  }
  return NADA;
}
