/**
 * chipsFisicosRegras — o que a separação Chips Físicos sabe, sem banco nem tela.
 *
 * ## Três status e um tempo
 *
 * Ativo, Banido e Recuperar. Banido e Recuperar podem levar um tempo de até 12
 * horas (`TEMPO_MAXIMO_MINUTOS`); Ativo nunca leva. As duas regras moram também
 * no banco (`chips_fisicos_prazo` e `fn_chips_fisicos_alterar_status`) — aqui
 * elas existem para a tela não oferecer o que a RPC vai recusar.
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

export const STATUS_CHIP = ['ativo', 'banido', 'recuperar'] as const;
export type StatusChip = typeof STATUS_CHIP[number];

export const STATUS_CHIP_LABELS: Record<StatusChip, string> = {
  ativo: 'Ativo',
  banido: 'Banido',
  recuperar: 'Recuperar',
};

/** O que cada status quer dizer, na frase da janela de status. */
export const STATUS_CHIP_DESCRICAO: Record<StatusChip, string> = {
  ativo: 'Funcionando e em uso.',
  banido: 'O WhatsApp baniu este chip.',
  recuperar: 'Em tentativa de recuperação.',
};

export function eStatusChip(valor: unknown): valor is StatusChip {
  return typeof valor === 'string' && (STATUS_CHIP as readonly string[]).includes(valor);
}

/** Só Banido e Recuperar levam tempo. */
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

/** 12 horas — o teto do pedido, e o do banco. */
export const TEMPO_MAXIMO_MINUTOS = 12 * 60;

/** Os atalhos da janela de status. */
export const TEMPOS_RAPIDOS_MINUTOS = [60, 2 * 60, 4 * 60, 6 * 60, 8 * 60, 12 * 60] as const;

/**
 * O que há de errado com este tempo, ou `null`. Sem tempo (`null`) é válido: o
 * tempo é opcional.
 */
export function erroDoTempo(status: StatusChip, minutos: number | null): string | null {
  if (minutos === null) return null;
  if (!aceitaTempo(status)) return 'Chip ativo não leva tempo.';
  if (!Number.isInteger(minutos) || minutos < 1) return 'Informe pelo menos 1 minuto.';
  if (minutos > TEMPO_MAXIMO_MINUTOS) return 'O tempo vai até 12 horas.';
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
}

export interface ResumoChips {
  total: number;
  ativo: number;
  banido: number;
  recuperar: number;
  /** Banido ou Recuperar cujo tempo já acabou — quem precisa de atenção. */
  tempoEncerrado: number;
}

export function resumir(chips: readonly ChipParaConta[], agora: number): ResumoChips {
  const r: ResumoChips = { total: 0, ativo: 0, banido: 0, recuperar: 0, tempoEncerrado: 0 };
  for (const c of chips) {
    r.total += 1;
    r[c.status] += 1;
    if (estadoDoTempo(c, agora).tipo === 'encerrado') r.tempoEncerrado += 1;
  }
  return r;
}

/** O filtro dos contadores: um status, o tempo encerrado, ou tudo. */
export type FiltroStatusChip = StatusChip | 'tempo_encerrado' | 'todos';

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
 * alterado. Dentro do bloco, os que pedem atenção primeiro: Banido, Recuperar,
 * Ativo; e pelo número dentro de cada status.
 *
 * Chip de pessoa que a tela não conhece (saiu da empresa, por exemplo) cai num
 * bloco com o nome «Pessoa não encontrada», em vez de sumir.
 */
export function agruparPorPessoa<T extends ChipParaConta>(
  chips: readonly T[],
  pessoas: ReadonlyMap<string, PessoaDoChip>,
): BlocoPessoa<T>[] {
  const ordemStatus: Record<StatusChip, number> = { banido: 0, recuperar: 1, ativo: 2 };
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
