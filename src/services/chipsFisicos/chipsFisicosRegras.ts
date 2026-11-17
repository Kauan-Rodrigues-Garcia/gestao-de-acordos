/**
 * chipsFisicosRegras — o que a separação Chips Físicos sabe, sem banco nem tela.
 *
 * ## Quatro status e um tempo
 *
 * Ativo, Restrição, Banido e Recuperar. Todo status fora de Ativo pode levar um
 * tempo de até 24 horas (`TEMPO_MAXIMO_MINUTOS`) — o tempo para o chip voltar;
 * Ativo nunca leva. As duas regras moram também no banco
 * (`chips_fisicos_prazo` e `fn_chips_fisicos_alterar_status`, 20260922100000)
 * — aqui elas existem para a tela não oferecer o que a RPC vai recusar.
 *
 * O fim do tempo NÃO troca o status, como no Controle de Números: a tela mostra
 * «Tempo encerrado» e quem cuida do chip decide.
 *
 * ## Separado de `numerosRegras`
 *
 * Os chips físicos não têm posse, Núcleo nem situação de aquecimento. Reusar os
 * tipos do outro módulo faria um `Situacao` de número aparecer num chip — os
 * dois só dividem o formato do número (`numerosFormato`) e a conta do prazo.
 */
import { estadoDoPrazo } from '@/services/numeros/numerosRegras';

// ── Status ──────────────────────────────────────────────────────────────────

export const STATUS_CHIP = ['ativo', 'restricao', 'banido', 'recuperar'] as const;
export type StatusChip = typeof STATUS_CHIP[number];

export const STATUS_CHIP_LABELS: Record<StatusChip, string> = {
  ativo: 'Ativo',
  restricao: 'Restrição',
  banido: 'Banido',
  recuperar: 'Recuperar',
};

/** O rótulo dos contadores: «3 banidos», «1 em restrição». */
export function rotuloContagem(status: StatusChip, n: number): string {
  switch (status) {
    case 'ativo':     return n === 1 ? 'ativo' : 'ativos';
    case 'restricao': return 'em restrição';
    case 'banido':    return n === 1 ? 'banido' : 'banidos';
    case 'recuperar': return 'recuperar';
  }
}

/** O que cada status quer dizer, na frase da janela de status. */
export const STATUS_CHIP_DESCRICAO: Record<StatusChip, string> = {
  ativo: 'Funcionando e em uso.',
  restricao: 'O WhatsApp restringiu este chip por um tempo.',
  banido: 'O WhatsApp baniu este chip.',
  recuperar: 'Em tentativa de recuperação.',
};

export function eStatusChip(valor: unknown): valor is StatusChip {
  return typeof valor === 'string' && (STATUS_CHIP as readonly string[]).includes(valor);
}

/** Todo status fora de Ativo leva tempo. */
export function aceitaTempo(status: StatusChip): boolean {
  return status !== 'ativo';
}

// ── Operadora ───────────────────────────────────────────────────────────────

export const OPERADORAS = ['vivo', 'claro', 'tim', 'oi', 'outra'] as const;
export type Operadora = typeof OPERADORAS[number];

export const OPERADORA_LABELS: Record<Operadora, string> = {
  vivo: 'Vivo', claro: 'Claro', tim: 'TIM', oi: 'Oi', outra: 'Outra',
};

export function eOperadora(valor: unknown): valor is Operadora {
  return typeof valor === 'string' && (OPERADORAS as readonly string[]).includes(valor);
}

export const OBSERVACAO_MAX = 200;

// ── Tempo ───────────────────────────────────────────────────────────────────

/** 24 horas — o teto do pedido de 22/09/2026, e o do banco. */
export const TEMPO_MAXIMO_MINUTOS = 24 * 60;

/** Os atalhos da janela de status. */
export const TEMPOS_RAPIDOS_MINUTOS = [
  60, 2 * 60, 4 * 60, 6 * 60, 8 * 60, 12 * 60, 24 * 60,
] as const;

/**
 * O que há de errado com este tempo, ou `null`. Sem tempo (`null`) é válido: o
 * tempo é opcional.
 */
export function erroDoTempo(status: StatusChip, minutos: number | null): string | null {
  if (minutos === null) return null;
  if (!aceitaTempo(status)) return 'Chip ativo não leva tempo.';
  if (!Number.isInteger(minutos) || minutos < 1) return 'Informe pelo menos 1 minuto.';
  if (minutos > TEMPO_MAXIMO_MINUTOS) return 'O tempo vai até 24 horas.';
  return null;
}

/** `1 h`, `1 h 30 min`, `45 min`. */
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export type EstadoTempo =
  | { tipo: 'sem_tempo' }
  | { tipo: 'correndo'; restanteMs: number }
  | { tipo: 'encerrado' };

/**
 * Onde está o tempo deste chip agora. Um chip Ativo com `prazo_ate` sobrando
 * não acontece (o CHECK impede), mas se acontecer a tela não mostra tempo.
 */
export function estadoDoTempo(
  chip: { status: StatusChip; prazo_ate: string | null },
  agora: number,
): EstadoTempo {
  if (!aceitaTempo(chip.status)) return { tipo: 'sem_tempo' };
  const prazo = estadoDoPrazo(chip.prazo_ate, agora);
  if (!prazo) return { tipo: 'sem_tempo' };
  return prazo.acabou ? { tipo: 'encerrado' } : { tipo: 'correndo', restanteMs: prazo.restanteMs };
}

// ── Resumo e filtro ─────────────────────────────────────────────────────────

/** O mínimo de um chip que as contas abaixo leem. */
export interface ChipParaConta {
  id: string;
  operador_id: string;
  numero: string;
  status: StatusChip;
  prazo_ate: string | null;
  /** 2.0 — ausente antes da migration 20261117200000. */
  etiquetas?: readonly string[] | null;
  lembrete_ate?: string | null;
  lembrete_texto?: string | null;
}

export interface ResumoChips {
  total: number;
  ativo: number;
  restricao: number;
  banido: number;
  recuperar: number;
  /** Chip fora de Ativo cujo tempo já acabou — quem precisa de atenção. */
  tempoEncerrado: number;
  /** Com a etiqueta Movimentando — o chip que a pessoa usa agora. */
  movimentando: number;
  /** Lembrete da pessoa que já venceu. */
  lembreteVencido: number;
}

export function resumir(chips: readonly ChipParaConta[], agora: number): ResumoChips {
  const r: ResumoChips = {
    total: 0, ativo: 0, restricao: 0, banido: 0, recuperar: 0, tempoEncerrado: 0,
    movimentando: 0, lembreteVencido: 0,
  };
  for (const c of chips) {
    r.total += 1;
    r[c.status] += 1;
    if (estadoDoTempo(c, agora).tipo === 'encerrado') r.tempoEncerrado += 1;
    if (c.etiquetas?.includes('movimentando')) r.movimentando += 1;
    if (c.lembrete_ate && c.lembrete_texto && new Date(c.lembrete_ate).getTime() <= agora) r.lembreteVencido += 1;
  }
  return r;
}

/** O filtro dos contadores: um status, o tempo encerrado, ou tudo. */
export type FiltroStatusChip = StatusChip | 'tempo_encerrado' | 'movimentando' | 'todos';

export interface FiltroChips {
  status: FiltroStatusChip;
  /** Pedaço do número (qualquer formatação) ou do nome da pessoa. */
  busca: string;
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * `encerrado` diz se o tempo do chip já acabou. Vem de fora, e não como um
 * instante, para a tela decidir quando o relógio conta: ela só refaz a lista no
 * segundo em que um tempo acaba, não a cada batida.
 */
export function filtrarChips<T extends ChipParaConta>(
  chips: readonly T[],
  filtro: FiltroChips,
  nomeDaPessoa: (operadorId: string) => string,
  encerrado: (chip: T) => boolean,
): T[] {
  const termo = filtro.busca.trim();
  const digitos = termo.replace(/\D/g, '');
  const texto = semAcento(termo);

  return chips.filter((c) => {
    if (filtro.status === 'tempo_encerrado') {
      if (!encerrado(c)) return false;
    } else if (filtro.status === 'movimentando') {
      if (!c.etiquetas?.includes('movimentando')) return false;
    } else if (filtro.status !== 'todos' && c.status !== filtro.status) {
      return false;
    }
    if (!termo) return true;
    if (digitos && c.numero.includes(digitos)) return true;
    return semAcento(nomeDaPessoa(c.operador_id)).includes(texto);
  });
}

// ── Agrupamento por pessoa ──────────────────────────────────────────────────

export interface PessoaDoChip {
  id: string;
  nome: string;
  foto_url: string | null;
  setor_id: string | null;
}

export interface BlocoPessoa<T extends ChipParaConta> {
  pessoa: PessoaDoChip;
  chips: T[];
}

/**
 * Um bloco por pessoa, em ordem alfabética — com muita gente no setor, a
 * liderança procura a pessoa pelo nome, e a ordem não pode mudar a cada status
 * alterado. Dentro do bloco, os que pedem atenção primeiro: Banido, Restrição,
 * Recuperar, Ativo; e pelo número dentro de cada status.
 *
 * Chip de pessoa que a tela não conhece (saiu da empresa, por exemplo) cai num
 * bloco com o nome «Pessoa não encontrada», em vez de sumir.
 */
export function agruparPorPessoa<T extends ChipParaConta>(
  chips: readonly T[],
  pessoas: ReadonlyMap<string, PessoaDoChip>,
): BlocoPessoa<T>[] {
  const ordemStatus: Record<StatusChip, number> = {
    banido: 0, restricao: 1, recuperar: 2, ativo: 3,
  };
  const blocos = new Map<string, BlocoPessoa<T>>();

  for (const c of chips) {
    let bloco = blocos.get(c.operador_id);
    if (!bloco) {
      bloco = {
        pessoa: pessoas.get(c.operador_id) ?? {
          id: c.operador_id, nome: 'Pessoa não encontrada', foto_url: null, setor_id: null,
        },
        chips: [],
      };
      blocos.set(c.operador_id, bloco);
    }
    bloco.chips.push(c);
  }

  for (const b of blocos.values()) {
    b.chips.sort((a, z) =>
      ordemStatus[a.status] - ordemStatus[z.status] || a.numero.localeCompare(z.numero));
  }

  return [...blocos.values()].sort((a, z) =>
    a.pessoa.nome.localeCompare(z.pessoa.nome, 'pt-BR'));
}

// ── 2.0 (17/11/2026): etiquetas, dias ativo, semáforo, lembrete ────────────

/**
 * As etiquetas do chip. A lista mora também no CHECK `chips_fisicos_etiquetas`
 * (migration 20261117200000) — aqui ela existe para a tela não oferecer o que
 * o banco recusa.
 */
export const ETIQUETAS_CHIP = [
  'movimentando', 'principal', 'reserva', 'aquecendo', 'campanha', 'sem_credito',
] as const;
export type EtiquetaChip = typeof ETIQUETAS_CHIP[number];

export const ETIQUETA_CHIP_LABELS: Record<EtiquetaChip, string> = {
  movimentando: 'Movimentando',
  principal:    'Principal',
  reserva:      'Reserva',
  aquecendo:    'Aquecendo',
  campanha:     'Campanha',
  sem_credito:  'Sem crédito',
};

export const ETIQUETA_CHIP_DESCRICAO: Record<EtiquetaChip, string> = {
  movimentando: 'O chip que a pessoa está usando agora.',
  principal:    'O chip principal da pessoa.',
  reserva:      'Guardado para quando outro cair.',
  aquecendo:    'Novo, ainda sendo aquecido.',
  campanha:     'Usado para disparar campanhas.',
  sem_credito:  'Precisa de recarga.',
};

export function eEtiquetaChip(v: unknown): v is EtiquetaChip {
  return typeof v === 'string' && (ETIQUETAS_CHIP as readonly string[]).includes(v);
}

/** As etiquetas válidas do chip, na ordem do catálogo. Coluna ausente = nenhuma. */
export function etiquetasDoChip(chip: { etiquetas?: readonly string[] | null }): EtiquetaChip[] {
  const tem = new Set(chip.etiquetas ?? []);
  return ETIQUETAS_CHIP.filter(e => tem.has(e));
}

const DIA_MS = 86_400_000;

/**
 * Quanto tempo o chip ficou ATIVO, em ms: o acumulado dos períodos que já
 * acabaram mais o período de agora, se está Ativo. O acumulado começou em
 * 17/11/2026; antes disso só existe o período atual.
 */
export function tempoAtivoMs(
  chip: { status: StatusChip; status_desde: string; ativo_acumulado_seg?: number | null },
  agora: number,
): number {
  const acumulado = Math.max(chip.ativo_acumulado_seg ?? 0, 0) * 1000;
  if (chip.status !== 'ativo') return acumulado;
  const desde = new Date(chip.status_desde).getTime();
  return acumulado + (Number.isFinite(desde) ? Math.max(agora - desde, 0) : 0);
}

/** Dias inteiros. */
export function diasDe(ms: number): number {
  return Math.floor(Math.max(ms, 0) / DIA_MS);
}

/** «hoje», «1 dia», «12 dias». */
export function rotuloDias(ms: number): string {
  const d = diasDe(ms);
  if (d === 0) return 'menos de 1 dia';
  return d === 1 ? '1 dia' : `${d} dias`;
}

/**
 * A ordem das luzes do semáforo: o que está bem primeiro (verde), depois o que
 * está voltando (amarelo), o que está preso (laranja) e o que caiu (vermelho).
 * Lida da esquerda para a direita, a fileira «enche» de verde quando está tudo
 * bem e acende vermelho na ponta quando algo caiu.
 */
const ORDEM_SEMAFORO: Record<StatusChip, number> = {
  ativo: 0, recuperar: 1, restricao: 2, banido: 3,
};

export function luzesDoSemaforo<T extends { status: StatusChip; numero: string }>(chips: readonly T[]): T[] {
  return [...chips].sort((a, z) =>
    ORDEM_SEMAFORO[a.status] - ORDEM_SEMAFORO[z.status] || a.numero.localeCompare(z.numero));
}

/** Percentual de chips ativos (0–100), arredondado. Sem chip = 0. */
export function saudeDosChips(r: Pick<ResumoChips, 'total' | 'ativo'>): number {
  return r.total > 0 ? Math.round((r.ativo / r.total) * 100) : 0;
}

export type EstadoLembrete =
  | { tipo: 'sem_lembrete' }
  | { tipo: 'correndo'; restanteMs: number; texto: string }
  | { tipo: 'vencido'; texto: string };

export function estadoDoLembrete(
  chip: { lembrete_ate?: string | null; lembrete_texto?: string | null },
  agora: number,
): EstadoLembrete {
  if (!chip.lembrete_ate || !chip.lembrete_texto) return { tipo: 'sem_lembrete' };
  const fim = new Date(chip.lembrete_ate).getTime();
  if (!Number.isFinite(fim)) return { tipo: 'sem_lembrete' };
  return fim <= agora
    ? { tipo: 'vencido', texto: chip.lembrete_texto }
    : { tipo: 'correndo', restanteMs: fim - agora, texto: chip.lembrete_texto };
}

/** 7 dias — o teto do lembrete no banco. */
export const LEMBRETE_MAXIMO_MINUTOS = 7 * 24 * 60;
export const LEMBRETE_TEXTO_MAX = 80;

export const LEMBRETES_RAPIDOS_MINUTOS = [15, 30, 60, 2 * 60, 4 * 60, 24 * 60, 3 * 24 * 60] as const;

export function erroDoLembrete(texto: string, minutos: number | null): string | null {
  if (minutos === null) return 'Escolha em quanto tempo avisar.';
  if (!Number.isInteger(minutos) || minutos < 1) return 'Informe pelo menos 1 minuto.';
  if (minutos > LEMBRETE_MAXIMO_MINUTOS) return 'O lembrete vai até 7 dias.';
  const t = texto.trim();
  if (!t) return 'Escreva do que é o lembrete.';
  if (t.length > LEMBRETE_TEXTO_MAX) return `Até ${LEMBRETE_TEXTO_MAX} caracteres.`;
  return null;
}

/** «45 min», «2 h», «1 dia 4 h», «3 dias». Para durações de lembrete. */
export function formatarDuracaoLonga(minutos: number): string {
  const dias = Math.floor(minutos / 1440);
  const resto = minutos % 1440;
  if (dias === 0) return formatarDuracao(minutos);
  const d = dias === 1 ? '1 dia' : `${dias} dias`;
  return resto === 0 ? d : `${d} ${formatarDuracao(resto)}`;
}
