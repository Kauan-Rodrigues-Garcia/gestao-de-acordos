/**
 * As contas do Desafio do Vale — puras, sem banco (23/11/2026).
 *
 *   • 9 médias: o operador que fizer `medias` × a média diária DELE nos dias
 *     do desafio ganha o vale. A média é a do Desafio Cobrança: meta do mês ÷
 *     dias úteis da pessoa no mês (`metaDoOperadorNoDesafio`).
 *   • O VALOR do vale vem da faixa em que o SETOR dele fecha o mês: ≥ 100% =
 *     R$ 120; ≥ 90% = R$ 100; abaixo = R$ 80 (configurável em `faixas`).
 *   • Cupons do Pix: a cada `cupom_pix` Pix APROVADOS registrados no período,
 *     1 cupom. Pendente ainda não conta (é o «cobre o seu líder»);
 *     desaprovado não existe.
 */
import { diasUteisDecorridos, diasUteisDoMes, listarDiasUteisIntervalo } from '@/lib/diasUteis';
import { dataLocalPix } from '@/lib/mesPix';
import { metaDoOperadorNoDesafio, diasUteisDoMesDoDesafio, type MetaDoOperador } from '@/lib/desafioMediaOperador';
import type { DesafioVale, FaixaVale, PixDoCupom, SetorNoVale } from './desafioVale.service';

// ── O período ────────────────────────────────────────────────────────────────

/** Todos os dias de `inicio` a `fim`, inclusive (ISO). Fim de semana entra: pagamento de sábado conta. */
export function diasDoPeriodo(inicio: string, fim: string): string[] {
  const a = Date.parse(`${inicio}T12:00:00Z`);
  const b = Date.parse(`${fim}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a || b - a > 62 * 86_400_000) return [];
  const dias: string[] = [];
  for (let t = a; t <= b; t += 86_400_000) dias.push(new Date(t).toISOString().slice(0, 10));
  return dias;
}

export type Fase = 'antes' | 'durante' | 'depois';

export function faseDoPeriodo(inicio: string, fim: string, hoje: string): Fase {
  if (hoje < inicio) return 'antes';
  if (hoje > fim) return 'depois';
  return 'durante';
}

// ── As faixas do vale ────────────────────────────────────────────────────────

/** Do maior % para o menor. */
export function faixasOrdenadas(faixas: readonly FaixaVale[]): FaixaVale[] {
  return [...faixas].sort((a, b) => b.pct - a.pct);
}

/** O % do setor, cortado (99,62% é 99%, não 100%) — a régua do app inteiro. */
export const pctCortado = (pct: number) => Math.floor(pct + 1e-9);

/**
 * A faixa em que o setor está. `null` = setor sem % (sem meta, ou Cofen sem o
 * fechamento digitado) — aí só a faixa mais baixa é garantida.
 */
export function faixaDoSetor(pct: number | null, faixas: readonly FaixaVale[]): FaixaVale | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  const p = pctCortado(pct);
  return faixasOrdenadas(faixas).find(f => p >= f.pct) ?? null;
}

/** A faixa acima da atual (para o «faltam X% para R$ 120»). */
export function proximaFaixa(pct: number | null, faixas: readonly FaixaVale[]): FaixaVale | null {
  const ord = faixasOrdenadas(faixas);
  const atual = faixaDoSetor(pct, faixas);
  if (!atual) return ord.length > 1 ? ord[ord.length - 2] : null;
  const i = ord.indexOf(atual);
  return i > 0 ? ord[i - 1] : null;
}

/** A faixa mais baixa: o que quem bate as médias leva no mínimo. */
export function faixaPiso(faixas: readonly FaixaVale[]): FaixaVale | null {
  const ord = faixasOrdenadas(faixas);
  return ord[ord.length - 1] ?? null;
}

/** «100% ou mais», «de 90% a 99%», «abaixo de 90%». */
export function textoDaFaixa(f: FaixaVale, faixas: readonly FaixaVale[]): string {
  const ord = faixasOrdenadas(faixas);
  const i = ord.indexOf(f);
  const acima = i > 0 ? ord[i - 1] : null;
  if (!acima) return `${f.pct}% ou mais`;
  if (f.pct <= 0) return `abaixo de ${acima.pct}%`;
  return `de ${f.pct}% a ${acima.pct - 1}%`;
}

/** Quanto falta para o setor chegar a `alvoPct` da meta. `null` sem meta. */
export function faltaParaOPct(recebido: number | null, meta: number | null, alvoPct: number): number | null {
  if (!meta || meta <= 0) return null;
  return Math.max(0, Math.round((meta * alvoPct / 100 - (recebido ?? 0)) * 100) / 100);
}

// ── As 9 médias de uma pessoa ───────────────────────────────────────────────

export interface MetaNoVale extends MetaDoOperador {
  metaMensal: number;
  diasUteisMes: number;
  recebidoPorDia: number[];
  /** Dias úteis da pessoa de hoje (inclusive) até o fim. */
  diasUteisRestantes: number;
  /** Quanto precisa por dia útil até o fim. `null` sem média, batido ou acabou. */
  porDiaUtil: number | null;
}

export function metaNoVale(
  regras: Pick<DesafioVale, 'inicio' | 'fim' | 'medias'>,
  metaMensal: number,
  recebidoPorDiaDoMes: Readonly<Record<string, number>>,
  feriados: string[],
  hoje: string,
): MetaNoVale {
  const dias = diasDoPeriodo(regras.inicio, regras.fim);
  const recebidoPorDia = dias.map(d => recebidoPorDiaDoMes[d] ?? 0);
  // A média é da meta do mês do FIM (o mês que fecha), com a régua da pessoa.
  const diasUteisMes = diasUteisDoMesDoDesafio(regras.fim, feriados);
  const iHoje = Math.max(0, dias.indexOf(hoje) >= 0 ? dias.indexOf(hoje) : hoje < regras.inicio ? 0 : dias.length);
  const base = metaDoOperadorNoDesafio({
    metaMensal, diasUteisMes, recebidoNoDesafio: recebidoPorDia, hoje: iHoje, fator: regras.medias,
  });
  const desde = hoje > regras.inicio ? hoje : regras.inicio;
  const diasUteisRestantes = desde > regras.fim ? 0 : listarDiasUteisIntervalo(desde, regras.fim, feriados).length;
  return {
    ...base,
    metaMensal: Math.max(0, Number(metaMensal) || 0),
    diasUteisMes,
    recebidoPorDia,
    diasUteisRestantes,
    porDiaUtil: base.falta !== null && base.falta > 0 && diasUteisRestantes > 0 ? base.falta / diasUteisRestantes : null,
  };
}

// ── Cupons do Pix ────────────────────────────────────────────────────────────

/** O Pix foi registrado no período dos cupons (dia de São Paulo). */
export function pixNoPeriodoDoCupom(
  criadoEm: string, d: Pick<DesafioVale, 'cupom_ativo' | 'cupom_inicio' | 'cupom_fim'> | null | undefined,
): boolean {
  if (!d?.cupom_ativo || !d.cupom_inicio || !d.cupom_fim) return false;
  const dia = dataLocalPix(criadoEm);
  return dia >= d.cupom_inicio && dia <= d.cupom_fim;
}

export interface CuponsDoPix {
  aprovados: number;
  pendentes: number;
  desaprovados: number;
  cupons: number;
  /** Aprovados que sobraram para o próximo cupom (0 a porCupom − 1). */
  sobra: number;
  /** Quantos Pix aprovados faltam para o próximo cupom. */
  faltamParaOProximo: number;
  /** Cupons que viriam se todos os pendentes fossem aprovados. */
  cuponsSeAprovar: number;
}

export function contarCupons(linhas: readonly Pick<PixDoCupom, 'status'>[], porCupom: number): CuponsDoPix {
  const k = Math.max(1, Math.floor(porCupom) || 1);
  let aprovados = 0, pendentes = 0, desaprovados = 0;
  for (const l of linhas) {
    if (l.status === 'aprovado') aprovados++;
    else if (l.status === 'pendente') pendentes++;
    else desaprovados++;
  }
  const cupons = Math.floor(aprovados / k);
  const sobra = aprovados % k;
  return {
    aprovados, pendentes, desaprovados, cupons, sobra,
    faltamParaOProximo: k - sobra,
    cuponsSeAprovar: Math.floor((aprovados + pendentes) / k),
  };
}

/** Os Pix do período, por operador. */
export function cuponsPorOperador(linhas: readonly PixDoCupom[], porCupom: number): Map<string, CuponsDoPix> {
  const grupos = new Map<string, PixDoCupom[]>();
  for (const l of linhas) {
    const lista = grupos.get(l.operador_id) ?? [];
    lista.push(l);
    grupos.set(l.operador_id, lista);
  }
  return new Map([...grupos].map(([id, ls]) => [id, contarCupons(ls, porCupom)]));
}

// ── Formatos ─────────────────────────────────────────────────────────────────

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: v % 1 ? 2 : 0 });
export const cupons = (q: number) => `${q} ${q === 1 ? 'cupom' : 'cupons'}`;
export const pixes = (q: number) => `${q} Pix`;
/** «23/11 a 30/11». */
export const periodo = (inicio: string, fim: string) => `${inicio.slice(8, 10)}/${inicio.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)}`;

/**
 * As casas do PRÓXIMO cupom, para o bilhete «em construção» (23/11/2026):
 * as primeiras são os aprovados que sobraram; depois, os pendentes que
 * cabem nele (viram cupom quando o líder aprovar); o resto, o que falta.
 */
export type CasaDoCupom = 'ok' | 'espera' | 'falta';

export function casasDoProximoCupom(c: Pick<CuponsDoPix, 'sobra' | 'pendentes'>, porCupom: number): CasaDoCupom[] {
  const k = Math.max(1, Math.floor(porCupom) || 1);
  const espera = Math.min(c.pendentes, k - c.sobra);
  return Array.from({ length: k }, (_, i) => (i < c.sobra ? 'ok' : i < c.sobra + espera ? 'espera' : 'falta'));
}

/** O que os primeiros do ranking ganham: o hot dog, se o texto do cupom não disser outra coisa. */
export function premioDoRanking(d: Pick<DesafioVale, 'cupom_premio'>): { hotDog: boolean; texto: string } {
  const hotDog = !d.cupom_premio || /hot ?dog/i.test(d.cupom_premio);
  return { hotDog, texto: hotDog ? 'ganham o hot dog' : 'ganham o prêmio' };
}

/** A regra da 2ª parte no setor: 'pix' (cupons) ou 'ranking' (os N que mais recebem). */
export const regraDoSetor = (s: { cupom_regra?: 'pix' | 'ranking' } | null | undefined): 'pix' | 'ranking' =>
  s?.cupom_regra === 'ranking' ? 'ranking' : 'pix';

// ── A projeção do setor (23/11/2026) ─────────────────────────────────────────

/** A régua de dias úteis do setor no mês (`diasUteisDoSetor`). */
export interface ReguaDoSetor { feriados: string[]; contarDiaAtual: boolean }

/**
 * Onde o setor FECHA o mês no ritmo de hoje — a mesma conta do Painel
 * (`calcularProjecao`): recebido ÷ (meta ÷ dias úteis do mês × dias úteis já
 * passados) × 100, sem arredondar (quem corta é `faixaDoSetor`). Passado o
 * mês, os dias passados são todos, e a projeção é o realizado.
 * `null` sem meta.
 */
export function pctProjetado(
  recebido: number | null, meta: number | null, regua: ReguaDoSetor, fimISO: string, hojeISO: string,
): number | null {
  if (!meta || meta <= 0) return null;
  const [ano, mes] = fimISO.split('-').map(Number);
  const total = diasUteisDoMes(ano, mes, regua.feriados);
  if (total <= 0) return null;
  const passados = Math.max(1, diasUteisDecorridos(ano, mes, regua.feriados, hojeISO, undefined, regua.contarDiaAtual));
  const esperado = (meta / total) * Math.min(passados, total);
  return Math.round(((recebido ?? 0) / esperado) * 100 * 100) / 100;
}

/**
 * O % que vale para o vale, por setor: o manual (fechamento oficial) ganha;
 * com o fechamento confirmado, o realizado; durante o mês, a PROJEÇÃO — é
 * onde o setor vai fechar, e é isso que decide o vale (pedido do usuário,
 * 23/11). `pct_realizado` guarda o realizado para a tela mostrar os dois.
 */
export function comProjecao<S extends SetorNoVale>(
  s: S, regua: ReguaDoSetor, fimISO: string, hojeISO: string, fechado: boolean,
): S {
  const realizado = s.pct_auto;
  if (s.origem === 'manual' || fechado) return { ...s, pct_realizado: realizado };
  const proj = s.regra === 'cofen' ? null : pctProjetado(s.recebido, s.meta, regua, fimISO, hojeISO);
  if (proj === null) return { ...s, pct_realizado: realizado };
  return { ...s, pct: proj, origem: 'projecao', pct_realizado: realizado };
}
