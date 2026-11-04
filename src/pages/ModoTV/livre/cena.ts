/**
 * cena.ts — o formato da «Cena livre» do Modo TV (30/10/2026).
 *
 * A cena é um fundo e uma pilha de elementos (texto, imagem, número ao vivo,
 * relógio, forma), cada um num retângulo em % do palco de 1920×1080. Em % e
 * não em pixels pelo mesmo motivo do card das Comemorações: a prévia do
 * estúdio, a da montagem e a TV desenham o MESMO palco em tamanhos diferentes.
 *
 * Mora em `tv_paineis.telas[].opcoes.cena`, um jsonb que o cliente escreve.
 * Por isso tudo o que se lê passa por `cenaValida`: coordenada que não é
 * número, cor que não é cor, elemento de tipo desconhecido — nada disso chega
 * à parede. A mídia ainda passa por `midiaSegura` na hora de desenhar.
 *
 * Puro: sem React, sem banco, sem `templates.ts` (que importa daqui).
 */

export type MetricaLivre =
  | 'recebido' | 'meta' | 'falta' | 'percentual' | 'hoje' | 'meta_hoje' | 'ritmo' | 'projecao';

export const METRICAS: readonly { id: MetricaLivre; nome: string }[] = [
  { id: 'recebido',   nome: 'Recebido no mês' },
  { id: 'meta',       nome: 'Meta do mês' },
  { id: 'falta',      nome: 'Falta para a meta' },
  { id: 'percentual', nome: '% da meta' },
  { id: 'hoje',       nome: 'Recebido hoje' },
  { id: 'meta_hoje',  nome: 'Meta de hoje' },
  { id: 'ritmo',      nome: 'Precisa por dia útil' },
  { id: 'projecao',   nome: 'Projeção do mês' },
];

export type FonteLivre = 'padrao' | 'impacto' | 'moderna' | 'elegante' | 'divertida' | 'pixel' | 'manuscrita';

/** As quatro das Comemorações, a do sistema e duas a mais para a parede. */
export const FONTES_LIVRES: readonly { id: FonteLivre; nome: string; familia: string; peso: number; maiusculas: boolean }[] = [
  { id: 'padrao',     nome: 'Sistema',    familia: 'Inter, "Segoe UI", system-ui, sans-serif',     peso: 800, maiusculas: false },
  { id: 'impacto',    nome: 'Impacto',    familia: '"Anton", "Impact", sans-serif',                 peso: 400, maiusculas: true },
  { id: 'moderna',    nome: 'Moderna',    familia: '"Bricolage Grotesque", "Inter", sans-serif',   peso: 800, maiusculas: false },
  { id: 'elegante',   nome: 'Elegante',   familia: '"Fraunces", Georgia, serif',                     peso: 700, maiusculas: false },
  { id: 'divertida',  nome: 'Divertida',  familia: '"Fredoka", "Inter", sans-serif',                 peso: 700, maiusculas: false },
  { id: 'pixel',      nome: 'Pixel',      familia: '"Press Start 2P", monospace',                    peso: 400, maiusculas: true },
  { id: 'manuscrita', nome: 'Manuscrita', familia: '"Caveat", "Segoe Script", cursive',              peso: 700, maiusculas: false },
];

export type EntradaLivre = 'nenhuma' | 'suave' | 'impacto' | 'deslizar' | 'maquina';
export const ENTRADAS_LIVRES: readonly { id: EntradaLivre; nome: string }[] = [
  { id: 'nenhuma',  nome: 'Nenhuma' },
  { id: 'suave',    nome: 'Surgir' },
  { id: 'impacto',  nome: 'Impacto' },
  { id: 'deslizar', nome: 'Subir' },
  { id: 'maquina',  nome: 'Máquina de escrever' },
];

export type EfeitoLivre = 'nenhum' | 'pulsar' | 'flutuar' | 'brilhar';
export const EFEITOS_LIVRES: readonly { id: EfeitoLivre; nome: string }[] = [
  { id: 'nenhum',  nome: 'Parado' },
  { id: 'pulsar',  nome: 'Pulsar' },
  { id: 'flutuar', nome: 'Flutuar' },
  { id: 'brilhar', nome: 'Brilhar' },
];

export type Alinhamento = 'esq' | 'centro' | 'dir';

interface Base {
  id: string;
  /** Canto de cima à esquerda e tamanho, em % do palco. */
  x: number; y: number; l: number; a: number;
  /** Graus, de -180 a 180. */
  rot: number;
  /** 0,1 a 1. */
  opacidade: number;
  entrada: EntradaLivre;
  /** Segundos de espera antes da entrada, de 0 a 5. */
  atraso: number;
  efeito: EfeitoLivre;
}

export interface EstiloTexto {
  fonte: FonteLivre;
  /** Corpo em px do palco. */
  tamanho: number;
  cor: string;
  alinhar: Alinhamento;
  contorno: boolean;
  sombra: boolean;
  /** Cor da tarja atrás do texto; `null` = sem tarja. */
  tarja: string | null;
}

export type ElementoLivre =
  | (Base & EstiloTexto & { tipo: 'texto'; texto: string })
  | (Base & EstiloTexto & { tipo: 'numero'; metrica: MetricaLivre; rotulo: string })
  | (Base & EstiloTexto & { tipo: 'relogio'; formato: 'hora' | 'data' | 'hora_data' })
  | (Base & { tipo: 'imagem'; url: string; ajuste: 'contain' | 'cover'; raio: number })
  | (Base & { tipo: 'forma'; forma: 'retangulo' | 'circulo'; cor: string; raio: number; borda: string | null });

export type TipoElemento = ElementoLivre['tipo'];

export type FundoCena =
  | { tipo: 'tema' }
  | { tipo: 'cor'; cor: string }
  | { tipo: 'degrade'; de: string; para: string; angulo: number }
  | { tipo: 'papel'; id: string }
  | { tipo: 'imagem'; url: string; escurecer: number };

export interface CenaLivre {
  fundo: FundoCena;
  elementos: ElementoLivre[];
}

export const MAX_ELEMENTOS = 24;
export const MAX_TEXTO = 300;
export const TAMANHO_MIN = 16;
export const TAMANHO_MAX = 400;
/** O menor lado de um elemento, em %. */
export const LADO_MIN = 2;

// ── Saneamento ───────────────────────────────────────────────────────────────

const COR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

const numero = (v: unknown, min: number, max: number, padrao: number): number => {
  const n = typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};
const cor = (v: unknown, padrao: string): string => (typeof v === 'string' && COR.test(v) ? v : padrao);
const corOuNada = (v: unknown): string | null => (typeof v === 'string' && COR.test(v) ? v : null);
const texto = (v: unknown, max: number, padrao = ''): string => (typeof v === 'string' ? v.slice(0, max) : padrao);
const umDe = <T extends string>(v: unknown, lista: readonly { id: T }[], padrao: T): T =>
  (lista.some(x => x.id === v) ? v as T : padrao);
const url = (v: unknown): string => (typeof v === 'string' && v.length <= 2048 ? v : '');

/** O retângulo sempre inteiro dentro do palco, com o lado mínimo. */
export function limitarCaixa(c: { x: number; y: number; l: number; a: number }): { x: number; y: number; l: number; a: number } {
  const l = Math.min(100, Math.max(LADO_MIN, c.l));
  const a = Math.min(100, Math.max(LADO_MIN, c.a));
  return {
    l, a,
    x: Math.min(100 - l, Math.max(0, c.x)),
    y: Math.min(100 - a, Math.max(0, c.y)),
  };
}

function base(o: Record<string, unknown>, id: string): Base {
  return {
    id,
    ...limitarCaixa({
      x: numero(o.x, -1e3, 1e3, 10), y: numero(o.y, -1e3, 1e3, 10),
      l: numero(o.l, 0, 1e3, 30), a: numero(o.a, 0, 1e3, 15),
    }),
    rot: numero(o.rot, -180, 180, 0),
    opacidade: numero(o.opacidade, 0.1, 1, 1),
    entrada: umDe(o.entrada, ENTRADAS_LIVRES, 'suave'),
    atraso: numero(o.atraso, 0, 5, 0),
    efeito: umDe(o.efeito, EFEITOS_LIVRES, 'nenhum'),
  };
}

function estiloTexto(o: Record<string, unknown>): EstiloTexto {
  return {
    fonte: umDe(o.fonte, FONTES_LIVRES, 'padrao'),
    tamanho: Math.round(numero(o.tamanho, TAMANHO_MIN, TAMANHO_MAX, 96)),
    cor: cor(o.cor, '#ffffff'),
    alinhar: o.alinhar === 'esq' || o.alinhar === 'dir' ? o.alinhar : 'centro',
    contorno: o.contorno === true,
    sombra: o.sombra !== false,
    tarja: corOuNada(o.tarja),
  };
}

function elementoValido(bruto: unknown, usados: Set<string>): ElementoLivre | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const o = bruto as Record<string, unknown>;
  let id = typeof o.id === 'string' && /^[\w-]{1,40}$/.test(o.id) ? o.id : '';
  if (!id || usados.has(id)) id = idNovo(usados);
  usados.add(id);
  const b = base(o, id);
  switch (o.tipo) {
    case 'texto':
      return { ...b, ...estiloTexto(o), tipo: 'texto', texto: texto(o.texto, MAX_TEXTO) };
    case 'numero':
      return { ...b, ...estiloTexto(o), tipo: 'numero', metrica: umDe(o.metrica, METRICAS, 'recebido'), rotulo: texto(o.rotulo, 40) };
    case 'relogio':
      return {
        ...b, ...estiloTexto(o), tipo: 'relogio',
        formato: o.formato === 'data' || o.formato === 'hora_data' ? o.formato : 'hora',
      };
    case 'imagem':
      return { ...b, tipo: 'imagem', url: url(o.url), ajuste: o.ajuste === 'cover' ? 'cover' : 'contain', raio: numero(o.raio, 0, 50, 0) };
    case 'forma':
      return {
        ...b, tipo: 'forma', forma: o.forma === 'circulo' ? 'circulo' : 'retangulo',
        cor: cor(o.cor, '#5eead4'), raio: numero(o.raio, 0, 50, 4), borda: corOuNada(o.borda),
      };
    default:
      return null;
  }
}

function fundoValido(bruto: unknown): FundoCena {
  if (!bruto || typeof bruto !== 'object') return { tipo: 'tema' };
  const o = bruto as Record<string, unknown>;
  switch (o.tipo) {
    case 'cor': return { tipo: 'cor', cor: cor(o.cor, '#0b1220') };
    case 'degrade': return { tipo: 'degrade', de: cor(o.de, '#1e1b4b'), para: cor(o.para, '#0b1220'), angulo: Math.round(numero(o.angulo, 0, 360, 160)) };
    case 'papel': return typeof o.id === 'string' && /^[\w-]{1,40}$/.test(o.id) ? { tipo: 'papel', id: o.id } : { tipo: 'tema' };
    case 'imagem': return { tipo: 'imagem', url: url(o.url), escurecer: numero(o.escurecer, 0, 0.9, 0) };
    default: return { tipo: 'tema' };
  }
}

/** A cena que veio do jsonb, pronta para desenhar. Nunca lança. */
export function cenaValida(bruto: unknown): CenaLivre {
  const o = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto as Record<string, unknown> : {};
  const usados = new Set<string>();
  const elementos = (Array.isArray(o.elementos) ? o.elementos : [])
    .slice(0, MAX_ELEMENTOS)
    .map(e => elementoValido(e, usados))
    .filter((e): e is ElementoLivre => e != null);
  return { fundo: fundoValido(o.fundo), elementos };
}

// ── Criar e mexer ────────────────────────────────────────────────────────────

function idNovo(usados: Set<string> | Iterable<string>): string {
  const ja = usados instanceof Set ? usados : new Set(usados);
  for (let i = 1; ; i++) {
    const id = `e${i}`;
    if (!ja.has(id)) return id;
  }
}

const BASE_NOVA: Omit<Base, 'id' | 'x' | 'y' | 'l' | 'a'> = { rot: 0, opacidade: 1, entrada: 'suave', atraso: 0, efeito: 'nenhum' };
const ESTILO_NOVO: EstiloTexto = { fonte: 'padrao', tamanho: 96, cor: '#ffffff', alinhar: 'centro', contorno: false, sombra: true, tarja: null };

/** Um elemento novo, no meio do palco, com id que ainda não existe na cena. */
export function novoElemento(tipo: TipoElemento, cena: CenaLivre): ElementoLivre {
  const id = idNovo(cena.elementos.map(e => e.id));
  // Cada novo nasce um pouco deslocado do anterior, para não sumir embaixo dele.
  const passo = (cena.elementos.length % 6) * 3;
  const caixa = (l: number, a: number) => limitarCaixa({ x: 50 - l / 2 + passo, y: 50 - a / 2 + passo, l, a });
  switch (tipo) {
    case 'texto':
      return { id, ...BASE_NOVA, ...caixa(60, 16), ...ESTILO_NOVO, tipo: 'texto', texto: 'Escreva aqui' };
    case 'numero':
      return { id, ...BASE_NOVA, ...caixa(60, 20), ...ESTILO_NOVO, tamanho: 140, cor: '#5eead4', tipo: 'numero', metrica: 'recebido', rotulo: 'Recebido no mês' };
    case 'relogio':
      return { id, ...BASE_NOVA, ...caixa(30, 12), ...ESTILO_NOVO, tamanho: 80, tipo: 'relogio', formato: 'hora' };
    case 'imagem':
      return { id, ...BASE_NOVA, ...caixa(40, 40), tipo: 'imagem', url: '', ajuste: 'contain', raio: 0 };
    case 'forma':
      return { id, ...BASE_NOVA, ...caixa(40, 25), entrada: 'nenhuma', tipo: 'forma', forma: 'retangulo', cor: '#5eead4', raio: 4, borda: null };
  }
}

/** Arrastar: desloca em % e não deixa sair do palco. */
export function moverElemento<E extends ElementoLivre>(e: E, dx: number, dy: number): E {
  return { ...e, ...limitarCaixa({ x: e.x + dx, y: e.y + dy, l: e.l, a: e.a }) };
}

export type Canto = 'ne' | 'no' | 'se' | 'so';

/** A alça de um canto: o canto oposto fica parado. */
export function redimensionar<E extends ElementoLivre>(e: E, canto: Canto, dx: number, dy: number): E {
  let { x, y, l, a } = e;
  if (canto === 'se' || canto === 'ne') l += dx;
  if (canto === 'so' || canto === 'no') { x += dx; l -= dx; }
  if (canto === 'se' || canto === 'so') a += dy;
  if (canto === 'ne' || canto === 'no') { y += dy; a -= dy; }
  // Encolher além do mínimo não empurra o canto parado.
  if (l < LADO_MIN) { if (canto === 'so' || canto === 'no') x -= LADO_MIN - l; l = LADO_MIN; }
  if (a < LADO_MIN) { if (canto === 'ne' || canto === 'no') y -= LADO_MIN - a; a = LADO_MIN; }
  return { ...e, ...limitarCaixa({ x, y, l, a }) };
}

/** Frente = fim da lista (desenhado por último). */
export function mudarCamada(cena: CenaLivre, id: string, para: 'frente' | 'tras' | 'subir' | 'descer'): CenaLivre {
  const i = cena.elementos.findIndex(e => e.id === id);
  if (i < 0) return cena;
  const lista = [...cena.elementos];
  const [el] = lista.splice(i, 1);
  const destino = para === 'frente' ? lista.length
    : para === 'tras' ? 0
      : para === 'subir' ? Math.min(lista.length, i + 1) : Math.max(0, i - 1);
  lista.splice(destino, 0, el);
  return { ...cena, elementos: lista };
}

export function duplicarElemento(cena: CenaLivre, id: string): { cena: CenaLivre; novoId: string | null } {
  const el = cena.elementos.find(e => e.id === id);
  if (!el || cena.elementos.length >= MAX_ELEMENTOS) return { cena, novoId: null };
  const novoId = idNovo(cena.elementos.map(e => e.id));
  const copia = moverElemento({ ...el, id: novoId }, 3, 3);
  return { cena: { ...cena, elementos: [...cena.elementos, copia] }, novoId };
}

// ── Modelos prontos ──────────────────────────────────────────────────────────

export type ModeloLivre = 'aviso' | 'campanha' | 'meta';

export const MODELOS_LIVRES: readonly { id: ModeloLivre; nome: string; descricao: string }[] = [
  { id: 'aviso',    nome: 'Aviso',            descricao: 'Título grande, uma frase e o relógio.' },
  { id: 'campanha', nome: 'Campanha',         descricao: 'Faixa colorida, chamada e espaço para a arte.' },
  { id: 'meta',     nome: 'Meta ao vivo',     descricao: 'Quanto falta e o percentual, atualizando com o relatório.' },
];

/** Só o que difere do padrão; o resto o `cenaValida` completa. */
const el = (o: Record<string, unknown> & { tipo: TipoElemento }): unknown => o;

/** Uma cena pronta para o líder trocar os textos. Passa pelo `cenaValida`. */
export function cenaDoModelo(id: ModeloLivre): CenaLivre {
  switch (id) {
    case 'campanha':
      return cenaValida({
        fundo: { tipo: 'degrade', de: '#7c2d92', para: '#1e1b4b', angulo: 135 },
        elementos: [
          el({ id: 'e1', tipo: 'forma', x: 0, y: 6, l: 58, a: 16, cor: '#f5c542', raio: 0, entrada: 'deslizar' }),
          el({ id: 'e2', tipo: 'texto', x: 4, y: 7, l: 52, a: 14, texto: 'CAMPANHA DO MÊS', fonte: 'impacto', tamanho: 110, cor: '#1e1b4b', alinhar: 'esq', sombra: false, entrada: 'deslizar', atraso: 0.3 }),
          el({ id: 'e3', tipo: 'texto', x: 4, y: 30, l: 50, a: 34, texto: 'Quem fechar mais acordos até sexta ganha um prêmio surpresa!', fonte: 'moderna', tamanho: 84, alinhar: 'esq', entrada: 'suave', atraso: 0.8 }),
          el({ id: 'e4', tipo: 'imagem', x: 58, y: 18, l: 38, a: 64, url: '', raio: 6, entrada: 'impacto', atraso: 1 }),
          el({ id: 'e5', tipo: 'texto', x: 4, y: 80, l: 50, a: 10, texto: '— Liderança', fonte: 'manuscrita', tamanho: 72, cor: '#f5c542', alinhar: 'esq', entrada: 'suave', atraso: 1.4 }),
        ],
      });
    case 'meta':
      return cenaValida({
        fundo: { tipo: 'degrade', de: '#04253a', para: '#0b1220', angulo: 180 },
        elementos: [
          el({ id: 'e1', tipo: 'texto', x: 10, y: 8, l: 80, a: 12, texto: 'FALTA POUCO!', fonte: 'impacto', tamanho: 120, cor: '#f5c542', entrada: 'impacto' }),
          el({ id: 'e2', tipo: 'numero', x: 5, y: 26, l: 90, a: 30, metrica: 'falta', rotulo: '', tamanho: 230, cor: '#ffffff', entrada: 'suave', atraso: 0.4, efeito: 'pulsar' }),
          el({ id: 'e3', tipo: 'numero', x: 20, y: 62, l: 60, a: 14, metrica: 'percentual', rotulo: 'Da meta, já batemos', tamanho: 72, cor: '#5eead4', entrada: 'suave', atraso: 0.8 }),
          el({ id: 'e4', tipo: 'relogio', x: 35, y: 84, l: 30, a: 9, formato: 'hora', tamanho: 60, cor: '#8fb5cc', entrada: 'suave', atraso: 1.2 }),
        ],
      });
    default:
      return cenaValida({
        fundo: { tipo: 'tema' },
        elementos: [
          el({ id: 'e1', tipo: 'texto', x: 10, y: 16, l: 80, a: 18, texto: 'AVISO IMPORTANTE', fonte: 'impacto', tamanho: 150, cor: '#5eead4', entrada: 'impacto' }),
          el({ id: 'e2', tipo: 'texto', x: 12, y: 40, l: 76, a: 30, texto: 'Escreva aqui o recado para o time.', fonte: 'moderna', tamanho: 88, entrada: 'suave', atraso: 0.5 }),
          el({ id: 'e3', tipo: 'relogio', x: 35, y: 80, l: 30, a: 10, formato: 'hora_data', tamanho: 56, cor: '#8b97b3', entrada: 'suave', atraso: 1 }),
        ],
      });
  }
}
