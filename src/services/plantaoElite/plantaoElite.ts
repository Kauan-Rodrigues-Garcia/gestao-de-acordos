/**
 * plantaoElite.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O quadro do Plantão Elite (Receptivo, BookPlay): o recebimento da dupla do
 * dia, faixa a faixa, no formato da planilha «CONTROLE ELITE».
 *
 * Dia ÍMPAR é de uma dupla, dia PAR da outra. Quem está numa dupla vê só a
 * própria; a gerência do Receptivo vê a dupla do dia. Quem decide isso é o
 * banco (`fn_elite_plantao_hora`, migration 20260919100000) — a tela só pede.
 *
 * ## A hora
 *
 * O analítico não tem hora de pagamento, só a DATA. A hora que existe é a de
 * CHEGADA da linha (`importado_em`): o robô do 59 roda no minuto :07 de cada
 * hora e traz o que foi pago até ali. Então o que chegou entre 10:00 e 10:59
 * vai para a faixa 09:00 - 10:00; o que chegou até 09:59, para a primeira
 * (08:30 - 09:00, que também leva o que foi pago antes das 08:30).
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

export type Plantao = 'impar' | 'par';

/** As faixas da planilha, na ordem. */
export const FAIXAS_ELITE = [
  '08:30 - 09:00', '09:00 - 10:00', '10:00 - 11:00', '11:00 - 12:00',
  '12:00 - 13:00', '13:00 - 14:00', '14:00 - 15:00', '15:00 - 16:00',
  '16:00 - 17:00', '17:00 - 18:00', '18:00 - 19:00', '19:00 - 20:00',
] as const;

/** O que chegou depois do fechamento da última faixa (ou em outro dia). */
export const ROTULO_DEPOIS = 'Depois das 20:00';

/** Índice da faixa «depois das 20:00»: logo após a última da planilha. */
export const FAIXA_DEPOIS = FAIXAS_ELITE.length;

/** Hora de chegada da primeira faixa: o robô das 09:07 fecha a 08:30 - 09:00. */
const HORA_DA_PRIMEIRA = 9;

/**
 * Hora de CHEGADA (0-23, ou 24 = chegou em dia posterior) → índice da faixa.
 *
 * A faixa é a hora que acabou de fechar: chegou às 10h, é de 09:00 - 10:00.
 */
export function faixaDaChegada(hora: number): number {
  if (hora <= HORA_DA_PRIMEIRA) return 0;
  if (hora <= HORA_DA_PRIMEIRA + FAIXAS_ELITE.length - 1) return hora - HORA_DA_PRIMEIRA;
  return FAIXA_DEPOIS;
}

/**
 * Quantas faixas já fecharam — é o divisor da média, como a planilha, que só
 * tem célula preenchida da faixa que já passou.
 *
 * @param data     o dia do quadro (`yyyy-MM-dd`).
 * @param hoje     hoje em São Paulo (`yyyy-MM-dd`).
 * @param horaAgora a hora cheia de agora em São Paulo (0-23).
 */
export function faixasApuradas(data: string, hoje: string, horaAgora: number): number {
  if (data < hoje) return FAIXAS_ELITE.length;
  if (data > hoje) return 0;
  return Math.min(FAIXAS_ELITE.length, Math.max(0, horaAgora - HORA_DA_PRIMEIRA + 1));
}

/** Dia ímpar ou par, pelo dia do mês — a regra da planilha. */
export function plantaoDoDia(data: string): Plantao {
  return Number(data.slice(8, 10)) % 2 === 1 ? 'impar' : 'par';
}

/** `yyyy-MM-dd` deslocado em dias, sem passar pelo fuso da máquina. */
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * O dia de plantão anterior (`passo = -1`) ou seguinte (`+1`).
 *
 * Com `plantao`, pula os dias da outra dupla. A virada de mês pode juntar dois
 * dias ímpares (31 → 1): por isso a busca anda até achar, e não de dois em dois.
 */
export function outroDiaDePlantao(data: string, passo: 1 | -1, plantao: Plantao | null): string {
  let d = somarDias(data, passo);
  if (!plantao) return d;
  for (let i = 0; i < 3 && plantaoDoDia(d) !== plantao; i += 1) d = somarDias(d, passo);
  return d;
}

/** O dia mais recente, até `hoje`, que é do plantão da pessoa. */
export function ultimoDiaDoPlantao(hoje: string, plantao: Plantao): string {
  return plantaoDoDia(hoje) === plantao ? hoje : outroDiaDePlantao(hoje, -1, plantao);
}

/** A hora cheia de agora em São Paulo. */
export function horaAgoraSaoPaulo(agora: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false,
  }).format(agora);
  return Number(h) % 24;
}

// ── Resposta do banco ───────────────────────────────────────────────────────

export interface MembroElite {
  id: string;
  nome: string;
  usuario: string | null;
}

export interface ChegadaElite {
  operador_id: string;
  /** 0-23 no fuso de São Paulo; 24 = chegou em dia posterior. */
  hora: number;
  valor: number;
  qtd: number;
}

export interface RespostaPlantaoElite {
  data: string;
  plantao: Plantao;
  sou_da_dupla: boolean;
  membros: MembroElite[];
  chegadas: ChegadaElite[];
  setor: { id: string; nome: string | null; total: number; qtd: number } | null;
  ultima_chegada: string | null;
}

export async function buscarPlantaoElite(
  empresaId: string,
  data: string,
  plantao?: Plantao | null,
): Promise<RespostaPlantaoElite> {
  // Função nova (20260919100000): os tipos gerados ainda não a conhecem.
  const { data: r, error } = await rpcSemTipo<RespostaPlantaoElite>('fn_elite_plantao_hora', {
    p_empresa_id: empresaId,
    p_data: data,
    p_plantao: plantao ?? null,
  });
  if (error) {
    // O front pode subir antes da migration: diz o que falta, não o erro cru.
    if (/fn_elite_plantao_hora|schema cache|does not exist/i.test(error.message)) {
      throw new Error('O Plantão Elite ainda não está no banco (migration 20260919100000).');
    }
    throw new Error(error.message);
  }
  if (!r) throw new Error('O banco não devolveu o quadro do plantão.');
  return {
    ...r,
    membros:  r.membros ?? [],
    chegadas: (r.chegadas ?? []).map(c => ({ ...c, valor: Number(c.valor) || 0, qtd: Number(c.qtd) || 0 })),
    setor: r.setor ? { ...r.setor, total: Number(r.setor.total) || 0, qtd: Number(r.setor.qtd) || 0 } : null,
  };
}

// ── O quadro ────────────────────────────────────────────────────────────────

export interface LinhaQuadroElite {
  faixa: string;
  /** Recebido na faixa, na ordem de `membros`. */
  valores: number[];
  totalHora: number;
  /** Soma da dupla até esta faixa, inclusive. */
  acumulado: number;
  /** A faixa ainda não fechou: a tela mostra traço, não zero. */
  aberta: boolean;
}

export interface QuadroElite {
  membros: MembroElite[];
  linhas: LinhaQuadroElite[];
  /** O que chegou depois das 20h (ou em outro dia). Nulo quando não há nada. */
  depois: LinhaQuadroElite | null;
  porMembro: { total: number; media: number }[];
  totalPlantao: number;
  apuradas: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

export function montarQuadroElite(
  resposta: Pick<RespostaPlantaoElite, 'membros' | 'chegadas'>,
  apuradas: number,
): QuadroElite {
  const { membros, chegadas } = resposta;
  const coluna = new Map(membros.map((m, i) => [m.id, i]));
  const grade = Array.from({ length: FAIXAS_ELITE.length + 1 }, () => membros.map(() => 0));

  for (const c of chegadas) {
    const i = coluna.get(c.operador_id);
    if (i == null) continue;
    grade[faixaDaChegada(c.hora)][i] += c.valor;
  }

  let acumulado = 0;
  const linha = (faixa: string, valores: number[], aberta: boolean): LinhaQuadroElite => {
    const v = valores.map(centavos);
    const totalHora = centavos(v.reduce((s, x) => s + x, 0));
    acumulado = centavos(acumulado + totalHora);
    return { faixa, valores: v, totalHora, acumulado, aberta };
  };

  const linhas = FAIXAS_ELITE.map((faixa, i) =>
    // Faixa aberta que já recebeu algo (linha corrigida, chegada adiantada)
    // mostra o valor: esconder dinheiro que existe seria pior que o traço.
    linha(faixa, grade[i], i >= apuradas && grade[i].every(v => v === 0)));
  const temDepois = grade[FAIXA_DEPOIS].some(v => v !== 0);
  const depois = temDepois ? linha(ROTULO_DEPOIS, grade[FAIXA_DEPOIS], false) : null;

  const porMembro = membros.map((_, i) => {
    const nasFaixas = grade.slice(0, FAIXAS_ELITE.length).reduce((s, g) => s + g[i], 0);
    const total = centavos(nasFaixas + grade[FAIXA_DEPOIS][i]);
    return { total, media: apuradas > 0 ? centavos(nasFaixas / apuradas) : 0 };
  });

  return {
    membros,
    linhas,
    depois,
    porMembro,
    totalPlantao: centavos(porMembro.reduce((s, m) => s + m.total, 0)),
    apuradas,
  };
}

/** Primeiro nome, como a planilha põe no cabeçalho da coluna. */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
