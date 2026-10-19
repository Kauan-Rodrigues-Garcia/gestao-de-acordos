/**
 * desafioDoDia.ts — o desafio de UM dia, que a gerência lança e o setor vê na
 * barra superior (pedido do Cleber, 19/10/2026).
 *
 * ## Onde ele mora
 *
 * Na mesma tabela `desafios`, sem coluna nova: `tipo = 'meta_coletiva'`,
 * `dataInicio = dataFim = o dia`, e a configuração do dia em `regra.diario`.
 * Lida por código que não conhece o campo, a linha é uma meta coletiva de um
 * dia — coerente, e nada quebra.
 *
 * ## De onde vem o número
 *
 * De `fn_desafio_diario` (migration 20261019140000), que usa a conta do Painel
 * do Líder: `fn_recebido_por_setor` para o setor, `fn_recebido_por_equipe` para
 * a equipe, e a regra do setor da pessoa para o operador. Analítico = relatório
 * 58 (importação do dia) + 59 (o robô que reconcilia). Este arquivo não soma
 * nada: só lê a configuração e faz a conta de meta, falta e tempo.
 *
 * ## A janela de horário
 *
 * O analítico só tem a DATA do pagamento. A hora é a de chegada da linha: o
 * robô do 59 roda no minuto :07 e traz o que foi pago até a hora cheia. «Das 14h
 * às 17h» conta o que chega de 15:00 a 17:59 — o placar fecha com o robô das
 * 17:07. É a convenção do Plantão Elite, e a tela diz isso.
 *
 * Puro: sem React e sem banco. Testado em `desafioDoDia.test.ts`.
 */
import { diasUteisDoMes } from '@/lib/diasUteis';
import type { DadosGravacaoDesafio } from './desafios.service';
import type {
  AcentoDesafio, Desafio, RegraDesafio, StatusDesafio, VisualDesafio,
} from './types';

// ── Configuração ─────────────────────────────────────────────────────────────

/** Para quem o desafio vale. */
export type PublicoDoDia = 'setor' | 'equipe' | 'operador';

/**
 * O que conta.
 *
 * `valor`       — R$ recebidos no dia (ou na janela).
 * `quantidade`  — número de pagamentos.
 * `meta_diaria` — % da meta diária do Painel (meta do mês ÷ dias úteis), a
 *                 «projeção do dia». O alvo em R$ sai da meta do alvo.
 */
export type MedidaDoDia = 'valor' | 'quantidade' | 'meta_diaria';

export interface DiarioDesafio {
  versao: 1;
  publico: PublicoDoDia;
  /** Setor, equipe ou perfil — conforme `publico`. */
  alvoId: string;
  /** Nome do alvo na hora em que foi escolhido. Só para a tela. */
  alvoNome: string;
  medida: MedidaDoDia;
  /** R$ (`valor`), pagamentos (`quantidade`) ou % (`meta_diaria`). */
  meta: number;
  /** Hora cheia de início (0-23). `null` = o dia inteiro. */
  horaInicio: number | null;
  /** Hora cheia de fim (1-24), depois do início. `null` = o dia inteiro. */
  horaFim: number | null;
}

const PUBLICOS: readonly PublicoDoDia[] = ['setor', 'equipe', 'operador'];
const MEDIDAS: readonly MedidaDoDia[] = ['valor', 'quantidade', 'meta_diaria'];

function horaOuNula(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/**
 * A configuração do dia, ou `null` quando a campanha não é um desafio do dia.
 *
 * Horário torto (fim antes do início, hora fora do relógio) vira dia inteiro —
 * a mesma leitura do banco. Uma janela vazia faria o placar ficar zerado sem
 * explicação nenhuma.
 */
export function normalizarDiario(bruto: unknown): DiarioDesafio | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  const o = bruto as Record<string, unknown>;
  const alvoId = typeof o.alvoId === 'string' ? o.alvoId : '';
  if (!alvoId) return null;

  const meta = Number(o.meta);
  let horaInicio = horaOuNula(o.horaInicio, 0, 23);
  let horaFim    = horaOuNula(o.horaFim, 1, 24);
  if (horaInicio === null || horaFim === null || horaFim <= horaInicio) {
    horaInicio = null;
    horaFim = null;
  }

  return {
    versao: 1,
    publico: PUBLICOS.includes(o.publico as PublicoDoDia) ? (o.publico as PublicoDoDia) : 'setor',
    alvoId,
    alvoNome: typeof o.alvoNome === 'string' ? o.alvoNome : '',
    medida: MEDIDAS.includes(o.medida as MedidaDoDia) ? (o.medida as MedidaDoDia) : 'valor',
    meta: Number.isFinite(meta) && meta > 0 ? meta : 0,
    horaInicio,
    horaFim,
  };
}

/** A campanha é um desafio do dia? */
export function ehDesafioDoDia(desafio: Pick<Desafio, 'regra'> | null | undefined): boolean {
  return !!desafio?.regra.diario;
}

// ── Rótulos ──────────────────────────────────────────────────────────────────

export function rotuloHora(h: number): string {
  return `${String(h).padStart(2, '0')}h`;
}

/** «o dia inteiro» ou «das 14h às 17h». */
export function rotuloJanela(d: Pick<DiarioDesafio, 'horaInicio' | 'horaFim'>): string {
  if (d.horaInicio === null || d.horaFim === null) return 'o dia inteiro';
  return `das ${rotuloHora(d.horaInicio)} às ${rotuloHora(d.horaFim)}`;
}

export const ROTULO_PUBLICO: Readonly<Record<PublicoDoDia, string>> = {
  setor: 'Setor inteiro',
  equipe: 'Uma equipe',
  operador: 'Um operador',
};

export const ROTULO_MEDIDA: Readonly<Record<MedidaDoDia, string>> = {
  valor: 'Valor recebido',
  quantidade: 'Pagamentos',
  meta_diaria: 'Meta diária',
};

/** O alvo, em uma frase curta: «R$ 10.000», «40 pagamentos», «120% da meta diária». */
export function rotuloAlvo(d: Pick<DiarioDesafio, 'medida' | 'meta'>, formatarValor: (v: number) => string): string {
  switch (d.medida) {
    case 'quantidade':  return `${d.meta} ${d.meta === 1 ? 'pagamento' : 'pagamentos'}`;
    case 'meta_diaria': return `${String(d.meta).replace('.', ',')}% da meta diária`;
    default:            return formatarValor(d.meta);
  }
}

// ── A meta efetiva ───────────────────────────────────────────────────────────

/**
 * A meta diária do Painel: meta do mês ÷ dias úteis do mês. É a «diária p/
 * meta» de `calcularProjecao` — fixa no mês, e não o ritmo que sobe quando se
 * atrasa. `null` sem meta mensal ou sem dia útil.
 */
export function metaDiariaDoMes(
  metaMes: number | null | undefined, diaISO: string, feriados: readonly string[] = [],
): number | null {
  const meta = Number(metaMes) || 0;
  const [ano, mes] = diaISO.split('-').map(Number);
  if (meta <= 0 || !ano || !mes) return null;
  const uteis = diasUteisDoMes(ano, mes, [...feriados]);
  return uteis > 0 ? meta / uteis : null;
}

/**
 * O alvo do dia na unidade da medida (R$ ou pagamentos).
 *
 * `meta_diaria` sem meta mensal cadastrada devolve `null`: a tela diz «sem meta
 * do mês» em vez de anunciar um alvo de zero, que todo mundo já teria batido.
 */
export function metaEfetiva(
  d: Pick<DiarioDesafio, 'medida' | 'meta'>,
  metaDiaria: number | null,
): number | null {
  if (d.meta <= 0) return null;
  if (d.medida !== 'meta_diaria') return d.meta;
  if (metaDiaria === null || metaDiaria <= 0) return null;
  return Math.round(metaDiaria * d.meta) / 100;
}

// ── O tempo ──────────────────────────────────────────────────────────────────

/**
 * Onde o desafio está agora.
 *
 * `agendado`  — ainda não começou (outro dia, ou antes do horário).
 * `valendo`   — dentro da janela.
 * `apurando`  — a janela fechou; falta chegar o último lote do robô (até 1h).
 * `encerrado` — acabou.
 * `rascunho`  — não publicado.
 */
export type SituacaoDoDia = 'rascunho' | 'agendado' | 'valendo' | 'apurando' | 'encerrado';

/**
 * @param minutoAgora minutos desde a meia-noite em São Paulo (0-1439).
 */
export function situacaoDoDia(params: {
  status: StatusDesafio;
  diaISO: string;
  hojeISO: string;
  minutoAgora: number;
  diario: Pick<DiarioDesafio, 'horaInicio' | 'horaFim'>;
}): SituacaoDoDia {
  const { status, diaISO, hojeISO, minutoAgora, diario } = params;
  if (status === 'rascunho') return 'rascunho';
  if (status === 'encerrado' || diaISO < hojeISO) return 'encerrado';
  if (diaISO > hojeISO) return 'agendado';
  if (diario.horaInicio === null || diario.horaFim === null) return 'valendo';
  if (minutoAgora < diario.horaInicio * 60) return 'agendado';
  if (minutoAgora < diario.horaFim * 60) return 'valendo';
  // O robô das H:07 traz o que foi pago até H — a última hora entra até H+1.
  if (minutoAgora < (diario.horaFim + 1) * 60) return 'apurando';
  return 'encerrado';
}

/** Minutos até o fim da janela (ou da meia-noite). Zero quando já passou. */
export function minutosRestantes(
  diario: Pick<DiarioDesafio, 'horaFim'>, minutoAgora: number,
): number {
  const fim = (diario.horaFim ?? 24) * 60;
  return Math.max(0, fim - minutoAgora);
}

/** Minutos até começar. */
export function minutosParaComecar(
  diario: Pick<DiarioDesafio, 'horaInicio'>, minutoAgora: number,
): number {
  return Math.max(0, (diario.horaInicio ?? 0) * 60 - minutoAgora);
}

/** `95` → «1h35», `40` → «40 min». */
export function duracaoCurta(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

/** Minutos desde a meia-noite em São Paulo — o relógio da operação. */
export function minutoAgoraSaoPaulo(agora: Date = new Date()): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(agora);
  const h = Number(partes.find(p => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(partes.find(p => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

// ── O placar ─────────────────────────────────────────────────────────────────

export interface Contribuinte {
  id: string;
  nome: string;
  fotoUrl: string | null;
  equipe: string | null;
  total: number;
  qtd: number;
  /** ISO da última linha que chegou dela no desafio. */
  ultima: string | null;
}

export interface PlacarDoDia {
  /** `false` = setor Cofen, que esta versão não mede. */
  suportado: boolean;
  regraSetor: string;
  publico: PublicoDoDia;
  total: number;
  qtd: number;
  contribuintes: Contribuinte[];
  ultimaChegada: string | null;
  metaMes: number | null;
  feriados: string[];
  /** Quem chama está no alvo. É o que acende a barra superior. */
  participo: boolean;
  /** Quem chama criou o desafio. */
  acompanho: boolean;
}

export interface AndamentoDoDia {
  /** Na unidade da medida: R$ ou pagamentos. */
  realizado: number;
  meta: number | null;
  falta: number;
  /** 0-100+, sem teto. */
  progresso: number;
  bateu: boolean;
  porQuantidade: boolean;
}

export function andamentoDoDia(diario: DiarioDesafio, placar: Pick<PlacarDoDia, 'total' | 'qtd' | 'metaMes' | 'feriados'>, diaISO: string): AndamentoDoDia {
  const porQuantidade = diario.medida === 'quantidade';
  const realizado = porQuantidade ? placar.qtd : placar.total;
  const meta = metaEfetiva(diario, metaDiariaDoMes(placar.metaMes, diaISO, placar.feriados));
  const falta = meta === null ? 0 : Math.max(0, meta - realizado);
  const progresso = meta && meta > 0 ? (realizado / meta) * 100 : 0;
  return { realizado, meta, falta, progresso, bateu: meta !== null && realizado >= meta, porQuantidade };
}

/** O que mudou entre duas leituras: quem fez entrar e quanto. */
export interface Entrada {
  id: string;
  nome: string;
  fotoUrl: string | null;
  valor: number;
  qtd: number;
}

export function entradasNovas(antes: readonly Contribuinte[], depois: readonly Contribuinte[]): Entrada[] {
  const mapa = new Map(antes.map(c => [c.id, c]));
  const saida: Entrada[] = [];
  for (const c of depois) {
    const a = mapa.get(c.id);
    const valor = c.total - (a?.total ?? 0);
    const qtd = c.qtd - (a?.qtd ?? 0);
    // Só o que SUBIU. Estorno e correção do 59 descem o número, e anunciar
    // «−R$ 120 da Ana» no meio da tela seria apontar o dedo por um ajuste.
    if (valor > 0.004 || qtd > 0) {
      saida.push({ id: c.id, nome: c.nome, fotoUrl: c.fotoUrl, valor: Math.max(0, valor), qtd: Math.max(0, qtd) });
    }
  }
  return saida.sort((x, y) => y.valor - x.valor);
}

// ── Gravação ─────────────────────────────────────────────────────────────────

export interface FormularioDoDia {
  nome: string;
  premio: string;
  recado: string;
  dia: string;
  setorId: string;
  diario: DiarioDesafio;
  acento: AcentoDesafio | null;
  status: StatusDesafio;
  /**
   * A meta em R$ calculada na hora de salvar, para `meta_diaria`.
   *
   * Vai em `metaColetiva` para que o código que não conhece o desafio do dia
   * mostre um número coerente. Quem conhece recalcula pela meta do mês.
   */
  metaCalculada: number | null;
}

/**
 * O formulário vira a linha de `desafios`.
 *
 * O recorte de participantes leva SEMPRE o setor: é o que a RLS
 * (`fn_desafio_no_meu_alcance`) lê para não mostrar o desafio de uma equipe do
 * Play 1 ao líder de uma equipe do Play 2. Equipe e operador estreitam por
 * cima — as dimensões são um E.
 */
export function paraGravacao(f: FormularioDoDia): DadosGravacaoDesafio {
  const d = f.diario;
  const regra: RegraDesafio = {
    versao: 1,
    metrica: d.medida === 'quantidade' ? 'quantidade' : 'valor_recebido',
    modo: ['individual'],
    criterioRanking: 'maior_recebido',
    escopoDisputa: 'empresa',
    premiacao: 'todos_que_batem',
    metaIndividual: null,
    metasPorOperador: {},
    metaEquipe: null,
    metaColetiva: d.medida === 'meta_diaria' ? f.metaCalculada : d.meta,
    participantes: {
      setores: [f.setorId],
      equipes: d.publico === 'equipe' ? [d.alvoId] : [],
      operadores: d.publico === 'operador' ? [d.alvoId] : [],
      cargos: [],
      excluidos: [],
      convidados: [],
    },
    premios: [],
    condicaoPremio: null,
    fonteResultado: 'proprio',
    fonteMeta: 'individual',
    agregacaoLider: 'equipe_unica',
    diario: d,
  };

  const visual: VisualDesafio = {
    tema: 'padrao',
    icone: 'zap',
    mostrarFotos: true,
    animarUltrapassagem: true,
    comemorarMeta: true,
    acento: f.acento,
    midiaNoCard: false,
    // O lugar do desafio do dia é a barra superior. No menu lateral ele
    // empurraria a campanha do mês, que tem a mídia de destaque.
    fixarNoMenu: false,
    ajusteMidia: 'cobrir',
    ajusteArte: 'conter',
  };

  return {
    nome: f.nome.trim(),
    descricao: f.recado.trim() || null,
    premio: f.premio.trim() || null,
    dataInicio: f.dia,
    dataFim: f.dia,
    setorId: f.setorId,
    empresas: [],
    tipo: 'meta_coletiva',
    regra,
    visual,
    status: f.status,
    midiaUrl: null,
    midiaCaminho: null,
    arteUrl: null,
    arteCaminho: null,
    visibilidade: 'alcance',
  };
}

/** O nome que o formulário sugere: «Desafio do dia · Play 1». */
export function nomeSugerido(alvoNome: string): string {
  return alvoNome ? `Desafio do dia · ${alvoNome}` : 'Desafio do dia';
}
