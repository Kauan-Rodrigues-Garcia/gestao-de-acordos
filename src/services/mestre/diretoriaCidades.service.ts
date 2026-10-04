/**
 * diretoriaCidades.service.ts — a Visão geral do Painel Diretoria por cidade,
 * o resumo de um dia e a carteira Cofen.
 *
 * Três leituras e uma escrita (migrations 20261003170000 e 20261004120000):
 *
 *   fn_mestre_diretoria_cidades   o mês do 59: geral + cada cidade + as carteiras
 *   fn_mestre_diretoria_dia       um dia do 59: total, formas, cada setor/carteira
 *   fn_diretoria_cofen            a carteira Cofen: conciliação + Analítico
 *   fn_mestre_carteira_classificar  cidade e regra de carteira sem setor (super admin)
 *
 * ## Só conta o que tem cidade
 *
 * Cada linha do 59 tem uma carteira, e a carteira tem uma cidade (a do setor
 * vinculado, ou a escolhida no painel). Carteira sem cidade não conta em lugar
 * nenhum, nem no geral; carteira com regra Cofen também não — o dinheiro Cofen
 * vem da conciliação, nunca do 59. As cidades FECHAM o geral. O teste
 * `diretoriaPorCidade.sql.test.ts` amarra isso à Visão geral de sempre.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { espiarDo59, esquecerLeiturasDo59, lerDo59 } from './cache59';
import type { DiaDaSerie, FormaDePagamento } from './diretoria.service';

const n = (v: unknown): number => Number(v) || 0;

export type RegraDaCarteira = 'nosso_produto' | 'cofen';
const regraOuNula = (v: unknown): RegraDaCarteira | null => (v === 'cofen' || v === 'nosso_produto' ? v : null);

/** O mês de um escopo (o geral ou uma cidade). */
export interface MesDoEscopo {
  valor: number;
  /** Pagamentos (linhas do 59). */
  linhas: number;
  operadores: number;
  /** A parte do valor que é colchão — conta no total, em setor nenhum. */
  colchao: number;
  /** O mês anterior até o MESMO dia. */
  valorAnterior: number;
  /** O mês anterior inteiro, e em quantos dias houve recebimento nele. */
  mesAnteriorTotal: number;
  mesAnteriorDias: number;
  serie: DiaDaSerie[];
  formas: FormaDePagamento[];
}

export interface CidadeDoMes extends MesDoEscopo {
  cidadeId: string | null;
  nome: string | null;
}

/** Por que uma carteira do 59 não conta. */
export type MotivoDeNaoContar = 'sem_cidade' | 'setor_sem_cidade' | 'cofen';

export interface CarteiraDaCidade {
  cod: string;
  nome: string;
  valor: number;
  linhas: number;
  operadores: number;
  valorAnterior: number;
  estado: string;
  setorId: string | null;
  setorNome: string | null;
  cidadeId: string | null;
  regra: RegraDaCarteira | null;
  /** Conta no geral e na cidade: tem cidade e é Nosso produto. */
  conta: boolean;
  motivo: MotivoDeNaoContar | null;
}

export interface MesPorCidade {
  mes: string;
  mesAnterior: string;
  diaCorte: number;
  diasNoMes: number;
  temLote: boolean;
  temLoteAnterior: boolean;
  geral: MesDoEscopo;
  cidades: CidadeDoMes[];
  carteiras: CarteiraDaCidade[];
  /** O dinheiro do 59 que ficou fora da conta, no mês até o corte. */
  naoConta: { valor: number; linhas: number };
}

interface EscopoCru {
  valor: unknown; linhas: unknown; operadores: unknown; colchao: unknown;
  valor_anterior: unknown; mes_anterior_total: unknown; mes_anterior_dias: unknown;
  serie: { dia: unknown; valor: unknown; valor_anterior: unknown; dentro_do_corte: boolean }[];
  formas: { forma: string; valor: unknown; qtd: unknown }[];
}

interface MesCru {
  mes: string; mes_anterior: string; dia_corte: unknown; dias_no_mes: unknown;
  tem_lote: boolean; tem_lote_anterior: boolean;
  geral: EscopoCru;
  cidades: (EscopoCru & { cidade_id: string | null; nome: string | null })[];
  carteiras: {
    cod: string; nome: string; valor: unknown; linhas: unknown; operadores: unknown; valor_anterior: unknown;
    estado: string; setor_id: string | null; setor_nome: string | null; cidade_id: string | null; regra: unknown;
    conta?: boolean; motivo?: string | null;
  }[];
  nao_conta?: { valor: unknown; linhas: unknown };
}

const motivoOuNulo = (v: unknown): MotivoDeNaoContar | null =>
  (v === 'sem_cidade' || v === 'setor_sem_cidade' || v === 'cofen' ? v : null);

function escopo(c: EscopoCru): MesDoEscopo {
  return {
    valor: n(c.valor),
    linhas: n(c.linhas),
    operadores: n(c.operadores),
    colchao: n(c.colchao),
    valorAnterior: n(c.valor_anterior),
    mesAnteriorTotal: n(c.mes_anterior_total),
    mesAnteriorDias: n(c.mes_anterior_dias),
    serie: (c.serie ?? []).map(d => ({
      dia: n(d.dia), valor: n(d.valor), valorAnterior: n(d.valor_anterior), dentroDoCorte: d.dentro_do_corte === true,
    })),
    // O mês anterior por forma não vem: a tela mostra o mês, não a variação.
    formas: (c.formas ?? []).map(f => ({ forma: f.forma, valor: n(f.valor), qtd: n(f.qtd), valorAnterior: 0 })),
  };
}

async function buscarMesNoBanco(empresaId: string, mes: string, diaCorte?: number | null): Promise<MesPorCidade> {
  const { data, error } = await rpcSemTipo<MesCru>('fn_mestre_diretoria_cidades', {
    p_empresa_id: empresaId, p_mes: mes, p_dia_corte: diaCorte ?? null,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('A visão por cidade não devolveu resultado.');
  return {
    mes: data.mes,
    mesAnterior: data.mes_anterior,
    diaCorte: n(data.dia_corte),
    diasNoMes: n(data.dias_no_mes),
    temLote: data.tem_lote === true,
    temLoteAnterior: data.tem_lote_anterior === true,
    geral: escopo(data.geral),
    // Sem cidade não conta (20261004120000): não há cartão para ela.
    cidades: (data.cidades ?? []).filter(c => c.cidade_id !== null)
      .map(c => ({ ...escopo(c), cidadeId: c.cidade_id, nome: c.nome })),
    carteiras: (data.carteiras ?? []).map(c => ({
      cod: c.cod, nome: c.nome, valor: n(c.valor), linhas: n(c.linhas), operadores: n(c.operadores),
      valorAnterior: n(c.valor_anterior), estado: c.estado, setorId: c.setor_id, setorNome: c.setor_nome,
      cidadeId: c.cidade_id, regra: regraOuNula(c.regra),
      conta: c.conta !== false, motivo: motivoOuNulo(c.motivo),
    })),
    naoConta: { valor: n(data.nao_conta?.valor), linhas: n(data.nao_conta?.linhas) },
  };
}

/** O mês por cidade. Guardado por alguns minutos, como o resto do 59 (`cache59.ts`). */
export function buscarMesPorCidade(empresaId: string, mes: string, diaCorte?: number | null): Promise<MesPorCidade> {
  return lerDo59(['cidades', empresaId, mes, diaCorte], () => buscarMesNoBanco(empresaId, mes, diaCorte));
}

export function espiarMesPorCidade(empresaId: string, mes: string, diaCorte?: number | null): MesPorCidade | undefined {
  return espiarDo59(['cidades', empresaId, mes, diaCorte]);
}

// ── O dia ───────────────────────────────────────────────────────────────────

/** `geral`, `sem_cidade` ou o id da cidade. */
export type EscopoDoDia = 'geral' | 'sem_cidade' | string;

export interface UnidadeDoDia {
  /** Setor, carteira sem setor, ou carteira que conta só no total. */
  tipo: 'setor' | 'sem_setor' | 'somente_geral';
  setorId: string | null;
  cod: string | null;
  nome: string;
  cidadeId: string | null;
  regra: RegraDaCarteira | null;
  valor: number;
  linhas: number;
  operadores: number;
  /** Média por dia com recebimento, no mês até o corte. */
  media: number;
  destaque: { nome: string; valor: number } | null;
}

export interface ResumoDoDia {
  mes: string;
  dia: number;
  escopo: EscopoDoDia;
  total: { valor: number; linhas: number; operadores: number; colchao: number };
  mesmoDiaAnterior: number;
  mediaDiaAnterior: number;
  formas: FormaDePagamento[];
  unidades: UnidadeDoDia[];
}

interface DiaCru {
  mes: string; dia: unknown; escopo: string;
  total: { valor: unknown; linhas: unknown; operadores: unknown; colchao: unknown };
  mesmo_dia_anterior: unknown; media_dia_anterior: unknown;
  formas: { forma: string; valor: unknown; qtd: unknown }[];
  unidades: {
    tipo: string; setor_id: string | null; cod: string | null; nome: string | null; cidade_id: string | null;
    regra: unknown; valor: unknown; linhas: unknown; operadores: unknown; media: unknown;
    destaque: { nome: string; valor: unknown } | null;
  }[];
}

const tipoDaUnidade = (t: string): UnidadeDoDia['tipo'] =>
  t === 'setor' || t === 'somente_geral' ? t : 'sem_setor';

async function buscarDiaNoBanco(
  empresaId: string, mes: string, dia: number, escopoDoDia: EscopoDoDia, diaCorte?: number | null,
): Promise<ResumoDoDia> {
  const { data, error } = await rpcSemTipo<DiaCru>('fn_mestre_diretoria_dia', {
    p_empresa_id: empresaId, p_mes: mes, p_dia: dia, p_escopo: escopoDoDia, p_dia_corte: diaCorte ?? null,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('O resumo do dia não devolveu resultado.');
  return {
    mes: data.mes,
    dia: n(data.dia),
    escopo: data.escopo,
    total: { valor: n(data.total?.valor), linhas: n(data.total?.linhas), operadores: n(data.total?.operadores), colchao: n(data.total?.colchao) },
    mesmoDiaAnterior: n(data.mesmo_dia_anterior),
    mediaDiaAnterior: n(data.media_dia_anterior),
    formas: (data.formas ?? []).map(f => ({ forma: f.forma, valor: n(f.valor), qtd: n(f.qtd), valorAnterior: 0 })),
    unidades: (data.unidades ?? []).map(u => ({
      tipo: tipoDaUnidade(u.tipo), setorId: u.setor_id, cod: u.cod, nome: u.nome ?? u.cod ?? '—',
      cidadeId: u.cidade_id, regra: regraOuNula(u.regra), valor: n(u.valor), linhas: n(u.linhas),
      operadores: n(u.operadores), media: n(u.media),
      destaque: u.destaque ? { nome: u.destaque.nome, valor: n(u.destaque.valor) } : null,
    })),
  };
}

export function buscarResumoDoDia(
  empresaId: string, mes: string, dia: number, escopoDoDia: EscopoDoDia, diaCorte?: number | null,
): Promise<ResumoDoDia> {
  return lerDo59(['dia', empresaId, mes, dia, escopoDoDia, diaCorte],
    () => buscarDiaNoBanco(empresaId, mes, dia, escopoDoDia, diaCorte));
}

export function espiarResumoDoDia(
  empresaId: string, mes: string, dia: number, escopoDoDia: EscopoDoDia, diaCorte?: number | null,
): ResumoDoDia | undefined {
  return espiarDo59(['dia', empresaId, mes, dia, escopoDoDia, diaCorte]);
}

// ── A carteira Cofen ────────────────────────────────────────────────────────
//
// O dinheiro Cofen não vem do 59: o total é o do relatório de conciliação da
// PaguePlay (o card do Conecta Play no Painel Líder) e os operadores são os do
// Analítico. O banco devolve bruto e H.O. lado a lado; quem escolhe qual
// mostrar é a tela (o disjuntor H.O. ⇄ bruto).

/** Bruto e H.O. de um mesmo recorte. */
export interface ValorCofen { bruto: number; ho: number }

export interface DiaCofen extends ValorCofen {
  dia: number;
  dentroDoCorte: boolean;
  coren: number;
  cofen: number;
  quantidade: number;
  brutoAnterior: number;
  hoAnterior: number;
  /** Operadores do Analítico com recebimento no dia. */
  operadores: number;
  destaque: ({ nome: string } & ValorCofen) | null;
}

export interface FormaCofen extends ValorCofen { forma: string; qtd: number }

export interface OperadorCofen extends ValorCofen { operadorId: string; nome: string; pagamentos: number }

export interface CofenDoMes {
  disponivel: boolean;
  /** O que a tela precisa dizer: setor sem cidade, mais de um setor Cofen... */
  aviso: string | null;
  setorId: string | null;
  nome: string;
  /** A cidade do setor Cofen (da empresa dele) — a tela casa pelo nome. */
  cidadeId: string | null;
  cidadeNome: string | null;
  /** Conta no geral e na cidade: o setor tem cidade. */
  conta: boolean;
  diaCorte: number;
  diasNoMes: number;
  /** A meta do setor no mês, em BRUTO (aba Metas da PaguePlay). `null` sem meta. */
  meta: number | null;
  mes: ValorCofen & { coren: number; cofen: number; quantidade: number };
  anterior: { brutoAteCorte: number; hoAteCorte: number; brutoMes: number; hoMes: number; dias: number };
  serie: DiaCofen[];
  formas: FormaCofen[];
  formasDia: (FormaCofen & { dia: number })[];
  operadores: { quantidade: number; lista: OperadorCofen[] };
}

interface CofenCru {
  disponivel: boolean; aviso: string | null;
  setor_id?: string; nome?: string; cidade_id?: string | null; cidade_nome?: string | null; conta?: boolean;
  dia_corte: unknown; dias_no_mes: unknown; meta?: unknown;
  mes?: { bruto: unknown; ho: unknown; coren: unknown; cofen: unknown; quantidade: unknown };
  anterior?: { bruto_ate_corte: unknown; ho_ate_corte: unknown; bruto_mes: unknown; ho_mes: unknown; dias: unknown };
  serie?: {
    dia: unknown; dentro_do_corte: boolean; bruto: unknown; ho: unknown; coren: unknown; cofen: unknown;
    quantidade: unknown; bruto_anterior: unknown; ho_anterior: unknown; operadores: unknown;
    destaque: { nome: string; bruto: unknown; ho: unknown } | null;
  }[];
  formas?: { forma: string; bruto: unknown; ho: unknown; qtd: unknown }[];
  formas_dia?: { dia: unknown; forma: string; bruto: unknown; ho: unknown; qtd: unknown }[];
  operadores?: { quantidade: unknown; lista: { operador_id: string; nome: string | null; bruto: unknown; ho: unknown; pagamentos: unknown }[] };
}

async function buscarCofenNoBanco(empresaId: string, mes: string, diaCorte?: number | null): Promise<CofenDoMes> {
  const { data: c, error } = await rpcSemTipo<CofenCru>('fn_diretoria_cofen', {
    p_empresa_id: empresaId, p_mes: mes, p_dia_corte: diaCorte ?? null,
  });
  if (error) throw new Error(error.message);
  if (!c) throw new Error('A carteira Cofen não devolveu resultado.');
  return {
    disponivel: c.disponivel === true,
    aviso: c.aviso ?? null,
    setorId: c.setor_id ?? null,
    nome: c.nome ?? 'Cofen',
    cidadeId: c.cidade_id ?? null,
    cidadeNome: c.cidade_nome ?? null,
    conta: c.disponivel === true && c.conta === true,
    diaCorte: n(c.dia_corte),
    diasNoMes: n(c.dias_no_mes),
    meta: n(c.meta) > 0 ? n(c.meta) : null,
    mes: {
      bruto: n(c.mes?.bruto), ho: n(c.mes?.ho), coren: n(c.mes?.coren), cofen: n(c.mes?.cofen),
      quantidade: n(c.mes?.quantidade),
    },
    anterior: {
      brutoAteCorte: n(c.anterior?.bruto_ate_corte), hoAteCorte: n(c.anterior?.ho_ate_corte),
      brutoMes: n(c.anterior?.bruto_mes), hoMes: n(c.anterior?.ho_mes), dias: n(c.anterior?.dias),
    },
    serie: (c.serie ?? []).map(d => ({
      dia: n(d.dia), dentroDoCorte: d.dentro_do_corte === true,
      bruto: n(d.bruto), ho: n(d.ho), coren: n(d.coren), cofen: n(d.cofen), quantidade: n(d.quantidade),
      brutoAnterior: n(d.bruto_anterior), hoAnterior: n(d.ho_anterior), operadores: n(d.operadores),
      destaque: d.destaque ? { nome: d.destaque.nome, bruto: n(d.destaque.bruto), ho: n(d.destaque.ho) } : null,
    })),
    formas: (c.formas ?? []).map(f => ({ forma: f.forma, bruto: n(f.bruto), ho: n(f.ho), qtd: n(f.qtd) })),
    formasDia: (c.formas_dia ?? []).map(f => ({ dia: n(f.dia), forma: f.forma, bruto: n(f.bruto), ho: n(f.ho), qtd: n(f.qtd) })),
    operadores: {
      quantidade: n(c.operadores?.quantidade),
      lista: (c.operadores?.lista ?? []).map(o => ({
        operadorId: o.operador_id, nome: o.nome ?? 'Operador', bruto: n(o.bruto), ho: n(o.ho), pagamentos: n(o.pagamentos),
      })),
    },
  };
}

/** A carteira Cofen do mês. Guardada junto com as leituras do 59. */
export function buscarCofenDoMes(empresaId: string, mes: string, diaCorte?: number | null): Promise<CofenDoMes> {
  return lerDo59(['cofen', empresaId, mes, diaCorte], () => buscarCofenNoBanco(empresaId, mes, diaCorte));
}

export function espiarCofenDoMes(empresaId: string, mes: string, diaCorte?: number | null): CofenDoMes | undefined {
  return espiarDo59(['cofen', empresaId, mes, diaCorte]);
}

// ── Classificar carteira sem setor ──────────────────────────────────────────

/**
 * Grava cidade e regra de uma carteira SEM setor. Só o super admin
 * (20261004120000); o banco recusa os outros e a carteira vinculada. Depois de
 * gravar, as leituras guardadas do 59 caem: o dinheiro mudou de cartão.
 */
export async function classificarCarteira(
  empresaId: string, cod: string, cidadeId: string | null, regra: RegraDaCarteira | null,
): Promise<void> {
  const { error } = await rpcSemTipo<null>('fn_mestre_carteira_classificar', {
    p_empresa_id: empresaId, p_cod: cod, p_cidade_id: cidadeId, p_regra: regra,
  });
  if (error) throw new Error(error.message);
  esquecerLeiturasDo59();
}
