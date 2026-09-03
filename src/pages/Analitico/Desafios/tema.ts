/**
 * tema.ts — o acabamento visual de uma campanha.
 *
 * ## O que isto NÃO é
 *
 * Não é um editor de página. Não há aqui padding, fonte, largura nem ordem de
 * componente: o desenho continua sendo do sistema, e é por isso que a aba
 * Desafios se parece com o resto do Gestão de Acordos em vez de parecer um
 * protótipo colado por cima.
 *
 * O que o tema controla é o ACABAMENTO — o par de cores do destaque, o gradiente
 * discreto do Hero e o ícone. O Café no IBIS ganha âmbar e um ícone de café; a
 * tela continua sendo `bg-card`, `rounded-xl` e `border-border` como todas as
 * outras.
 *
 * Todas as classes saem dos tokens do projeto (`primary`, `card`, `border`,
 * `muted-foreground`) mais a paleta do Tailwind que o resto do app já usa —
 * `amber` no pódio, `emerald` para subida. Nada de hexadecimal solto.
 */
import { Coffee, Flag, Trophy, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AcentoDesafio, TemaDesafio, VisualDesafio } from '@/services/desafios/types';

export interface EstiloTema {
  Icone: LucideIcon;
  /** Gradiente do Hero. Discreto: o card continua legível por baixo. */
  gradiente: string;
  /** Cor do texto de destaque (o nome da campanha, os números do Hero). */
  destaque: string;
  /** Borda do Hero e dos cards que representam o tema. */
  borda: string;
  /** Fundo do selo do prêmio. */
  selo: string;
  /** Preenchimento da barra de progresso. */
  barra: string;
}

const PADRAO: EstiloTema = {
  Icone:     Trophy,
  gradiente: 'from-primary/10 via-card to-card',
  destaque:  'text-primary',
  borda:     'border-primary/30',
  selo:      'bg-primary/10 text-primary border-primary/30',
  barra:     'bg-primary',
};

const TEMAS: Record<TemaDesafio, EstiloTema> = {
  padrao: PADRAO,
  cafe: {
    Icone:     Coffee,
    // Âmbar/dourado, e só na diagonal do Hero — a tela inteira marrom era
    // exatamente o que o pedido excluiu.
    gradiente: 'from-amber-500/15 via-amber-500/5 to-card',
    destaque:  'text-amber-600 dark:text-amber-400',
    borda:     'border-amber-500/30',
    selo:      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
    barra:     'bg-amber-500',
  },
  corrida: {
    Icone:     Flag,
    gradiente: 'from-sky-500/15 via-sky-500/5 to-card',
    destaque:  'text-sky-600 dark:text-sky-400',
    borda:     'border-sky-500/30',
    selo:      'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
    barra:     'bg-sky-500',
  },
  equipes: {
    Icone:     Users,
    gradiente: 'from-violet-500/15 via-violet-500/5 to-card',
    destaque:  'text-violet-600 dark:text-violet-400',
    borda:     'border-violet-500/30',
    selo:      'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30',
    barra:     'bg-violet-500',
  },
};

/**
 * As cores de acento, que a campanha escolhe por cima do tema.
 *
 * O tema traz ícone e personalidade (café, corrida, equipes); o acento troca
 * só a cor. Existem separados porque «quero o tema Café mas em violeta» é um
 * pedido legítimo, e criar um tema novo para cada cor multiplicaria os ícones
 * sem necessidade.
 *
 * Nenhum hexadecimal: é a mesma paleta do Tailwind que o resto do app usa.
 */
const ACENTOS: Record<AcentoDesafio, Omit<EstiloTema, 'Icone'>> = {
  ambar: {
    gradiente: 'from-amber-500/15 via-amber-500/5 to-card',
    destaque:  'text-amber-600 dark:text-amber-400',
    borda:     'border-amber-500/30',
    selo:      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
    barra:     'bg-amber-500',
  },
  violeta: {
    gradiente: 'from-violet-500/15 via-violet-500/5 to-card',
    destaque:  'text-violet-600 dark:text-violet-400',
    borda:     'border-violet-500/30',
    selo:      'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30',
    barra:     'bg-violet-500',
  },
  esmeralda: {
    gradiente: 'from-emerald-500/15 via-emerald-500/5 to-card',
    destaque:  'text-emerald-600 dark:text-emerald-400',
    borda:     'border-emerald-500/30',
    selo:      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
    barra:     'bg-emerald-500',
  },
  rosa: {
    gradiente: 'from-rose-500/15 via-rose-500/5 to-card',
    destaque:  'text-rose-600 dark:text-rose-400',
    borda:     'border-rose-500/30',
    selo:      'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
    barra:     'bg-rose-500',
  },
  azul: {
    gradiente: 'from-sky-500/15 via-sky-500/5 to-card',
    destaque:  'text-sky-600 dark:text-sky-400',
    borda:     'border-sky-500/30',
    selo:      'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
    barra:     'bg-sky-500',
  },
  laranja: {
    gradiente: 'from-orange-500/15 via-orange-500/5 to-card',
    destaque:  'text-orange-600 dark:text-orange-400',
    borda:     'border-orange-500/30',
    selo:      'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30',
    barra:     'bg-orange-500',
  },
};

export const ACENTOS_DISPONIVEIS: { valor: AcentoDesafio; rotulo: string; amostra: string }[] = [
  { valor: 'ambar',     rotulo: 'Âmbar',     amostra: 'bg-amber-500'   },
  { valor: 'violeta',   rotulo: 'Violeta',   amostra: 'bg-violet-500'  },
  { valor: 'esmeralda', rotulo: 'Esmeralda', amostra: 'bg-emerald-500' },
  { valor: 'rosa',      rotulo: 'Rosa',      amostra: 'bg-rose-500'    },
  { valor: 'azul',      rotulo: 'Azul',      amostra: 'bg-sky-500'     },
  { valor: 'laranja',   rotulo: 'Laranja',   amostra: 'bg-orange-500'  },
];

export function estiloDoTema(tema: TemaDesafio): EstiloTema {
  return TEMAS[tema] ?? PADRAO;
}

/**
 * O acabamento efetivo: o tema, com o acento por cima quando há um.
 *
 * O ícone é sempre do tema — o acento é cor, e trocar o ícone junto faria a
 * escolha de cor mudar o significado da campanha.
 */
export function estiloDaCampanha(visual: VisualDesafio): EstiloTema {
  const base = estiloDoTema(visual.tema);
  if (!visual.acento) return base;
  return { Icone: base.Icone, ...ACENTOS[visual.acento] };
}

/** `yyyy-MM-dd` → `21 ago`. Sem `new Date`: o ISO puro anda um dia com o fuso. */
export function diaCurto(iso: string): string {
  const [, mes, dia] = iso.split('-');
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const idx = Number(mes) - 1;
  return `${dia} ${MESES[idx] ?? ''}`.trim();
}

/** `yyyy-MM-dd` → `21/08/2026`. */
export function dataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** O dia de hoje em ISO, no fuso local — `toISOString()` devolveria UTC. */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Percentual como o ranking mostra.
 *
 * Acima de 100 vira `100%+`: o número exato de quem passou de 340% da meta
 * rouba a leitura da coluna sem dizer nada que a barra cheia já não diga.
 */
export function percentualCurto(progresso: number): string {
  if (progresso > 100) return '100%+';
  return `${progresso.toFixed(1).replace('.', ',')}%`;
}
