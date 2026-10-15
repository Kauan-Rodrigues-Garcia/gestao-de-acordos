/**
 * design.ts — tudo o que define a aparência do card da Comemoração 2.0.
 *
 * O texto (título e mensagem) continua nas colunas de sempre da tabela
 * `comemoracoes`; o resto mora aqui e vai para a coluna JSONB `design`
 * (migration 20261015120000). Comemoração sem `design` é da versão 1 e segue
 * desenhada pelo card antigo.
 *
 * As posições são % de um card de proporção fixa (640×400 lógicos), nunca
 * pixels: o que o líder monta no monitor grande é o que o operador vê no
 * notebook.
 *
 * Puro e sem React: o arrasto, o modelo e a leitura do JSON têm teste sem
 * montar tela.
 */
import { PAPEL_PADRAO, papelValido } from './papeisDeParede';

// ── Geometria ────────────────────────────────────────────────────────────────

export const LARGURA_CARD = 640;
export const ALTURA_CARD  = 400;

/** Distância mínima do centro de um elemento até a borda, em %. */
export const MARGEM_PCT = 5;
export const ESCALA_MIN = 0.5;
export const ESCALA_MAX = 2;

export type ElementoCard = 'selo' | 'titulo' | 'mensagem' | 'midia' | 'pessoas';

export const ELEMENTOS_CARD: readonly { id: ElementoCard; nome: string }[] = [
  { id: 'selo',     nome: 'Selo' },
  { id: 'titulo',   nome: 'Título' },
  { id: 'midia',    nome: 'GIF / troféu' },
  { id: 'mensagem', nome: 'Mensagem' },
  { id: 'pessoas',  nome: 'Fotos e nomes' },
];

export interface Posicao {
  /** Centro, em % da largura. */
  x: number;
  /** Centro, em % da altura. */
  y: number;
  /** 1 = tamanho natural. */
  escala: number;
}

export type Posicoes = Record<ElementoCard, Posicao>;

// ── Modelos (arranjos prontos) ───────────────────────────────────────────────

export type ModeloId = 'classico' | 'lado' | 'palco' | 'so-texto';

export interface Modelo {
  id:        ModeloId;
  nome:      string;
  descricao: string;
  posicoes:  Posicoes;
  /** O modelo só-texto esconde o GIF/troféu. */
  comMidia:  boolean;
}

export const MODELOS: readonly Modelo[] = [
  {
    id: 'classico', nome: 'Clássico', descricao: 'Imagem no alto, texto embaixo.', comMidia: true,
    posicoes: {
      selo:     { x: 50, y: 9,  escala: 1 },
      midia:    { x: 50, y: 30, escala: 0.95 },
      titulo:   { x: 50, y: 55, escala: 1 },
      mensagem: { x: 50, y: 69, escala: 1 },
      pessoas:  { x: 50, y: 86, escala: 1 },
    },
  },
  {
    id: 'lado', nome: 'Lado a lado', descricao: 'Imagem à esquerda, texto à direita.', comMidia: true,
    posicoes: {
      midia:    { x: 24, y: 50, escala: 1.15 },
      selo:     { x: 68, y: 20, escala: 1 },
      titulo:   { x: 68, y: 38, escala: 0.85 },
      mensagem: { x: 68, y: 58, escala: 1 },
      pessoas:  { x: 68, y: 80, escala: 1 },
    },
  },
  {
    id: 'palco', nome: 'Palco', descricao: 'Título grande no alto, imagem no centro.', comMidia: true,
    posicoes: {
      selo:     { x: 50, y: 8,  escala: 1 },
      titulo:   { x: 50, y: 21, escala: 1.05 },
      midia:    { x: 50, y: 47, escala: 0.85 },
      mensagem: { x: 50, y: 70, escala: 1 },
      pessoas:  { x: 50, y: 86, escala: 0.95 },
    },
  },
  {
    id: 'so-texto', nome: 'Só texto', descricao: 'Sem imagem: o fundo e o texto falam.', comMidia: false,
    posicoes: {
      selo:     { x: 50, y: 18, escala: 1 },
      titulo:   { x: 50, y: 38, escala: 1.3 },
      mensagem: { x: 50, y: 58, escala: 1.1 },
      pessoas:  { x: 50, y: 79, escala: 1.1 },
      midia:    { x: 50, y: 50, escala: 1 },
    },
  },
];

export const MODELO_PADRAO: ModeloId = 'classico';

export function modeloPorId(id: ModeloId): Modelo {
  return MODELOS.find((m) => m.id === id) ?? MODELOS[0];
}

// ── Letras, entradas e efeitos ───────────────────────────────────────────────

export type FonteId = 'impacto' | 'moderna' | 'elegante' | 'divertida';

export const FONTES: readonly { id: FonteId; nome: string; familia: string; peso: number; maiusculas: boolean }[] = [
  { id: 'impacto',   nome: 'Impacto',   familia: '"Anton", "Impact", sans-serif',                   peso: 400, maiusculas: true },
  { id: 'moderna',   nome: 'Moderna',   familia: '"Bricolage Grotesque", "Inter", sans-serif',     peso: 800, maiusculas: false },
  { id: 'elegante',  nome: 'Elegante',  familia: '"Fraunces", Georgia, serif',                       peso: 700, maiusculas: false },
  { id: 'divertida', nome: 'Divertida', familia: '"Fredoka", "Inter", sans-serif',                   peso: 700, maiusculas: false },
];

export type EntradaId = 'suave' | 'impacto' | 'maquina' | 'letreiro';

export const ENTRADAS: readonly { id: EntradaId; nome: string; descricao: string }[] = [
  { id: 'suave',    nome: 'Suave',      descricao: 'Sobe e aparece.' },
  { id: 'impacto',  nome: 'Impacto',    descricao: 'Entra com estouro.' },
  { id: 'maquina',  nome: 'Digitando',  descricao: 'Letra por letra.' },
  { id: 'letreiro', nome: 'Letreiro',   descricao: 'Um brilho passa pelo título.' },
];

export type EfeitoId = 'confete' | 'estrelas' | 'moedas' | 'nenhum';

export const EFEITOS: readonly { id: EfeitoId; nome: string; descricao: string }[] = [
  { id: 'confete',  nome: 'Confete',  descricao: 'Papelotes estouram em volta do card.' },
  { id: 'estrelas', nome: 'Estrelas', descricao: 'Brilhos sobem e piscam.' },
  { id: 'moedas',   nome: 'Moedas',   descricao: 'Moedas douradas caem.' },
  { id: 'nenhum',   nome: 'Nenhum',   descricao: 'Só o card.' },
];

// ── GIF ──────────────────────────────────────────────────────────────────────

export interface GifCard {
  id:      string;
  titulo:  string;
  /** Versão do card (maior). */
  url:     string;
  /** Versão da grade (leve). */
  previa:  string;
  largura: number;
  altura:  number;
}

/**
 * Só GIF servido pelo GIPHY entra no card.
 *
 * O card aparece na tela da empresa inteira: aceitar qualquer endereço
 * deixaria quem monta apontar uma imagem para um servidor próprio e colher o
 * IP de todo mundo que a viu. O seletor só oferece GIPHY; isto garante que o
 * JSON gravado à mão também não passe.
 */
export function urlDeGifConfiavel(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 600) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'giphy.com' || u.hostname.endsWith('.giphy.com'));
  } catch {
    return false;
  }
}

// ── O design inteiro ─────────────────────────────────────────────────────────

export const MAX_SELO = 32;

export interface DesignCard {
  versao:   2;
  papel:    string;
  fonte:    FonteId;
  entrada:  EntradaId;
  efeito:   EfeitoId;
  /** Texto curto acima do título ("META DE OUTUBRO"). Vazio = sem selo. */
  selo:     string;
  /** false = o card não mostra GIF nem troféu. */
  comMidia: boolean;
  gif:      GifCard | null;
  posicoes: Posicoes;
}

export function designPadrao(): DesignCard {
  const modelo = modeloPorId(MODELO_PADRAO);
  return {
    versao:   2,
    papel:    PAPEL_PADRAO,
    fonte:    'impacto',
    entrada:  'impacto',
    efeito:   'confete',
    selo:     '',
    comMidia: modelo.comMidia,
    gif:      null,
    posicoes: clonarPosicoes(modelo.posicoes),
  };
}

function clonarPosicoes(p: Posicoes): Posicoes {
  return {
    selo:     { ...p.selo },
    titulo:   { ...p.titulo },
    mensagem: { ...p.mensagem },
    midia:    { ...p.midia },
    pessoas:  { ...p.pessoas },
  };
}

/** Aplica um modelo: troca as posições e liga/desliga a imagem. */
export function aplicarModelo(design: DesignCard, id: ModeloId): DesignCard {
  const m = modeloPorId(id);
  return { ...design, posicoes: clonarPosicoes(m.posicoes), comMidia: m.comMidia };
}

const ARREDONDA = (n: number) => Math.round(n * 10) / 10;

function mesmasPosicoes(a: Posicoes, b: Posicoes): boolean {
  return ELEMENTOS_CARD.every(({ id }) =>
    ARREDONDA(a[id].x) === ARREDONDA(b[id].x)
    && ARREDONDA(a[id].y) === ARREDONDA(b[id].y)
    && ARREDONDA(a[id].escala) === ARREDONDA(b[id].escala));
}

/** O modelo em vigor, ou null quando alguém arrastou algo ("personalizado"). */
export function modeloDoDesign(design: DesignCard): ModeloId | null {
  const m = MODELOS.find((mod) => mod.comMidia === design.comMidia && mesmasPosicoes(mod.posicoes, design.posicoes));
  return m?.id ?? null;
}

// ── Mexer nas posições ───────────────────────────────────────────────────────

function limitar(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function limitarPosicao(p: Posicao): Posicao {
  return {
    x: limitar(p.x, MARGEM_PCT, 100 - MARGEM_PCT),
    y: limitar(p.y, MARGEM_PCT, 100 - MARGEM_PCT),
    escala: limitar(p.escala, ESCALA_MIN, ESCALA_MAX),
  };
}

/**
 * Nova posição depois de arrastar `dx`,`dy` pixels de TELA num card que mede
 * `largura`×`altura` pixels de tela. Converter aqui, e não no componente, é o
 * que deixa o arrasto igual em qualquer zoom do editor.
 */
export function arrastar(
  design: DesignCard,
  elemento: ElementoCard,
  inicio: Posicao,
  dx: number, dy: number,
  largura: number, altura: number,
): DesignCard {
  if (largura <= 0 || altura <= 0) return design;
  const nova = limitarPosicao({
    x: inicio.x + (dx / largura) * 100,
    y: inicio.y + (dy / altura) * 100,
    escala: inicio.escala,
  });
  return { ...design, posicoes: { ...design.posicoes, [elemento]: nova } };
}

export function escalar(design: DesignCard, elemento: ElementoCard, escala: number): DesignCard {
  const atual = design.posicoes[elemento];
  return {
    ...design,
    posicoes: { ...design.posicoes, [elemento]: limitarPosicao({ ...atual, escala }) },
  };
}

/**
 * Largura disponível para um bloco de texto centrado em `x`, em %.
 *
 * Centrado no meio, o texto pode ocupar quase o card todo; puxado para a
 * direita, ele só tem o espaço até a borda. Calcular em vez de fixar é o que
 * faz o modelo "lado a lado" e o arrasto livre não cortarem palavra.
 */
export function larguraDoTexto(x: number, maximo = 88): number {
  const espaco = 2 * Math.min(x, 100 - x) - 8;
  return limitar(espaco, 28, maximo);
}

/** Escala do card na tela: `largura` pixels reais sobre os 640 lógicos. */
export function escalaDoCard(largura: number): number {
  if (!Number.isFinite(largura) || largura <= 0) return 1;
  return largura / LARGURA_CARD;
}

// ── Texto ────────────────────────────────────────────────────────────────────

/** "Ana", "Ana e João", "Ana, João e Carla", "Ana, João e mais 4". */
export function nomesDoCard(pessoas: { nome: string }[]): string {
  const nomes = pessoas.map((p) => p.nome.trim().split(/\s+/)[0] ?? p.nome);
  if (nomes.length <= 1) return nomes[0] ?? '';
  if (nomes.length <= 3) return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return `${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2}`;
}

// ── JSON do banco ────────────────────────────────────────────────────────────

const FONTES_IDS   = new Set<string>(FONTES.map((f) => f.id));
const ENTRADAS_IDS = new Set<string>(ENTRADAS.map((e) => e.id));
const EFEITOS_IDS  = new Set<string>(EFEITOS.map((e) => e.id));

function numero(v: unknown, padrao: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : padrao;
}

function textoCurto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function gifDoJson(v: unknown): GifCard | null {
  if (!v || typeof v !== 'object') return null;
  const g = v as Record<string, unknown>;
  if (!urlDeGifConfiavel(g.url)) return null;
  return {
    id:      textoCurto(g.id, 64),
    titulo:  textoCurto(g.titulo, 140),
    url:     g.url,
    previa:  urlDeGifConfiavel(g.previa) ? g.previa : g.url,
    largura: limitar(numero(g.largura, 200), 1, 4000),
    altura:  limitar(numero(g.altura, 200), 1, 4000),
  };
}

/**
 * Coluna `design` → design que sabemos desenhar, ou null (comemoração v1).
 *
 * A coluna é JSONB livre do ponto de vista do Postgres: tudo é saneado aqui,
 * campo a campo, e valor desconhecido cai no padrão em vez de quebrar a festa
 * na tela de todo mundo.
 */
export function designDoJson(valor: unknown): DesignCard | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  if (v.versao !== 2) return null;

  const base = designPadrao();
  const posJson = (v.posicoes && typeof v.posicoes === 'object') ? v.posicoes as Record<string, unknown> : {};
  const posicoes = { ...base.posicoes };
  for (const { id } of ELEMENTOS_CARD) {
    const p = posJson[id] as Record<string, unknown> | undefined;
    if (!p || typeof p !== 'object') continue;
    posicoes[id] = limitarPosicao({
      x: numero(p.x, base.posicoes[id].x),
      y: numero(p.y, base.posicoes[id].y),
      escala: numero(p.escala, 1),
    });
  }

  return {
    versao:   2,
    papel:    papelValido(v.papel) ? v.papel : base.papel,
    fonte:    FONTES_IDS.has(String(v.fonte))     ? v.fonte as FonteId     : base.fonte,
    entrada:  ENTRADAS_IDS.has(String(v.entrada)) ? v.entrada as EntradaId : base.entrada,
    efeito:   EFEITOS_IDS.has(String(v.efeito))   ? v.efeito as EfeitoId   : base.efeito,
    selo:     textoCurto(v.selo, MAX_SELO),
    comMidia: v.comMidia !== false,
    gif:      gifDoJson(v.gif),
    posicoes,
  };
}

/** Design → JSON enxuto para o banco (números arredondados). */
export function designParaJson(d: DesignCard): Record<string, unknown> {
  const posicoes: Record<string, Posicao> = {};
  for (const { id } of ELEMENTOS_CARD) {
    const p = d.posicoes[id];
    posicoes[id] = { x: ARREDONDA(p.x), y: ARREDONDA(p.y), escala: Math.round(p.escala * 100) / 100 };
  }
  return {
    versao:   2,
    papel:    d.papel,
    fonte:    d.fonte,
    entrada:  d.entrada,
    efeito:   d.efeito,
    selo:     d.selo.trim().slice(0, MAX_SELO),
    comMidia: d.comMidia,
    gif:      d.gif,
    posicoes,
  };
}

// ── Ponte com as colunas da versão 1 ─────────────────────────────────────────

/**
 * Enquanto a 2.0 não for de todos, quem ainda roda o app antigo recebe a
 * comemoração pelas colunas de sempre. Estes mapas dão a ela o efeito e a
 * animação mais parecidos com o que foi montado.
 */
export function efeitoV1(efeito: EfeitoId): 'confete' | 'chuva-moedas' | 'nenhum' {
  if (efeito === 'moedas') return 'chuva-moedas';
  if (efeito === 'nenhum') return 'nenhum';
  return 'confete';
}

export function animTextoV1(entrada: EntradaId): 'subir' | 'pop' | 'maquina' | 'brilho' {
  if (entrada === 'impacto')  return 'pop';
  if (entrada === 'maquina')  return 'maquina';
  if (entrada === 'letreiro') return 'brilho';
  return 'subir';
}
