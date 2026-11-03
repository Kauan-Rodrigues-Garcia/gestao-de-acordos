/**
 * calendarioGibi.ts — as contas do Calendário em gibi, sem tela.
 *
 * O desenho veio do «Estúdio do Calendário» (artefato de 30/10/2026): cada dia
 * é um quadrinho de contorno grosso e sombra dura, a capa tem o desenho do
 * tema, e entram a régua do mês e a contagem para o próximo marco.
 *
 * ## As cores saem em hex
 *
 * A paleta é misturada aqui, em sRGB, e não com `color-mix` no CSS: o «Copiar
 * imagem» passa pelo html2canvas, que apaga a sombra cuja cor ele não lê
 * (`lib/copiarImagem.ts`). Com o contorno e a sombra em hex, o gibi sai na
 * imagem do jeito que está na tela.
 */
import {
  diasDoMes, type EventoCalendario, type FeriadoDoDia, type PaletaGibi, type TemaCalendario,
} from '@/lib/calendarioSetor';

/** O acento do tema Padrão no gibi: o Padrão não tem cor própria (`acento: null`). */
export const ACENTO_PADRAO_GIBI = '#6366F1';

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number];
}

/** `pct`% de `a` com o resto de `b`, em sRGB. Cor que não é hex volta como veio. */
export function misturar(a: string, pct: number, b: string): string {
  const ca = rgb(a);
  const cb = rgb(b);
  if (!ca || !cb) return a;
  const p = Math.min(100, Math.max(0, pct)) / 100;
  return '#' + ca
    .map((v, i) => Math.round(v * p + cb[i] * (1 - p)).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Texto em cima da cor cheia: quase preto no claro, branco no escuro (WCAG). */
export function sobre(hex: string): string {
  const c = rgb(hex);
  if (!c) return '#FFFFFF';
  const [r, g, b] = c.map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#1A1A1A' : '#FFFFFF';
}

function paletaClara(ac: string, ac2: string): PaletaGibi {
  return {
    ac, ac2,
    soft: misturar(ac, 16, '#FFFFFF'),
    paper: misturar(ac, 5, '#FFFFFF'),
    surf: '#FFFFFF',
    ink: misturar(ac, 22, '#111111'),
    muted: misturar(ac, 18, '#6B6B6B'),
    line: misturar(ac, 14, '#E4E4E4'),
    ol: misturar(ac, 22, '#111111'),
    onac: sobre(ac),
    onac2: sobre(ac2),
  };
}

/** O escuro de qualquer tema: o fundo puxa um pouco da cor dele, e o texto fica claro. */
function paletaEscura(clara: PaletaGibi): PaletaGibi {
  const { ac } = clara;
  return {
    ...clara,
    paper: misturar(ac, 7, '#0E0D12'),
    surf: misturar(ac, 9, '#1A1820'),
    soft: misturar(ac, 26, '#1A1820'),
    ink: '#F3EFF5',
    muted: misturar(ac, 22, '#A6A2B0'),
    line: misturar(ac, 16, '#35323E'),
    ol: '#050409',
  };
}

export function paletaGibi(tema: TemaCalendario, escuro: boolean): PaletaGibi {
  const ac = tema.paleta?.ac ?? tema.acento ?? ACENTO_PADRAO_GIBI;
  const ac2 = tema.paleta?.ac2 ?? tema.acento2;
  const clara: PaletaGibi = { ...paletaClara(ac, ac2), ...tema.paleta };
  if (!escuro) return clara;
  return { ...paletaEscura(clara), ...tema.paletaEscura };
}

/** A paleta como variáveis CSS (`--ac`, `--ol`…), para o `style` do contêiner. */
export function varsDaPaleta(p: PaletaGibi): Record<string, string> {
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [`--${k}`, v]));
}

// ── A régua do mês ───────────────────────────────────────────────────────────

export interface SegmentoRegua {
  iso: string;
  quando: 'passado' | 'hoje' | 'futuro';
  /** Feriado das Metas: a operação não trabalha. */
  feriado: boolean;
  util: boolean;
}

export interface Regua {
  segmentos: SegmentoRegua[];
  uteis: number;
  /** Dias úteis até hoje, contando hoje. */
  uteisAteHoje: number;
  /** Dias úteis de hoje em diante, contando hoje. */
  uteisRestantes: number;
  /** Onde o mês está em relação a hoje. */
  tempo: 'passado' | 'corrente' | 'futuro';
}

export function reguaDoMes(
  mes: string,
  ehDiaUtil: (iso: string) => boolean,
  feriados: ReadonlyMap<string, FeriadoDoDia>,
  hojeISO: string,
): Regua {
  const segmentos = diasDoMes(mes).map<SegmentoRegua>(iso => ({
    iso,
    quando: iso < hojeISO ? 'passado' : iso === hojeISO ? 'hoje' : 'futuro',
    feriado: feriados.get(iso)?.folga === true,
    util: ehDiaUtil(iso),
  }));
  const uteis = segmentos.filter(s => s.util);
  const mesDeHoje = hojeISO.slice(0, 7);
  return {
    segmentos,
    uteis: uteis.length,
    uteisAteHoje: uteis.filter(s => s.iso <= hojeISO).length,
    uteisRestantes: uteis.filter(s => s.iso >= hojeISO).length,
    tempo: mes < mesDeHoje ? 'passado' : mes > mesDeHoje ? 'futuro' : 'corrente',
  };
}

// ── O próximo marco ──────────────────────────────────────────────────────────

export interface Marco {
  dia: string;
  titulo: string;
  /** Dias corridos de hoje até o marco. */
  faltam: number;
}

/** Dias corridos entre duas datas 'yyyy-MM-dd' (pela meia-noite local, sem fuso). */
export function diasEntre(de: string, ate: string): number {
  const d = (iso: string) => {
    const [y, m, dd] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.round((d(ate) - d(de)) / 86_400_000);
}

/**
 * O próximo dia que vale contar — um dia em destaque, um horário especial
 * (fechamento, plantão) ou um feriado das Metas — depois de hoje, dentro do
 * mês aberto. `null` quando não há nenhum (ou o mês já passou).
 */
export function proximoMarco(
  eventos: readonly EventoCalendario[],
  feriados: ReadonlyMap<string, FeriadoDoDia>,
  hojeISO: string,
): Marco | null {
  const candidatos: { dia: string; titulo: string }[] = [];
  for (const e of eventos) {
    if (e.dia > hojeISO && (e.destaque || e.tipo === 'horario')) candidatos.push({ dia: e.dia, titulo: e.titulo });
  }
  for (const [dia, f] of feriados) {
    if (dia > hojeISO && f.folga) candidatos.push({ dia, titulo: f.nome });
  }
  candidatos.sort((a, b) => a.dia.localeCompare(b.dia));
  const p = candidatos[0];
  return p ? { ...p, faltam: diasEntre(hojeISO, p.dia) } : null;
}

/** «Ana Paula Souza» → «Ana». */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
