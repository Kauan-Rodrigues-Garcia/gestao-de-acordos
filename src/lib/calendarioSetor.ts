/**
 * calendarioSetor.ts — as regras da aba Calendário, sem tela e sem banco.
 *
 * Tudo aqui é função pura sobre datas 'yyyy-MM-dd'. As datas nunca passam por
 * `new Date(iso)` sozinho — meia-noite UTC é 21h do dia anterior em São Paulo —
 * e sim por `new Date(ano, mes - 1, dia)`, que é meia-noite local.
 *
 * ## O dia útil não é decidido aqui
 *
 * `ehDiaUtil` chega pronto de quem chama: na cobrança é segunda a sexta menos
 * os feriados das Metas (`metas_config_mes`); no Comercial, a regra de
 * `vendasCalendario`. O calendário MOSTRA o dia útil que a meta conta — nunca
 * um terceiro. O feriado também: o dia só fica de feriado se está nas Metas
 * (`feriadosDoMes`).
 */
import { diasNoMes } from '@/lib/mesReferencia';
import { feriadosNacionais } from '@/lib/feriadosNacionais';

// ── Os tipos de evento ───────────────────────────────────────────────────────

/** Espelho do CHECK `calendario_eventos_tipo` (migration 20261006170000). */
export const TIPOS_EVENTO = [
  'banco_horas', 'feriado', 'aniversario', 'evento', 'aviso', 'folga', 'horario',
] as const;
export type TipoEvento = typeof TIPOS_EVENTO[number];

export interface InfoTipo {
  rotulo: string;
  /**
   * Cor do tipo. `null` = a cor do TEMA do mês: o banco de horas é o que mais
   * aparece, e é ele que veste a cor da campanha (o rosa do Outubro Rosa).
   */
  cor: string | null;
}

export const INFO_TIPO: Record<TipoEvento, InfoTipo> = {
  banco_horas: { rotulo: 'Banco de horas',   cor: null },
  feriado:     { rotulo: 'Feriado',          cor: '#DC2626' },
  aniversario: { rotulo: 'Aniversário',      cor: '#D97706' },
  evento:      { rotulo: 'Evento',           cor: '#2563EB' },
  aviso:       { rotulo: 'Aviso',            cor: '#7C3AED' },
  folga:       { rotulo: 'Folga / recesso',  cor: '#0D9488' },
  horario:     { rotulo: 'Horário especial', cor: '#EA580C' },
};

export function ehTipoEvento(v: unknown): v is TipoEvento {
  return typeof v === 'string' && (TIPOS_EVENTO as readonly string[]).includes(v);
}

// ── Os modelos (atalhos de preenchimento) ────────────────────────────────────

/** Que dias um modelo sugere quando aplicado em lote. */
export type RegraDias =
  | { tipo: 'semana'; dia: number }   // 0 = domingo … 6 = sábado
  | { tipo: 'dias_uteis' }
  | { tipo: 'fins_de_semana' }
  | { tipo: 'todos' };

export interface ModeloEvento {
  id: string;
  rotulo: string;
  tipo: TipoEvento;
  titulo: string;
  detalhe?: string;
  destaque?: boolean;
}

/**
 * Os modelos do dia a dia, tirados dos calendários que a liderança já monta à
 * mão (o do Outubro Rosa e o de horário por dia). O modelo só PREENCHE o
 * formulário — título e detalhe continuam editáveis.
 *
 * Um modelo só de banco de horas (08/10/2026): o horário — uma hora, das 08:30
 * às 12:00, até às 19:00 — se configura depois de escolher, em vez de um
 * modelo para cada. Feriado não tem modelo: vem das Metas (`feriadosDoMes`).
 */
export const MODELOS: readonly ModeloEvento[] = [
  { id: 'banco_horas', rotulo: 'Banco de horas',   tipo: 'banco_horas', titulo: 'Banco de horas' },
  { id: 'ate_bater',   rotulo: 'Até bater a meta', tipo: 'horario',     titulo: 'Até bater a meta', destaque: true },
  { id: 'aniversario', rotulo: 'Aniversário',      tipo: 'aniversario', titulo: 'Aniversário' },
  { id: 'reuniao',     rotulo: 'Reunião do setor', tipo: 'evento',      titulo: 'Reunião do setor' },
  { id: 'treinamento', rotulo: 'Treinamento',      tipo: 'evento',      titulo: 'Treinamento' },
  { id: 'campanha',    rotulo: 'Campanha / ação',  tipo: 'evento',      titulo: 'Campanha' },
  { id: 'aviso',       rotulo: 'Aviso',            tipo: 'aviso',       titulo: 'Aviso' },
];

/**
 * Os tipos que se lançam à mão. O feriado fica de fora: quem diz se a
 * operação para é a aba Metas. Os feriados lançados antes disso continuam no
 * banco e aparecem como evento, mas não pintam mais o dia.
 */
export const TIPOS_LANCAVEIS: readonly TipoEvento[] = TIPOS_EVENTO.filter(t => t !== 'feriado');

// ── O horário do banco de horas ──────────────────────────────────────────────

/**
 * Como a liderança escreve o banco de horas: quanto tempo («01 hora»), de que
 * horas a que horas («08:30 às 12:00») ou até quando («até às 19:00»). Vira o
 * `detalhe` do evento — o mesmo texto que já se lia na casa do dia.
 * `livre` é o texto que não segue nenhum dos três, escrito à mão.
 */
export type HorarioBanco =
  | { modo: 'duracao'; minutos: number }
  | { modo: 'intervalo'; de: string; ate: string }
  | { modo: 'ate'; ate: string }
  | { modo: 'livre'; texto: string };

export const HORARIO_BANCO_PADRAO: HorarioBanco = { modo: 'duracao', minutos: 60 };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function textoDoBanco(h: HorarioBanco): string {
  switch (h.modo) {
    case 'duracao': {
      const horas = Math.floor(h.minutos / 60);
      const min = h.minutos % 60;
      if (horas === 0) return `${min} minutos`;
      const hh = String(horas).padStart(2, '0');
      return min === 0 ? `${hh} ${horas === 1 ? 'hora' : 'horas'}` : `${hh}h${String(min).padStart(2, '0')}`;
    }
    case 'intervalo': return `${h.de} às ${h.ate}`;
    case 'ate':       return `até às ${h.ate}`;
    case 'livre':     return h.texto.trim();
  }
}

/** O texto gravado de volta no formulário. O que não se reconhece fica `livre`. */
export function lerHorarioBanco(detalhe: string | null | undefined): HorarioBanco {
  const t = (detalhe ?? '').trim();
  if (!t) return HORARIO_BANCO_PADRAO;
  let m = /^(\d{1,2}) horas?$/i.exec(t);
  if (m) return { modo: 'duracao', minutos: Number(m[1]) * 60 };
  m = /^(\d{1,2})h(\d{2})$/i.exec(t);
  if (m) return { modo: 'duracao', minutos: Number(m[1]) * 60 + Number(m[2]) };
  m = /^(\d{1,3}) minutos$/i.exec(t);
  if (m) return { modo: 'duracao', minutos: Number(m[1]) };
  m = /^(\d{2}:\d{2}) às (\d{2}:\d{2})$/i.exec(t);
  if (m) return { modo: 'intervalo', de: m[1], ate: m[2] };
  m = /^até às (\d{2}:\d{2})$/i.exec(t);
  if (m) return { modo: 'ate', ate: m[1] };
  return { modo: 'livre', texto: t };
}

/** O que falta no horário (`null` = pronto). */
export function faltaNoHorarioBanco(h: HorarioBanco): string | null {
  switch (h.modo) {
    case 'duracao':   return h.minutos > 0 ? null : 'Escolha quanto tempo de banco de horas.';
    case 'intervalo':
      if (!HORA.test(h.de) || !HORA.test(h.ate)) return 'Preencha o horário de início e de fim do banco de horas.';
      return h.de < h.ate ? null : 'O fim do banco de horas precisa ser depois do início.';
    case 'ate':       return HORA.test(h.ate) ? null : 'Preencha até que horas vai o banco de horas.';
    case 'livre':     return h.texto.trim() ? null : 'Escreva o horário do banco de horas.';
  }
}

// ── Os temas do mês ──────────────────────────────────────────────────────────

export interface TemaCalendario {
  id: string;
  nome: string;
  /** Cor da campanha. `null` = o destaque do app (tema Padrão). */
  acento: string | null;
  emoji: string;
  /** Título e frase sugeridos quando a capa ainda está em branco. */
  titulo: string;
  frase: string;
  /** O mês em que este tema entra sozinho no «Automático». */
  mes?: number;
}

export const TEMAS: readonly TemaCalendario[] = [
  { id: 'padrao',           nome: 'Padrão',           acento: null,      emoji: '📅', titulo: '',                 frase: '' },
  { id: 'janeiro_branco',   nome: 'Janeiro Branco',   acento: '#64748B', emoji: '🤍', titulo: 'Janeiro Branco',   frase: 'Cuidar da mente também é cuidar da saúde.', mes: 1 },
  { id: 'carnaval',         nome: 'Carnaval',         acento: '#A855F7', emoji: '🎉', titulo: 'Carnaval',         frase: 'Folia com responsabilidade!', mes: 2 },
  { id: 'marco_mulheres',   nome: 'Mês das Mulheres', acento: '#C026D3', emoji: '🌷', titulo: 'Mês das Mulheres', frase: 'Respeito e igualdade todos os dias.', mes: 3 },
  { id: 'abril_azul',       nome: 'Abril Azul',       acento: '#0EA5E9', emoji: '🧩', titulo: 'Abril Azul',       frase: 'Conscientização sobre o autismo.', mes: 4 },
  { id: 'maio_amarelo',     nome: 'Maio Amarelo',     acento: '#CA8A04', emoji: '🚦', titulo: 'Maio Amarelo',     frase: 'No trânsito, escolha a vida.', mes: 5 },
  { id: 'junino',           nome: 'Arraiá',           acento: '#EA580C', emoji: '🌽', titulo: 'Arraiá do setor',  frase: 'Olha a meta! É mentira… é verdade!', mes: 6 },
  { id: 'agosto_lilas',     nome: 'Agosto Lilás',     acento: '#8B5CF6', emoji: '💜', titulo: 'Agosto Lilás',     frase: 'Pelo fim da violência contra a mulher.', mes: 8 },
  { id: 'setembro_amarelo', nome: 'Setembro Amarelo', acento: '#F59E0B', emoji: '💛', titulo: 'Setembro Amarelo', frase: 'Falar é a melhor solução.', mes: 9 },
  { id: 'outubro_rosa',     nome: 'Outubro Rosa',     acento: '#EC4899', emoji: '🎀', titulo: 'Outubro Rosa',     frase: 'Prevenção é o melhor caminho!', mes: 10 },
  { id: 'novembro_azul',    nome: 'Novembro Azul',    acento: '#2563EB', emoji: '💙', titulo: 'Novembro Azul',    frase: 'Prevenção também é coisa de homem.', mes: 11 },
  { id: 'natal',            nome: 'Natal',            acento: '#DC2626', emoji: '🎄', titulo: 'Boas festas',      frase: 'Que venha um ano novo de metas batidas!', mes: 12 },
];

export const TEMA_AUTOMATICO = 'automatico';

/**
 * O texto que se lê em cima da cor cheia: branco no rosa e no azul, quase preto
 * no amarelo. Pela luminância relativa (WCAG), com o corte onde os dois
 * contrastes se igualam.
 */
export function textoSobreCor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#FFFFFF';
  const canal = (i: number) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  return l > 0.179 ? '#1A1A1A' : '#FFFFFF';
}

/**
 * A cor do dia em destaque: o acento 18% mais escuro, como o rosa fechado das
 * casas fortes do modelo do Outubro Rosa. Escurecer mantém o texto branco
 * legível nas cores médias (rosa, azul) sem mudar a matiz.
 */
export function corForte(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const escuro = (i: number) =>
    Math.round(parseInt(m[1].slice(i, i + 2), 16) * 0.82).toString(16).padStart(2, '0');
  return `#${escuro(0)}${escuro(2)}${escuro(4)}`.toUpperCase();
}

/**
 * O tema que vale. «Automático» (o padrão de mês sem capa) escolhe a campanha
 * do mês — Outubro Rosa em outubro —, e cai no Padrão em mês sem campanha.
 */
export function temaEfetivo(id: string | null | undefined, mes: number): TemaCalendario {
  const padrao = TEMAS[0];
  if (!id || id === TEMA_AUTOMATICO) return TEMAS.find(t => t.mes === mes) ?? padrao;
  return TEMAS.find(t => t.id === id) ?? padrao;
}

// ── Datas ────────────────────────────────────────────────────────────────────

export function isoDoDia(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Todos os dias do mês 'yyyy-MM', em ISO. */
export function diasDoMes(mes: string): string[] {
  const [ano, m] = mes.split('-').map(Number);
  const total = diasNoMes(mes);
  return Array.from({ length: total }, (_, i) => isoDoDia(ano, m, i + 1));
}

/**
 * A grade do mês em semanas de domingo a sábado. `null` são as casas de fora
 * do mês, antes do dia 1 e depois do último.
 */
export function semanasDoMes(mes: string): (string | null)[][] {
  const dias = diasDoMes(mes);
  const casas: (string | null)[] = [
    ...Array<null>(diaDaSemana(dias[0])).fill(null),
    ...dias,
  ];
  while (casas.length % 7 !== 0) casas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < casas.length; i += 7) semanas.push(casas.slice(i, i + 7));
  return semanas;
}

/** Os dias do mês que a regra escolhe. */
export function diasDaRegra(
  mes: string, regra: RegraDias, ehDiaUtil: (iso: string) => boolean,
): string[] {
  return diasDoMes(mes).filter(iso => {
    const dow = diaDaSemana(iso);
    switch (regra.tipo) {
      case 'semana':         return dow === regra.dia;
      case 'dias_uteis':     return ehDiaUtil(iso);
      case 'fins_de_semana': return dow === 0 || dow === 6;
      case 'todos':          return true;
    }
  });
}

// ── O mês montado ────────────────────────────────────────────────────────────

export interface EventoCalendario {
  id: string;
  dia: string;
  tipo: TipoEvento;
  titulo: string;
  detalhe: string | null;
  destaque: boolean;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  pessoa_foto: string | null;
}

/** Os eventos agrupados por dia, na ordem em que chegaram. */
export function eventosPorDia(eventos: readonly EventoCalendario[]): Map<string, EventoCalendario[]> {
  const mapa = new Map<string, EventoCalendario[]>();
  for (const e of eventos) {
    const lista = mapa.get(e.dia);
    if (lista) lista.push(e); else mapa.set(e.dia, [e]);
  }
  return mapa;
}

/**
 * O feriado de um dia, como o calendário mostra.
 *
 * `folga` vem das Metas: o dia está nos feriados que a meta desconta, e a
 * operação não trabalha. Feriado nacional que as Metas NÃO têm é dia de
 * trabalho — tem feriado em que a operação trabalha, e é lá que se decide —:
 * aparece só com o nome e «expediente normal».
 */
export interface FeriadoDoDia {
  nome: string;
  folga: boolean;
}

export function feriadosDoMes(mes: string, feriadosOficiais: readonly string[]): Map<string, FeriadoDoDia> {
  const ano = Number(mes.slice(0, 4));
  const nacionais = new Map(feriadosNacionais(ano).map(f => [f.dia, f.nome]));
  const oficiais = new Set(feriadosOficiais);
  const mapa = new Map<string, FeriadoDoDia>();
  for (const iso of diasDoMes(mes)) {
    const nome = nacionais.get(iso);
    if (oficiais.has(iso)) mapa.set(iso, { nome: nome ?? 'Feriado', folga: true });
    else if (nome) mapa.set(iso, { nome, folga: false });
  }
  return mapa;
}

export interface ResumoDoMes {
  diasNoMes: number;
  diasUteis: number;
  /** Dias úteis de hoje (inclusive) em diante. `null` fora do mês corrente. */
  diasUteisRestantes: number | null;
  /** Feriados em que a operação não trabalha: os das Metas, e só eles. */
  feriados: number;
  diasComBancoDeHoras: number;
  aniversariantes: number;
}

export function resumoDoMes(
  mes: string,
  eventos: readonly EventoCalendario[],
  ehDiaUtil: (iso: string) => boolean,
  feriadosOficiais: readonly string[],
  hojeISO: string,
): ResumoDoMes {
  const dias = diasDoMes(mes);
  const uteis = dias.filter(ehDiaUtil);
  const doMes = new Set(dias);
  const feriados = new Set(feriadosOficiais.filter(d => doMes.has(d)));
  const comBanco = new Set<string>();
  const aniversariantes = new Set<string>();
  for (const e of eventos) {
    if (e.tipo === 'banco_horas') comBanco.add(e.dia);
    if (e.tipo === 'aniversario') aniversariantes.add(e.pessoa_id ?? `${e.titulo}|${e.dia}`);
  }
  const ehMesCorrente = hojeISO.slice(0, 7) === mes;
  return {
    diasNoMes: dias.length,
    diasUteis: uteis.length,
    diasUteisRestantes: ehMesCorrente ? uteis.filter(d => d >= hojeISO).length : null,
    feriados: feriados.size,
    diasComBancoDeHoras: comBanco.size,
    aniversariantes: aniversariantes.size,
  };
}

/**
 * Os próximos eventos a partir de hoje (no mês corrente) ou do dia 1 (nos
 * outros), para a agenda — é por ela que o operador lê o mês no celular.
 */
export function proximosEventos(
  mes: string, eventos: readonly EventoCalendario[], hojeISO: string,
): EventoCalendario[] {
  const desde = hojeISO.slice(0, 7) === mes ? hojeISO : `${mes}-01`;
  return eventos.filter(e => e.dia >= desde);
}

// ── Textos ───────────────────────────────────────────────────────────────────

const SEMANA_LONGA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const SEMANA_CURTA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** «Sexta-feira, 16 de outubro». */
export function rotuloDoDia(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const semana = SEMANA_LONGA[diaDaSemana(iso)];
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${d} de ${MESES[m - 1]}`;
}

/** «Outubro de 2026». */
export function rotuloDoMesLongo(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  const nome = MESES[m - 1];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${ano}`;
}
