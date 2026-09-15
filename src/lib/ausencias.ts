/**
 * ausencias.ts — os tipos de ausência e as contas de período, sem rede.
 *
 * ## De onde veio a lista
 *
 * Da `Planilha De Feedback.xlsx`, onde o motivo de a pessoa não estar morava
 * dentro da célula da contagem de vendas. Medido nas oito abas mensais:
 *
 *     INSS 259 · FÉRIAS/FERIAS 193 · ATESTADO 117 · FALTA 32 · ABONO 25
 *     BANCO/BANCO DE HORAS 22 · CASAMENTO 3 · DECLARAÇÃO 3 · SUSPENSAÇÃO 1
 *
 * `CASAMENTO` virou `licenca` (vale também para luto e maternidade). FERIADO
 * ficou de fora — é do calendário, não da pessoa — e SAIU, TRANSFERIDO e
 * REMANEJADA também: são movimentação de cadastro, não falta ao trabalho.
 *
 * ## Esta lista existe duas vezes, e um teste as compara
 *
 * O banco guarda os tipos em `ausencias_tipos` (migration 20260915220000),
 * porque a meta proporcional vai juntar `abate_meta` numa consulta. A tela
 * precisa do rótulo sem ir ao banco. `ausencias.test.ts` lê o INSERT da
 * migration e falha se as duas divergirem — que é como a tela passaria a
 * oferecer um tipo que o banco recusa.
 *
 * ## As contas repetem as travas do banco, e não as substituem
 *
 * `validarAusencia` e `primeiraSobreposta` existem para avisar ANTES de mandar.
 * Quem recusa de verdade é `fn_ausencia_salvar` — a tela pode estar com a lista
 * velha, e outra pessoa pode ter lançado no meio tempo.
 */

export type TipoAusencia =
  | 'ferias' | 'atestado' | 'inss' | 'banco_de_horas' | 'abono'
  | 'declaracao' | 'licenca' | 'falta' | 'suspensao' | 'outros';

export interface MetaTipoAusencia {
  tipo: TipoAusencia;
  rotulo: string;
  /**
   * Se desconta da meta proporcional quando essa ligação existir.
   *
   * ⚠️ Leitura a confirmar com a operação: desconta o que a pessoa não escolheu
   * ou a empresa concedeu; falta, suspensão e «outros» não — descontar falta
   * seria premiar a falta.
   */
  abateMeta: boolean;
}

/** Na ordem de `ausencias_tipos.ordem`. */
export const TIPOS_AUSENCIA: readonly MetaTipoAusencia[] = [
  { tipo: 'ferias',         rotulo: 'Férias',         abateMeta: true },
  { tipo: 'atestado',       rotulo: 'Atestado',       abateMeta: true },
  { tipo: 'inss',           rotulo: 'INSS',           abateMeta: true },
  { tipo: 'banco_de_horas', rotulo: 'Banco de horas', abateMeta: true },
  { tipo: 'abono',          rotulo: 'Abono',          abateMeta: true },
  { tipo: 'declaracao',     rotulo: 'Declaração',     abateMeta: true },
  { tipo: 'licenca',        rotulo: 'Licença',        abateMeta: true },
  { tipo: 'falta',          rotulo: 'Falta',          abateMeta: false },
  { tipo: 'suspensao',      rotulo: 'Suspensão',      abateMeta: false },
  { tipo: 'outros',         rotulo: 'Outros',         abateMeta: false },
] as const;

const POR_TIPO: Record<string, MetaTipoAusencia> =
  Object.fromEntries(TIPOS_AUSENCIA.map(t => [t.tipo, t]));

export function ehTipoAusencia(v: unknown): v is TipoAusencia {
  return typeof v === 'string' && v in POR_TIPO;
}

/** O rótulo, ou o próprio código quando o banco trouxer um tipo que a tela não conhece. */
export function rotuloDoTipo(tipo: string): string {
  return POR_TIPO[tipo]?.rotulo ?? tipo;
}

/** O período como o banco o guarda. Datas `yyyy-MM-dd`, os dois dias inclusive. */
export interface PeriodoAusencia {
  id?: string;
  tipo: string;
  inicio: string;
  fim: string;
  meio_periodo: boolean;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function paraDia(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86_400_000);
}

/**
 * Quantos dias a ausência cobre, contando os dois extremos. Meio período vale
 * meio dia.
 *
 * Dias CORRIDOS, e não úteis: INSS de 30 dias é de 30 dias. Descontar só os
 * úteis é pergunta da meta proporcional, que conhece o calendário.
 */
export function diasDaAusencia(a: Pick<PeriodoAusencia, 'inicio' | 'fim' | 'meio_periodo'>): number {
  if (!ISO.test(a.inicio) || !ISO.test(a.fim)) return 0;
  const dias = paraDia(a.fim) - paraDia(a.inicio) + 1;
  if (dias <= 0) return 0;
  return a.meio_periodo && dias === 1 ? 0.5 : dias;
}

/**
 * Quantos dias da ausência caem dentro de `[de, ate]`.
 *
 * É o que responde «esteve fora quantos dias em setembro?» quando o INSS
 * começou em agosto e termina em outubro.
 */
export function diasNoRecorte(
  a: Pick<PeriodoAusencia, 'inicio' | 'fim' | 'meio_periodo'>,
  de: string,
  ate: string,
): number {
  if (![a.inicio, a.fim, de, ate].every(d => ISO.test(d))) return 0;
  const ini = Math.max(paraDia(a.inicio), paraDia(de));
  const fim = Math.min(paraDia(a.fim), paraDia(ate));
  if (fim < ini) return 0;
  const dias = fim - ini + 1;
  return a.meio_periodo && dias === 1 ? 0.5 : dias;
}

export type EstadoDaAusencia = 'em_curso' | 'futura' | 'encerrada';

export function estadoDaAusencia(a: Pick<PeriodoAusencia, 'inicio' | 'fim'>, hoje: string): EstadoDaAusencia {
  if (a.fim < hoje) return 'encerrada';
  if (a.inicio > hoje) return 'futura';
  return 'em_curso';
}

/**
 * A primeira ausência da lista que divide pelo menos um dia com a candidata.
 *
 * Mesma regra de `fn_ausencia_salvar`: dois períodos cobrindo o mesmo dia
 * contariam esse dia duas vezes na meta. `ignorarId` é a própria linha, quando
 * se está corrigindo.
 */
export function primeiraSobreposta<T extends PeriodoAusencia>(
  existentes: readonly T[],
  candidata: Pick<PeriodoAusencia, 'inicio' | 'fim'>,
  ignorarId?: string | null,
): T | null {
  const choques = existentes
    .filter(e => e.id !== ignorarId && e.inicio <= candidata.fim && e.fim >= candidata.inicio)
    .sort((x, y) => x.inicio.localeCompare(y.inicio));
  return choques[0] ?? null;
}

export interface RascunhoAusencia {
  tipo: string;
  inicio: string;
  fim: string;
  meio_periodo: boolean;
  observacao: string;
}

/**
 * O que está errado no formulário, na mesma frase que o banco usaria — ou
 * `null` quando dá para mandar.
 */
export function validarAusencia(r: RascunhoAusencia): string | null {
  if (!ehTipoAusencia(r.tipo)) return 'Escolha o tipo da ausência.';
  if (!ISO.test(r.inicio) || !ISO.test(r.fim)) return 'Informe o primeiro e o último dia da ausência.';
  if (r.fim < r.inicio) return 'O último dia é anterior ao primeiro.';
  if (r.meio_periodo && r.inicio !== r.fim) return 'Meio período vale para um dia só.';
  if (r.tipo === 'outros' && r.observacao.trim() === '') return 'Em «Outros», diga o motivo na observação.';
  return null;
}

function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * «12/09», «12/09 a 20/09» ou, atravessando o ano, «28/12/2026 a 05/01/2027».
 * O ano só aparece quando muda — na lista de uma pessoa, repeti-lo em toda
 * linha seria ruído.
 */
export function rotuloDoPeriodo(a: Pick<PeriodoAusencia, 'inicio' | 'fim' | 'meio_periodo'>): string {
  if (a.inicio === a.fim) {
    return diaMes(a.inicio) + (a.meio_periodo ? ' (meio período)' : '');
  }
  if (a.inicio.slice(0, 4) !== a.fim.slice(0, 4)) {
    const br = (iso: string) => `${diaMes(iso)}/${iso.slice(0, 4)}`;
    return `${br(a.inicio)} a ${br(a.fim)}`;
  }
  return `${diaMes(a.inicio)} a ${diaMes(a.fim)}`;
}
