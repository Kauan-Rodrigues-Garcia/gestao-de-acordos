/**
 * feiticos.ts — as poções que a Bruxa do Pântano joga na tela do Gestão.
 *
 * Como a bruxa do Minecraft, ela ataca com POÇÕES DE ARREMESSO: a garrafa voa
 * em arco, estoura no alvo e o efeito pega o que estiver ali. Cada feitiço é
 * uma poção do jogo, na cor dela (`InfoFeitico.cor`):
 *
 *   dano            Poção de Dano Instantâneo: o recebido fica negativo
 *   estranha        Poção Estranha: as abas ganham nome do Minecraft
 *   invisibilidade  Poção de Invisibilidade: acordos somem
 *   visao           Poção de Visão Noturna: a tela pisca de tema em tema
 *   lentidao        Poção de Lentidão: teias de aranha pela tela, tudo apagado
 *   encantamento    o forte, da mesa de encantamento: abas em runas do
 *                   Alfabeto Galáctico e a tela ondulando (a náusea do jogo)
 *   cegueira        Poção de Cegueira: a tela escurece, só a volta do mouse
 *                   fica à vista (15/10/2026)
 *   veneno          Poção de Veneno: a tela esverdeia e a borda pulsa, como os
 *                   corações verdes do jogo (15/10/2026)
 *   fraqueza        Poção de Fraqueza: a tela perde a cor e as abas desbotam
 *                   (15/10/2026)
 *   levitacao       Poção de Levitação: as abas e os valores flutuam, cada um
 *                   no seu ritmo (15/10/2026)
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
 *   valor   um número de dinheiro (recebido, projeção): fica negativo
 *   aba     o rótulo de uma aba ou item do menu: ganha nome do Minecraft
 *   linha   uma linha de acordo: some por um tempo
 *
 * e na `raiz` (a página toda), onde a Visão Noturna troca as cores, a
 * Lentidão apaga e o Encantamento distorce.
 *
 * ## A força (15/10/2026)
 *
 * Quanto mais rachada ela está, mais fraca a poção: pega menos alvos e dura
 * menos (`forca`, de 0,35 com a vida no fim a 1 com a vida cheia). Na tela
 * isso é o nível da poção, como no jogo: II forte, I fraca (`nivelDaPocao`).
 */
import { paraGalatico } from './galatico';

export type NomeFeitico =
  | 'dano' | 'estranha' | 'invisibilidade' | 'visao' | 'lentidao' | 'encantamento'
  | 'cegueira' | 'veneno' | 'fraqueza' | 'levitacao';

export interface InfoFeitico {
  /** Como aparece no aviso: «Poção de Dano Instantâneo». */
  titulo: string;
  /** O que acontece, em uma linha. */
  encanto: string;
  /** Com a força toda. */
  duracaoMs: number;
  /** A cor do líquido e das partículas (as do jogo, puxadas para ler bem). */
  cor: string;
  corClara: string;
}

export const FEITICOS: Readonly<Record<NomeFeitico, InfoFeitico>> = {
  dano: { titulo: 'Poção de Dano Instantâneo', encanto: 'Todo saldo virou dívida!', duracaoMs: 12_000, cor: '#8a1a14', corClara: '#e0503a' },
  estranha: { titulo: 'Poção Estranha', encanto: 'Nada tem o nome certo!', duracaoMs: 12_000, cor: '#385dc6', corClara: '#8aa8ff' },
  invisibilidade: { titulo: 'Poção de Invisibilidade', encanto: 'Os acordos sumiram!', duracaoMs: 10_000, cor: '#7f8392', corClara: '#d0d4e0' },
  visao: { titulo: 'Poção de Visão Noturna', encanto: 'A tela pisca!', duracaoMs: 6_000, cor: '#1f1fa1', corClara: '#6a6aff' },
  lentidao: { titulo: 'Poção de Lentidão', encanto: 'Teias por toda parte!', duracaoMs: 9_000, cor: '#5a6c81', corClara: '#aab8c8' },
  encantamento: { titulo: 'Encantamento', encanto: 'A tela inteira se dobra!', duracaoMs: 8_000, cor: '#7a2ad0', corClara: '#d08aff' },
  cegueira: { titulo: 'Poção de Cegueira', encanto: 'Só dá para ver em volta do mouse!', duracaoMs: 7_000, cor: '#1f1f23', corClara: '#6a6a78' },
  veneno: { titulo: 'Poção de Veneno', encanto: 'O Gestão está envenenado!', duracaoMs: 9_000, cor: '#4e9331', corClara: '#9ad86a' },
  fraqueza: { titulo: 'Poção de Fraqueza', encanto: 'A tela perdeu as forças!', duracaoMs: 9_000, cor: '#484d48', corClara: '#9aa09a' },
  levitacao: { titulo: 'Poção de Levitação', encanto: 'Nada fica parado!', duracaoMs: 10_000, cor: '#ceffff', corClara: '#ffffff' },
};

export const LISTA_FEITICOS: readonly NomeFeitico[] = [
  'dano', 'estranha', 'invisibilidade', 'visao', 'lentidao', 'encantamento', 'cegueira', 'veneno', 'fraqueza', 'levitacao',
];

/** As poções que pegam a tela toda (a página, sem precisar de alvo marcado). */
const DA_TELA: readonly NomeFeitico[] = ['visao', 'encantamento', 'lentidao', 'cegueira', 'veneno', 'fraqueza'];

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

/** A aba com nome do Minecraft; sem nome no dicionário, o nome de trás para frente. */
export function nomeEstranho(texto: string): string {
  const chave = SEM_ACENTO(texto);
  const certo = NOMES_MINECRAFT[chave];
  if (certo) return certo;
  const invertido = [...texto.trim()].reverse().join('').toLowerCase();
  return invertido.charAt(0).toUpperCase() + invertido.slice(1);
}

/** `quantas` posições de 0 a n-1, sorteadas, em ordem. */
export function sortear(n: number, quantas: number, r: () => number): number[] {
  const k = Math.max(0, Math.min(n, quantas));
  const ordem = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1)) % (i + 1);
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  return ordem.slice(0, k).sort((a, b) => a - b);
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

/** A Lentidão: tudo mais apagado e azulado (as teias o palco desenha). */
export const FILTRO_LENTIDAO = 'saturate(0.45) brightness(0.92) hue-rotate(-12deg)';
/** O Veneno: a tela esverdeada. */
export const FILTRO_VENENO = 'sepia(0.35) hue-rotate(45deg) saturate(1.35)';
/** A Fraqueza: a tela sem cor e sem contraste. */
export const FILTRO_FRAQUEZA = 'grayscale(0.85) contrast(0.88) brightness(1.04)';
/** O véu da Cegueira e a borda do Veneno: por cima da página, embaixo da bruxa, sem pegar clique. */
export const CLASSE_VEU = 'bx-enf-veu';

// ── Os filtros da raiz, empilhados ─────────────────────────────────────────
//
// A Visão Noturna, a Lentidão e a distorção mexem no mesmo `style.filter`. Cada um põe o
// seu pedaço numa pilha, e o filtro da raiz é o original + os pedaços: um
// acabar não apaga o outro, e o último a sair devolve o original.

const pilhas = new WeakMap<HTMLElement, { original: string; pedacos: Map<string, string> }>();

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

// ── O que cada feitiço faz ─────────────────────────────────────────────────

/** O feitiço tem onde cair nesta tela? */
export function disponivel(f: NomeFeitico, alvos: AlvosFeitico): boolean {
  if (DA_TELA.includes(f)) return !!alvos.raiz();
  if (f === 'levitacao') return alvos.abas().length + alvos.valores().length > 0;
  if (f === 'dano') return alvos.valores().length > 0;
  if (f === 'estranha') return alvos.abas().length > 0;
  return alvos.linhas().length > 0;
}

/** Onde a garrafa estoura (o primeiro alvo; a página, nas poções que pegam a tela toda). */
export function alvoDaPocao(f: NomeFeitico, alvos: AlvosFeitico): HTMLElement | null {
  if (f === 'dano') return alvos.valores()[0] ?? null;
  if (f === 'estranha') return alvos.abas()[0] ?? null;
  if (f === 'invisibilidade') return alvos.linhas()[0] ?? null;
  if (f === 'levitacao') return alvos.abas()[0] ?? alvos.valores()[0] ?? null;
  return alvos.raiz();
}

export interface Lancado {
  desfazer: () => void;
  /** Os elementos atingidos (a tela solta fumaça em cada um). */
  atingidos: HTMLElement[];
}

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

/** O véu por cima da página (a Cegueira, a borda do Veneno). Some no `desfazer`. */
function veu(tipo: 'cegueira' | 'veneno'): { el: HTMLDivElement; desfazer: () => void } {
  const el = document.createElement('div');
  el.className = `${CLASSE_VEU} ${CLASSE_VEU}-${tipo}`;
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  return { el, desfazer: () => el.remove() };
}

/** Lança o feitiço com a força dada (1 = vida cheia). */
export function lancar(f: NomeFeitico, alvos: AlvosFeitico, r: () => number = Math.random, forca = 1): Lancado {
  if (f === 'dano' || f === 'estranha') {
    const todos = f === 'dano' ? alvos.valores() : alvos.abas();
    const els = sortear(todos.length, quantosAlvos(todos.length, forca), r).map(i => todos[i]);
    const desfaz = els.map(el => (f === 'dano'
      ? sobrepor(el, negativar(el.textContent ?? ''), 'bx-enf-negativo')
      : sobrepor(el, nomeEstranho(el.textContent ?? ''), 'bx-enf-aba')));
    return { desfazer: () => desfaz.forEach(x => x()), atingidos: els };
  }
  if (f === 'invisibilidade') {
    const linhas = alvos.linhas();
    const els = sortearSumico(linhas.length, r, forca).map(i => linhas[i]);
    els.forEach(el => el.classList.add('bx-enf-sumido'));
    return {
      desfazer: () => els.forEach(el => {
        el.classList.remove('bx-enf-sumido');
        if (!el.getAttribute('class')) el.removeAttribute('class');
      }),
      atingidos: els,
    };
  }
  if (f === 'visao') {
    const raiz = alvos.raiz();
    if (!raiz) return { desfazer: () => {}, atingidos: [] };
    let i = 0;
    porFiltro(raiz, 'visao', FILTROS_VISAO[0]);
    const relogio = setInterval(() => {
      i = (i + 1) % FILTROS_VISAO.length;
      porFiltro(raiz, 'visao', FILTROS_VISAO[i]);
    }, PASSO_VISAO_MS);
    return {
      desfazer: () => { clearInterval(relogio); porFiltro(raiz, 'visao', null); },
      atingidos: [raiz],
    };
  }
  if (f === 'lentidao') {
    const raiz = alvos.raiz();
    if (!raiz) return { desfazer: () => {}, atingidos: [] };
    porFiltro(raiz, 'lentidao', FILTRO_LENTIDAO);
    // As teias caem em parte das abas, dos valores e das linhas (o palco desenha).
    const todos = [...alvos.abas(), ...alvos.valores(), ...alvos.linhas()];
    const els = sortear(todos.length, Math.min(10, quantosAlvos(Math.ceil(todos.length * 0.4), forca)), r).map(i => todos[i]);
    return { desfazer: () => porFiltro(raiz, 'lentidao', null), atingidos: [raiz, ...els] };
  }
  if (f === 'encantamento') {
    const raiz = alvos.raiz();
    if (!raiz) return { desfazer: () => {}, atingidos: [] };
    // As abas viram runas, todas: o feitiço forte não escolhe.
    const abas = alvos.abas();
    const desfazAbas = abas.map(el => sobrepor(el, paraGalatico(el.textContent ?? ''), 'bx-enf-galatico'));
    const d = filtroDistorcao();
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
        porFiltro(raiz, 'encantamento', null);
        d?.svg.remove();
        desfazAbas.forEach(x => x());
      },
      atingidos: [raiz, ...abas],
    };
  }
  if (f === 'cegueira') {
    const raiz = alvos.raiz();
    if (!raiz) return { desfazer: () => {}, atingidos: [] };
    // O buraco do véu segue o mouse: quanto mais forte, menor o que dá para ver.
    const v = veu('cegueira');
    v.el.style.setProperty('--bx-veu-raio', `${Math.round(190 - 70 * forca)}px`);
    const mover = (e: PointerEvent) => {
      v.el.style.setProperty('--bx-veu-x', `${e.clientX}px`);
      v.el.style.setProperty('--bx-veu-y', `${e.clientY}px`);
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return { desfazer: () => { window.removeEventListener('pointermove', mover); v.desfazer(); }, atingidos: [raiz] };
  }
  if (f === 'veneno' || f === 'fraqueza') {
    const raiz = alvos.raiz();
    if (!raiz) return { desfazer: () => {}, atingidos: [] };
    porFiltro(raiz, f, f === 'veneno' ? FILTRO_VENENO : FILTRO_FRAQUEZA);
    const borda = f === 'veneno' ? veu('veneno') : null;
    // Na Fraqueza as abas desbotam também (parte delas, pela força).
    const abas = f === 'fraqueza' ? alvos.abas() : [];
    const fracas = sortear(abas.length, quantosAlvos(abas.length, forca * 0.7), r).map(i => abas[i]);
    fracas.forEach(el => el.classList.add('bx-enf-fraco'));
    return {
      desfazer: () => {
        porFiltro(raiz, f, null);
        borda?.desfazer();
        fracas.forEach(el => {
          el.classList.remove('bx-enf-fraco');
          if (!el.getAttribute('class')) el.removeAttribute('class');
        });
      },
      atingidos: [raiz, ...fracas],
    };
  }
  if (f === 'levitacao') {
    const todos = [...alvos.abas(), ...alvos.valores()];
    const els = sortear(todos.length, quantosAlvos(todos.length, forca), r).map(i => todos[i]);
    // Cada um sobe e desce no seu tempo, como mob levitando.
    els.forEach((el, i) => {
      el.style.setProperty('--bx-enf-atraso', `${-((i * 0.37) % 1.6)}s`);
      el.classList.add('bx-enf-levita');
    });
    return {
      desfazer: () => els.forEach(el => {
        el.classList.remove('bx-enf-levita');
        el.style.removeProperty('--bx-enf-atraso');
        if (!el.getAttribute('style')) el.removeAttribute('style');
        if (!el.getAttribute('class')) el.removeAttribute('class');
      }),
      atingidos: els,
    };
  }
  return { desfazer: () => {}, atingidos: [] };
}
