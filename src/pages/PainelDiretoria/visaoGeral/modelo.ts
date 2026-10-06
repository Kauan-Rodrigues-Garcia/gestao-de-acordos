/**
 * modelo.ts — o que cada cartão da Visão geral mostra, montado sem React.
 *
 * «Regra de negócio diferente é carteira diferente» (Cleber, 04/10/2026). O
 * dinheiro tem duas carteiras, de duas fontes que não se misturam:
 *
 *   - NOSSO PRODUTO: o 59 (`fn_mestre_diretoria_cidades`), pela cidade da
 *     CARTEIRA — só carteira com cidade e regra Nosso produto conta. Os
 *     SETORES de cada cidade vêm da grade da aba «Setores e equipes».
 *   - COFEN: o relatório de conciliação da PaguePlay e os operadores do
 *     Analítico (`fn_diretoria_cofen`). Entra na cidade do setor Cofen.
 *
 * O Cofen aparece em H.O. (o que fica com a operação) ou em bruto — o
 * disjuntor da tela escolhe, e TODO número que tem Cofen dentro troca junto.
 *
 * A soma dos setores não é o valor da cidade, e não tem de ser: o colchão e o
 * que «conta só no total» não são de setor nenhum, e o Integral conta em dois.
 */
import { marcaDaCidade } from '@/lib/marca';
import type { UnidadeValor } from '@/lib/unidadeValor';
import type { DiaDaSerie, FormaDePagamento } from '@/services/mestre/diretoria.service';
import type { GradeDeSetores, SetorDoPainel } from '@/services/mestre/diretoriaSetores.service';
import type {
  CarteiraDaCidade, CofenDoMes, MesDoEscopo, MesPorCidade, RegraDaCarteira, UnidadeDoDia, ValorCofen,
} from '@/services/mestre/diretoriaCidades.service';

/** BookPlay (Birigui), PaguePlay (Marília) ou cidade sem marca. */
export type MarcaVisual = 'bp' | 'pp' | 'neutra';

/** Como o Cofen aparece: H.O. (padrão) ou bruto. */
export type ModoCofen = UnidadeValor;

export interface InfoDoSetor {
  id: string;
  nome: string;
  cidadeId: string | null;
  regra: RegraDaCarteira | null;
  alternativo?: boolean;
}

export interface SetorDaCidade {
  setorId: string;
  nome: string;
  valor: number;
  valorAnterior: number;
  temAnterior: boolean;
  operadores: number;
  linhas: number;
  /**
   * Setor alternativo (Marília Digital, Treinamento...): soma pela GENTE dele,
   * espelhando dinheiro que outro setor da cidade já cobrou. Aparece no placar
   * e NUNCA entra em soma de cidade ou do geral (`fn_mestre_diretoria_alternativos`).
   */
  alternativo: boolean;
}

/** A carteira Cofen de um escopo, já no modo escolhido. */
export interface ParteCofen {
  setorId: string | null;
  nome: string;
  /** O número da carteira no modo (H.O. ou bruto). */
  valor: number;
  bruto: number;
  ho: number;
  coren: number;
  cofen: number;
  quantidade: number;
  operadores: number;
  /** O mês anterior até o mesmo dia, no modo. */
  valorAnterior: number;
}

/** Um escopo (o geral ou uma cidade): Nosso produto + Cofen, no modo. */
export interface EscopoDaVisao extends MesDoEscopo {
  nossoProduto: number;
  cofen: ParteCofen | null;
}

export interface CidadeDaVisao {
  /** O id da cidade: é o escopo do resumo do dia. */
  chave: string;
  cidadeId: string | null;
  nome: string;
  marca: MarcaVisual;
  /** «BookPlay» / «PaguePlay», quando a cidade tem marca. */
  rotuloMarca: string | null;
  mes: EscopoDaVisao;
  /** Fração do geral (0 a 1). */
  participacao: number;
  setores: SetorDaCidade[];
  /** Carteiras do 59 sem setor que contam nesta cidade (escolha do painel). */
  carteirasSemSetor: CarteiraDaCidade[];
  melhorSetor: SetorDaCidade | null;
  cofen: ParteCofen | null;
}

/** Uma fatia da barra do geral: de qual carteira vem o dinheiro. */
export interface ParteDoGeral {
  chave: 'nosso_produto' | 'cofen';
  nome: string;
  valor: number;
}

export interface VisaoMontada {
  geral: EscopoDaVisao;
  cidades: CidadeDaVisao[];
  carteiras: ParteDoGeral[];
}

export function variacaoPct(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export const noModo = (v: ValorCofen, modo: ModoCofen): number => (modo === 'ho' ? v.ho : v.bruto);

function marcaVisual(nome: string | null): { marca: MarcaVisual; rotulo: string | null } {
  const m = marcaDaCidade(nome);
  if (!m) return { marca: 'neutra', rotulo: null };
  return { marca: m.nome === 'BookPlay' ? 'bp' : 'pp', rotulo: m.nome };
}

/** «Marília» e «marilia» são a mesma cidade: o setor Cofen é de outra empresa, com o cadastro dela. */
const chaveDoNome = (nome: string | null) =>
  (nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// ── A carteira Cofen ────────────────────────────────────────────────────────

export function parteCofen(c: CofenDoMes, modo: ModoCofen): ParteCofen {
  return {
    setorId: c.setorId,
    nome: c.nome,
    valor: noModo(c.mes, modo),
    bruto: c.mes.bruto,
    ho: c.mes.ho,
    coren: c.mes.coren,
    cofen: c.mes.cofen,
    quantidade: c.mes.quantidade,
    operadores: c.operadores.quantidade,
    valorAnterior: modo === 'ho' ? c.anterior.hoAteCorte : c.anterior.brutoAteCorte,
  };
}

/** A série do Cofen no modo, com a mesma forma da do 59. */
export function serieCofen(c: CofenDoMes, modo: ModoCofen): DiaDaSerie[] {
  return c.serie.map(d => ({
    dia: d.dia,
    valor: d.dentroDoCorte ? noModo(d, modo) : 0,
    valorAnterior: modo === 'ho' ? d.hoAnterior : d.brutoAnterior,
    dentroDoCorte: d.dentroDoCorte,
  }));
}

export function formasCofen(c: CofenDoMes, modo: ModoCofen, dia?: number): FormaDePagamento[] {
  const fonte = dia === undefined ? c.formas : c.formasDia.filter(f => f.dia === dia);
  return fonte.map(f => ({ forma: f.forma, valor: noModo(f, modo), qtd: f.qtd, valorAnterior: 0 }));
}

/** Nosso produto (59) + Cofen, no modo. Sem Cofen, é o 59 como veio. */
export function comporEscopo(m: MesDoEscopo, c: CofenDoMes | null, modo: ModoCofen): EscopoDaVisao {
  if (!c) return { ...m, nossoProduto: m.valor, cofen: null };
  const p = parteCofen(c, modo);
  const sc = new Map(serieCofen(c, modo).map(d => [d.dia, d]));
  const base = m.serie.length ? m.serie : serieCofen(c, modo).map(d => ({ ...d, valor: 0, valorAnterior: 0 }));
  return {
    valor: m.valor + p.valor,
    linhas: m.linhas + p.quantidade,
    operadores: m.operadores + p.operadores,
    colchao: m.colchao,
    valorAnterior: m.valorAnterior + p.valorAnterior,
    mesAnteriorTotal: m.mesAnteriorTotal + (modo === 'ho' ? c.anterior.hoMes : c.anterior.brutoMes),
    // Dias com recebimento: os dois recebem nos mesmos dias úteis; o maior
    // dos dois é a melhor estimativa sem a lista de dias do mês anterior.
    mesAnteriorDias: Math.max(m.mesAnteriorDias, c.anterior.dias),
    serie: base.map(d => {
      const x = sc.get(d.dia);
      return { ...d, valor: d.valor + (x?.valor ?? 0), valorAnterior: d.valorAnterior + (x?.valorAnterior ?? 0) };
    }),
    formas: [...m.formas, ...formasCofen(c, modo)],
    nossoProduto: m.valor,
    cofen: p,
  };
}

// ── A visão ─────────────────────────────────────────────────────────────────

function setorDaGrade(s: SetorDoPainel, alternativo = false): SetorDaCidade {
  return {
    setorId: s.setorId, nome: s.setorNome, valor: s.valor, valorAnterior: s.valorAnterior,
    temAnterior: s.temAnterior, operadores: s.operadores, linhas: s.linhas, alternativo,
  };
}

const zerado = (dias: number): MesDoEscopo => ({
  valor: 0, linhas: 0, operadores: 0, colchao: 0, valorAnterior: 0, mesAnteriorTotal: 0, mesAnteriorDias: 0,
  serie: Array.from({ length: dias }, (_, i) => ({ dia: i + 1, valor: 0, valorAnterior: 0, dentroDoCorte: false })),
  formas: [],
});

/**
 * O geral e as cidades, com o Cofen na cidade do setor Cofen.
 *
 * O Cofen só entra quando conta (o setor tem cidade). Se a cidade dele não
 * tiver cartão no 59 — nenhum setor de Nosso produto lá —, ganha um cartão
 * só dela, em vez de sumir.
 */
export function montarVisao(
  mes: MesPorCidade,
  cofen: CofenDoMes | null,
  grade: GradeDeSetores | null,
  setores: InfoDoSetor[],
  modo: ModoCofen,
): VisaoMontada {
  const c = cofen?.conta ? cofen : null;
  const info = new Map(setores.map(s => [s.id, s]));
  const geral = comporEscopo(mes.geral, c, modo);

  type Base = { cidadeId: string; nome: string; mes: MesDoEscopo };
  const bases: Base[] = mes.cidades
    .filter((x): x is typeof x & { cidadeId: string } => x.cidadeId !== null)
    .map(x => ({ cidadeId: x.cidadeId, nome: x.nome ?? 'Cidade', mes: x }));
  let cidadeDoCofen: string | null = null;
  if (c) {
    const achada = bases.find(b => chaveDoNome(b.nome) === chaveDoNome(c.cidadeNome));
    if (achada) cidadeDoCofen = achada.cidadeId;
    else if (c.cidadeId) {
      bases.push({ cidadeId: c.cidadeId, nome: c.cidadeNome ?? 'Cidade', mes: zerado(mes.diasNoMes) });
      cidadeDoCofen = c.cidadeId;
    }
  }

  const lista = bases.map((b): CidadeDaVisao => {
    const { marca, rotulo } = marcaVisual(b.nome);
    const comCofen = c && cidadeDoCofen === b.cidadeId ? c : null;
    const escopo = comporEscopo(b.mes, comCofen, modo);
    const daCidade = (s: SetorDoPainel) => {
      const i = info.get(s.setorId);
      return i?.cidadeId === b.cidadeId && i.regra !== 'cofen';
    };
    // Os alternativos vêm numa lista à parte da grade (não somam no total);
    // sem eles o Marília Digital aparecia zerado no placar (06/10/2026).
    const setoresDaCidade = [
      ...(grade?.setores ?? []).filter(daCidade).map(s => setorDaGrade(s)),
      ...(grade?.alternativos ?? []).filter(daCidade).map(s => setorDaGrade(s, true)),
    ].sort((x, y) => y.valor - x.valor);
    const soltas = mes.carteiras
      .filter(k => !k.setorId && k.conta && k.cidadeId === b.cidadeId)
      .sort((x, y) => y.valor - x.valor);
    return {
      chave: b.cidadeId,
      cidadeId: b.cidadeId,
      nome: b.nome,
      marca, rotuloMarca: rotulo,
      mes: escopo,
      participacao: geral.valor > 0 ? escopo.valor / geral.valor : 0,
      setores: setoresDaCidade,
      carteirasSemSetor: soltas,
      melhorSetor: setoresDaCidade.find(s => !s.alternativo) ?? null,
      cofen: escopo.cofen,
    };
  });

  // BookPlay primeiro, PaguePlay depois, o resto por nome — a ordem não muda
  // de um mês para o outro.
  const peso = (m: MarcaVisual) => (m === 'bp' ? 0 : m === 'pp' ? 1 : 2);
  const cidades = lista.sort((x, y) => peso(x.marca) - peso(y.marca) || x.nome.localeCompare(y.nome));

  const carteiras: ParteDoGeral[] = [{ chave: 'nosso_produto', nome: 'Nosso produto', valor: geral.nossoProduto }];
  if (geral.cofen) carteiras.push({ chave: 'cofen', nome: 'Cofen', valor: geral.cofen.valor });

  return { geral, cidades, carteiras };
}

/** O dinheiro do 59 fora da conta: sem cidade, ou com regra Cofen. */
export function foraDaConta(mes: MesPorCidade): { valor: number; carteiras: CarteiraDaCidade[] } {
  const carteiras = mes.carteiras.filter(k => !k.conta).sort((a, b) => b.valor - a.valor);
  return { valor: mes.naoConta.valor, carteiras };
}

// ── O dia ───────────────────────────────────────────────────────────────────

export interface DiaSeparado {
  /** Setores de Nosso produto, do maior para o menor. */
  nossoProduto: UnidadeDoDia[];
  /** Carteiras sem setor — contam na cidade, não em setor. */
  semSetor: UnidadeDoDia[];
  /** O que conta só no total (Retenção e afins). */
  soNoTotal: UnidadeDoDia[];
}

export function separarDia(unidades: UnidadeDoDia[]): DiaSeparado {
  const ord = (a: UnidadeDoDia, b: UnidadeDoDia) => b.valor - a.valor;
  // O Cofen do dia vem da conciliação (`cofenNoDia`), nunca do 59.
  const resto = unidades.filter(u => u.regra !== 'cofen');
  return {
    nossoProduto: resto.filter(u => u.tipo === 'setor').sort(ord),
    semSetor: resto.filter(u => u.tipo === 'sem_setor').sort(ord),
    soNoTotal: resto.filter(u => u.tipo === 'somente_geral').sort(ord),
  };
}

/** A carteira Cofen num dia, no modo. */
export interface CofenNoDia {
  setorId: string | null;
  nome: string;
  valor: number;
  bruto: number;
  ho: number;
  coren: number;
  cofen: number;
  quantidade: number;
  operadores: number;
  destaque: { nome: string; valor: number } | null;
  /** Média por dia com recebimento no mês até o corte, no modo. */
  media: number;
  /** O mesmo dia do mês anterior, e a média diária dele, no modo. */
  valorAnterior: number;
  mediaAnterior: number;
  formas: FormaDePagamento[];
}

export function cofenNoDia(c: CofenDoMes | null, dia: number, modo: ModoCofen): CofenNoDia | null {
  if (!c?.conta) return null;
  const d = c.serie.find(x => x.dia === dia);
  if (!d) return null;
  const comRecebimento = c.serie.filter(x => x.dentroDoCorte && x.bruto !== 0);
  return {
    setorId: c.setorId,
    nome: c.nome,
    valor: noModo(d, modo),
    bruto: d.bruto, ho: d.ho, coren: d.coren, cofen: d.cofen,
    quantidade: d.quantidade,
    operadores: d.operadores,
    destaque: d.destaque ? { nome: d.destaque.nome, valor: noModo(d.destaque, modo) } : null,
    media: comRecebimento.length ? comRecebimento.reduce((a, x) => a + noModo(x, modo), 0) / comRecebimento.length : 0,
    valorAnterior: modo === 'ho' ? d.hoAnterior : d.brutoAnterior,
    mediaAnterior: mediaDiaria(modo === 'ho' ? c.anterior.hoMes : c.anterior.brutoMes, c.anterior.dias),
    formas: formasCofen(c, modo, dia),
  };
}

/** Média diária do mês anterior (por dia com recebimento). */
export function mediaDiaria(total: number, dias: number): number {
  return dias > 0 ? total / dias : 0;
}

/** Sábado ou domingo, para o gráfico pintar o fim de semana mais claro. */
export function ehFimDeSemana(mes: string, dia: number): boolean {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1, dia).getDay();
  return d === 0 || d === 6;
}

const DIAS_DA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** «Quinta-feira, 15 de outubro». */
export function rotuloDoDia(mes: string, dia: number): string {
  const [a, m] = mes.split('-').map(Number);
  const semana = DIAS_DA_SEMANA[new Date(a, m - 1, dia).getDay()];
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${dia} de ${MESES[m - 1]}`;
}

/** «setembro», do `yyyy-MM`. */
export function nomeDoMes(mes: string): string {
  const m = Number(mes.split('-')[1]);
  return MESES[m - 1] ?? mes;
}
