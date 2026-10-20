/**
 * faixa.ts — a faixa com o nome de quem derrubou a bruxa.
 *
 * O mesmo letreiro da caça dos zumbis (o recado corre sem parar, em dois
 * grupos iguais para o laço não ter emenda), decorado de Halloween: as
 * bandeirinhas no alto, estrelinhas piscando, o rosto da bruxa (de olho
 * apagado, se ela morreu), a foto de quem acertou (se tiver) numa moldura
 * dourada e o nome entre brilhinhos. Nos fofos a faixa é rosa, com coração:
 * ninguém morreu, a bruxinha só desmaiou.
 *
 * ## Mais destaque e o «2x» (14/10/2026)
 *
 * A faixa tem 40 px (era 52 em 14/10, achada grande demais) e a foto de quem
 * acertou 26 px. Só aparece com foto: sem foto (ou foto quebrada) não há
 * quadrado nenhum, nem com iniciais (Cleber, 14/10/2026). A foto fica numa
 * moldura que pisca: é a foto que a operação procura. O fofo desacordado pode
 * levar um segundo tiro no chão e morrer (`finalizar` em `queda.ts`); se quem
 * finalizou é quem derrubou, a faixa ganha o selo «2x · derrubou e finalizou»
 * e deixa de ser cor-de-rosa.
 *
 * Sem React, como o palco: devolve o elemento pronto. A parte que decide o
 * texto (`fraseDaFaixa`, `etiquetasDaFaixa`) é pura e testada.
 */
import './faixa.css';
import type { Bruxa } from './arte';
import { cabecaDaBruxa } from './pixels';
import type { Morte } from './queda';

export interface DadosFaixa {
  nome: string;
  foto?: string | null;
  /** O setor de quem derrubou (15/10/2026). Sem ele (rodada antiga), só o nome. */
  setor?: string | null;
  bruxa: Bruxa;
  morte: Morte;
  ms: number | null;
  rapida?: boolean;
  hsRapido?: boolean;
  /**
   * Fofo: quem derrubou também finalizou no chão (os dois tiros são da mesma
   * pessoa). A faixa ganha o selo «2x» e a bruxinha aparece morta.
   */
  dobrado?: boolean;
}

/** «12,4 s», «1 min 05 s». */
export function formatarTempo(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace('.', ',')} s`;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m} min ${String(r).padStart(2, '0')} s`;
}

/** O que a pessoa fez, sem o nome dela: «derrubou a Gatinha Bruxa da vassoura». */
export function feitoDaFaixa(d: Pick<DadosFaixa, 'bruxa' | 'morte'>): string {
  const quem = d.bruxa.nome;
  if (d.morte === 'vassoura') return `derrubou ${quem} da vassoura`;
  return d.bruxa.fofa ? `nocauteou ${quem}` : `abateu ${quem}`;
}

/** A frase inteira, para o leitor de tela e para o teste. */
export function fraseDaFaixa(d: DadosFaixa): string {
  return `${d.nome}${d.setor ? `, do setor ${d.setor},` : ''} ${feitoDaFaixa(d)} primeiro`
    + (d.morte === 'cabeca' ? ', com um headshot,' : '')
    + ` em ${formatarTempo(d.ms)}`
    + (d.rapida ? ' — o mais rápido do dia' : '')
    + (d.hsRapido ? ' — o headshot mais rápido do dia' : '')
    + (d.dobrado ? ' — e finalizou no chão com o segundo tiro (2x)' : '')
    + '.';
}

export type Etiqueta = 'dobro' | 'headshot' | 'vassourada' | 'nocaute' | 'rapido' | 'hsRapido';

/** As etiquetas do recado, na ordem em que aparecem. O «2x» vem primeiro: é o que mais conta. */
export function etiquetasDaFaixa(d: Pick<DadosFaixa, 'bruxa' | 'morte' | 'rapida' | 'hsRapido' | 'dobrado'>): Etiqueta[] {
  const e: Etiqueta[] = [];
  if (d.dobrado) e.push('dobro');
  if (d.morte === 'cabeca') e.push('headshot');
  if (d.morte === 'vassoura') e.push('vassourada');
  if (d.bruxa.fofa && d.morte === 'corpo' && !d.dobrado) e.push('nocaute');
  if (d.rapida) e.push('rapido');
  if (d.hsRapido) e.push('hsRapido');
  return e;
}

/** As iniciais de quem não tem foto: «Mariana Souza» → «MS». */
export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] ?? '') + (p.length > 1 ? p[p.length - 1][0] ?? '' : '')).toUpperCase();
}

// ── Ícones em pixel ────────────────────────────────────────────────────────

const ICONES = {
  mira: ['...w...', '.wwwww.', '.w...w.', 'ww.w.ww', '.w...w.', '.wwwww.', '...w...'],
  raio: ['...ww', '..ww.', '.wwww', '...ww', '..ww.', '.ww..', '.w...'],
  vassoura: ['......w', '.....w.', '....w..', '.www...', 'wwwww..', 'wwww...', 'w.w....'],
  coracao: ['.ww.ww.', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..', '...w...'],
  brilho: ['...w...', '...w...', '.wwwww.', 'www.www', '.wwwww.', '...w...', '...w...'],
  abobora: ['...g...', '.oo.oo.', 'ooooooo', 'oywoywo', 'ooooooo', 'oyyyyyo', '.ooooo.'],
  morcego: ['w.......w', 'ww.w.w.ww', 'wwwwwwwww', '.ww.w.ww.', '...w.w...'],
} as const;
const CORES_ICONE: Record<string, string> = { w: 'currentColor', g: '#3aa04a', o: '#ff8a1f', y: '#2a0e08' };

const cacheIcone = new Map<string, SVGSVGElement>();

/**
 * O ícone em pixel. Montado uma vez por tamanho e classe e depois clonado
 * (PC fraco, 14/10/2026): era um `<rect>` por pixel em cada cópia do recado,
 * centenas de elementos por faixa. Agora é um `<path>` por cor — o mesmo
 * desenho, com `crispEdges`, quadradinho por quadradinho.
 */
function icone(nome: keyof typeof ICONES, tam = 2, classe = ''): SVGSVGElement {
  const chave = `${nome}:${tam}:${classe}`;
  let modelo = cacheIcone.get(chave);
  if (!modelo) {
    const l = ICONES[nome], w = l[0].length, h = l.length;
    const ns = 'http://www.w3.org/2000/svg';
    modelo = document.createElementNS(ns, 'svg');
    modelo.setAttribute('viewBox', `0 0 ${w} ${h}`);
    modelo.setAttribute('width', String(w * tam));
    modelo.setAttribute('height', String(h * tam));
    modelo.setAttribute('shape-rendering', 'crispEdges');
    modelo.setAttribute('aria-hidden', 'true');
    if (classe) modelo.setAttribute('class', classe);
    const porCor = new Map<string, string>();
    l.forEach((linha, j) => [...linha].forEach((c, i) => {
      if (c === '.') return;
      porCor.set(c, `${porCor.get(c) ?? ''}M${i} ${j}h1v1h-1z`);
    }));
    for (const [c, caminho] of porCor) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', caminho);
      p.setAttribute('fill', CORES_ICONE[c] ?? 'currentColor');
      modelo.appendChild(p);
    }
    cacheIcone.set(chave, modelo);
  }
  return modelo.cloneNode(true) as SVGSVGElement;
}

// ── O rosto da bruxa ───────────────────────────────────────────────────────

/** A cabeça com o chapéu, recortada: o ícone da faixa. Morta: olho apagado. */
export function rostoDaBruxa(b: Bruxa, morta: boolean): HTMLCanvasElement {
  const c = cabecaDaBruxa(b, morta);
  const copia = document.createElement('canvas');
  copia.width = c.width; copia.height = c.height;
  copia.getContext('2d')?.drawImage(c, 0, 0);
  copia.className = 'bx-faixa-rosto';
  return copia;
}

const cacheUrlRosto = new Map<string, string>();

/**
 * O mesmo rosto como `<img>` (PC fraco, 14/10/2026): a faixa repete o recado
 * umas dez vezes, e canvas não se clona — cada cópia era um canvas novo.
 * A imagem sai uma vez em PNG e as cópias usam o mesmo endereço.
 */
function imgDoRosto(b: Bruxa, morta: boolean): HTMLImageElement {
  const chave = `${b.id}:${morta}`;
  const c = cabecaDaBruxa(b, morta);
  let url = cacheUrlRosto.get(chave);
  if (!url) { url = c.toDataURL(); cacheUrlRosto.set(chave, url); }
  const img = el('img', 'bx-faixa-rosto');
  // O tamanho vem antes da imagem decodificar: a faixa mede o recado logo em seguida.
  img.width = c.width;
  img.height = c.height;
  img.alt = '';
  img.decoding = 'sync';
  img.src = url;
  return img;
}

// ── A faixa ────────────────────────────────────────────────────────────────

const ROTULO: Record<Etiqueta, { texto: string; icone: keyof typeof ICONES; classe: string }> = {
  dobro: { texto: 'derrubou e finalizou', icone: 'mira', classe: 'bx-tag-dobro' },
  headshot: { texto: 'HEADSHOT', icone: 'mira', classe: 'bx-tag-hs' },
  vassourada: { texto: 'VASSOURADA', icone: 'vassoura', classe: 'bx-tag-vassoura' },
  nocaute: { texto: 'Nocaute', icone: 'coracao', classe: 'bx-tag-nocaute' },
  rapido: { texto: 'Mais rápido do dia', icone: 'raio', classe: 'bx-tag-rapido' },
  hsRapido: { texto: 'Headshot mais rápido do dia', icone: 'mira', classe: 'bx-tag-hs-rapido' },
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto != null) e.textContent = texto;
  return e;
}

function umRecado(d: DadosFaixa): HTMLSpanElement {
  const r = el('span', 'bx-faixa-recado');
  // Fofo finalizado morreu: a faixa deixa de ser a cor-de-rosa do desmaio.
  const fofo = d.bruxa.fofa && !d.dobrado;
  r.appendChild(icone(fofo ? 'coracao' : 'abobora', 2, 'bx-faixa-separa'));
  r.appendChild(imgDoRosto(d.bruxa, !fofo));

  // Quadrado só com foto. Foto que não carrega leva o quadrado junto.
  if (d.foto) {
    const moldura = el('span', 'bx-faixa-moldura');
    const img = el('img', 'bx-faixa-foto');
    img.src = d.foto;
    img.alt = '';
    img.loading = 'eager';
    img.addEventListener('error', () => moldura.remove());
    moldura.appendChild(img);
    r.appendChild(moldura);
  }

  const nome = el('span', 'bx-faixa-nome');
  nome.appendChild(icone('brilho', 1, 'bx-faixa-brilho'));
  nome.appendChild(el('b', '', d.nome));
  nome.appendChild(icone('brilho', 1, 'bx-faixa-brilho bx-faixa-brilho-2'));
  r.appendChild(nome);
  if (d.setor) r.appendChild(el('span', 'bx-faixa-setor', d.setor));

  for (const e of etiquetasDaFaixa(d)) {
    const t = ROTULO[e];
    const tag = el('span', `bx-tag ${t.classe}`);
    // «2x»: o número grande e as duas miras, um tiro de cada vez.
    if (e === 'dobro') tag.appendChild(el('b', 'bx-tag-dobro-num', '2x'));
    tag.appendChild(icone(t.icone, 2));
    if (e === 'dobro') tag.appendChild(icone(t.icone, 2));
    tag.appendChild(document.createTextNode(t.texto));
    r.appendChild(tag);
  }
  r.appendChild(el('span', 'bx-faixa-feito', `${feitoDaFaixa(d)} primeiro, em`));
  r.appendChild(el('span', 'bx-faixa-tempo', formatarTempo(d.ms)));
  r.appendChild(icone(fofo ? 'coracao' : 'morcego', 2, 'bx-faixa-separa'));
  return r;
}

/** Velocidade do letreiro, em px por segundo (a mesma do zumbi). */
const VELOCIDADE = 70;

/**
 * A faixa pronta. Ponha na página e chame `ajustar` (ela mede quantas cópias
 * cobrem a largura e quanto tempo dura a volta); de novo se a janela mudar.
 */
export function montarFaixa(d: DadosFaixa): { el: HTMLDivElement; ajustar: () => void } {
  const faixa = el('div', `bx-faixa${d.bruxa.fofa && !d.dobrado ? ' bx-faixa-fofa' : ''}`);
  const sr = el('span', 'bx-faixa-sr', fraseDaFaixa(d));
  sr.setAttribute('role', 'status');
  faixa.appendChild(sr);
  faixa.appendChild(el('span', 'bx-faixa-estrelas'));
  const trilho = el('div', 'bx-faixa-trilho');
  trilho.setAttribute('aria-hidden', 'true');
  faixa.appendChild(trilho);

  // Um recado montado; as cópias são clones dele (sem canvas dentro, clonar
  // sai igual). Só a foto precisa do aviso de erro de novo em cada cópia.
  const modelo = umRecado(d);
  const copia = (): HTMLElement => {
    const r = modelo.cloneNode(true) as HTMLElement;
    const foto = r.querySelector<HTMLImageElement>('.bx-faixa-foto');
    const moldura = foto?.parentElement;
    if (foto && moldura) foto.addEventListener('error', () => moldura.remove());
    return r;
  };
  const ajustar = () => {
    trilho.textContent = '';
    const g1 = el('div', 'bx-faixa-grupo');
    trilho.appendChild(g1);
    g1.appendChild(copia());
    const um = (g1.firstElementChild as HTMLElement).offsetWidth || 600;
    const copias = Math.max(2, Math.ceil(faixa.offsetWidth / um) + 1);
    for (let i = 1; i < copias; i++) g1.appendChild(copia());
    const g2 = el('div', 'bx-faixa-grupo');
    for (let i = 0; i < copias; i++) g2.appendChild(copia());
    trilho.appendChild(g2);
    trilho.style.setProperty('--bx-dur', `${Math.max(14, g1.offsetWidth / VELOCIDADE)}s`);
  };
  return { el: faixa, ajustar };
}
