/**
 * diretoria.service.ts — o Painel Diretoria lendo o relatório 59.
 *
 * O painel da BookPlay deixou de somar o que o sistema tabulou e passou a ler o
 * relatório mestre. A diferença não é de fonte, é de escopo: o 58 é a fatia de
 * um setor, o 59 é a cobrança INTEIRA — inclusive a carteira que não pertence a
 * setor nenhum e a equipe que conta só para o geral. Um diretor precisa do
 * total da empresa, e o total da empresa é o 59.
 *
 * ## Uma chamada por aba, e o porquê
 *
 * `fn_mestre_diretoria_visao_geral` devolve total, mês anterior, série diária,
 * formas de pagamento e carteiras num `jsonb` só. Este arquivo não parte isso
 * em várias chamadas nem recalcula nada: os blocos têm que sair do mesmo corte
 * de dia e do mesmo lote, e é exatamente aí que uma tela começa a mostrar dois
 * totais que não fecham.
 *
 * ## Tudo que vem do banco passa por `n()`
 *
 * `numeric` do Postgres chega como STRING no supabase-js. Somar sem converter
 * concatena — `"100" + "50"` vira `"10050"` num total, silenciosamente, e passa
 * por qualquer teste que não olhe o número. Mesma regra do `mestre.service`.
 *
 * ## O que este arquivo NÃO faz
 *
 * Não sincroniza nada. Ler o 59 aqui não altera `analitico_recebimentos`, meta,
 * quartil nem qualquer número das outras abas — vincular uma carteira a um setor
 * muda o que ESTE painel mostra, e só. A sincronização é outra etapa, e mantê-la
 * fora daqui é o que permite mexer no painel sem risco para o resto.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

/** `numeric` do Postgres chega como string. Ver o cabeçalho. */
const n = (v: unknown): number => Number(v) || 0;

/** Um dia da série. `valor_anterior` é o MESMO dia do mês passado. */
export interface DiaDaSerie {
  dia: number;
  valor: number;
  valorAnterior: number;
  /** Falso nos dias depois do corte — o gráfico para o traço aqui. */
  dentroDoCorte: boolean;
}

export interface FormaDePagamento {
  forma: string;
  valor: number;
  qtd: number;
  valorAnterior: number;
}

/**
 * Uma carteira do 59 (`NomeGrupoFiltro`).
 *
 * `setorId` nulo = a carteira não foi vinculada a nenhum setor do sistema. Não
 * é erro: há carteiras que são da cobrança geral e não pertencem a setor
 * nenhum. O painel mostra assim mesmo, porque o total da empresa as inclui.
 */
export interface CarteiraDoMes {
  cod: string;
  nome: string;
  valor: number;
  qtd: number;
  valorAnterior: number;
  setorId: string | null;
  setorNome: string | null;
}

export interface VisaoGeralDiretoria {
  mes: string;
  mesAnterior: string;
  diaCorte: number;
  diasNoMes: number;
  /** Falso = nenhum 59 promovido para este mês. A tela desenha «sem dados». */
  temLote: boolean;
  /** Falso = sem mês anterior para comparar. As variações somem, o resto fica. */
  temLoteAnterior: boolean;
  recebido: number;
  linhas: number;
  operadores: number;
  carteirasQtd: number;
  recebidoAnterior: number;
  linhasAnterior: number;
  serie: DiaDaSerie[];
  formas: FormaDePagamento[];
  carteiras: CarteiraDoMes[];
  /**
   * Os setores que CLONAM o recebimento de gente de outros setores.
   *
   * Ficam FORA de `recebido`: somar contaria o mesmo dinheiro duas vezes —
   * uma no setor que cobrou, outra no alternativo que espelha. Vêm de
   * consulta separada, e a separação é o que impede o total de inchar.
   */
  alternativos: SetorAlternativo[];
}

export interface SetorAlternativo {
  setorId: string;
  setorNome: string;
  fotoUrl: string | null;
  valor: number;
  valorAnterior: number;
  linhas: number;
  /** Quem apareceu no 59. */
  operadores: number;
  /** Quantos o setor tem, tendo recebido ou não. */
  pessoas: number;
}

/** O formato cru do `jsonb`. Existe para o `as` ficar num lugar só. */
interface RespostaCrua {
  mes: string;
  mes_anterior: string;
  dia_corte: number | string;
  dias_no_mes: number | string;
  tem_lote: boolean;
  tem_lote_anterior: boolean;
  total: { recebido: unknown; linhas: unknown; operadores: unknown; carteiras: unknown };
  total_anterior: { recebido: unknown; linhas: unknown };
  serie: { dia: unknown; valor: unknown; valor_anterior: unknown; dentro_do_corte: boolean }[];
  formas: { forma: string; valor: unknown; qtd: unknown; valor_anterior: unknown }[];
  carteiras: {
    cod: string; nome: string; valor: unknown; qtd: unknown; valor_anterior: unknown;
    setor_id: string | null; setor_nome: string | null;
  }[];
}

interface AlternativoCru {
  setor_id: string; setor_nome: string; foto_url: string | null;
  valor: unknown; valor_anterior: unknown; linhas: unknown;
  operadores: unknown; pessoas: unknown;
}

/**
 * A visão geral do mês.
 *
 * `diaCorte` nulo deixa o banco decidir: hoje, no mês corrente; o último dia,
 * num mês fechado. Quem chama não precisa saber a diferença — e não deve, senão
 * a mesma regra passa a existir em dois lugares.
 */
export async function buscarVisaoGeralDiretoria(
  empresaId: string, mes: string, diaCorte?: number | null,
): Promise<VisaoGeralDiretoria> {
  const args = { p_empresa_id: empresaId, p_mes: mes, p_dia_corte: diaCorte ?? null };
  /*
   * Duas chamadas de propósito. O alternativo espelha dinheiro que outro
   * setor já cobrou, então ele não pode entrar no `total` que o banco soma —
   * e mantê-lo fora daquela consulta faz do total algo que NÃO TEM COMO
   * inchar, em vez de algo que depende de ninguém errar.
   *
   * Falha na segunda não derruba a primeira: uma seção a menos é melhor que
   * a tela inteira em branco.
   */
  const [res, alt] = await Promise.all([
    rpcSemTipo<RespostaCrua>('fn_mestre_diretoria_visao_geral', args),
    rpcSemTipo<AlternativoCru[]>('fn_mestre_diretoria_alternativos', args)
      .catch(() => ({ data: null as AlternativoCru[] | null, error: null as { message: string } | null })),
  ]);
  const { data, error } = res;
  if (error) throw new Error(error.message);
  if (!data) throw new Error('A visão geral não devolveu resultado.');

  return {
    mes:             data.mes,
    mesAnterior:     data.mes_anterior,
    diaCorte:        n(data.dia_corte),
    diasNoMes:       n(data.dias_no_mes),
    temLote:         data.tem_lote === true,
    temLoteAnterior: data.tem_lote_anterior === true,
    recebido:        n(data.total?.recebido),
    linhas:          n(data.total?.linhas),
    operadores:      n(data.total?.operadores),
    carteirasQtd:    n(data.total?.carteiras),
    recebidoAnterior: n(data.total_anterior?.recebido),
    linhasAnterior:   n(data.total_anterior?.linhas),
    serie: (data.serie ?? []).map(d => ({
      dia:           n(d.dia),
      valor:         n(d.valor),
      valorAnterior: n(d.valor_anterior),
      dentroDoCorte: d.dentro_do_corte === true,
    })),
    formas: (data.formas ?? []).map(f => ({
      forma:         f.forma,
      valor:         n(f.valor),
      qtd:           n(f.qtd),
      valorAnterior: n(f.valor_anterior),
    })),
    alternativos: (Array.isArray(alt.data) ? alt.data : []).map(a => ({
      setorId:       a.setor_id,
      setorNome:     a.setor_nome,
      fotoUrl:       a.foto_url,
      valor:         n(a.valor),
      valorAnterior: n(a.valor_anterior),
      linhas:        n(a.linhas),
      operadores:    n(a.operadores),
      pessoas:       n(a.pessoas),
    })),
    carteiras: (data.carteiras ?? []).map(c => ({
      cod:           c.cod,
      nome:          c.nome,
      valor:         n(c.valor),
      qtd:           n(c.qtd),
      valorAnterior: n(c.valor_anterior),
      setorId:       c.setor_id,
      setorNome:     c.setor_nome,
    })),
  };
}

// ── Contas que a TELA precisa, e que não são do banco ───────────────────────
//
// Ficam aqui, puras e testáveis, em vez de espalhadas pelo JSX. A regra é uma
// só: nada que dependa de React entra neste arquivo.

/**
 * Variação percentual entre dois valores.
 *
 * `null` quando não há base de comparação — e `null` NÃO é zero. Um mês sem
 * anterior não cresceu 0%: ele não tem com o que ser comparado, e a tela precisa
 * poder omitir o selo em vez de mostrar um «0%» que parece estagnação.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior)) return null;
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/** A série, acumulada dia a dia. Depois do corte o acumulado congela. */
export function acumular(serie: DiaDaSerie[]): DiaDaSerie[] {
  let a = 0, b = 0;
  return serie.map(d => {
    if (d.dentroDoCorte) { a += d.valor; b += d.valorAnterior; }
    return { ...d, valor: a, valorAnterior: b };
  });
}

/**
 * Onde o mês fecha mantendo o ritmo até aqui.
 *
 * Regra de três sobre DIAS CORRIDOS, não úteis, de propósito: o corte da tela é
 * um dia do calendário, e o 59 traz recebimento em fim de semana. Trocar por
 * dias úteis aqui faria a estimativa discordar do gráfico que está ao lado dela.
 *
 * `null` sem corte ou sem recebimento — projetar de zero é inventar.
 */
export function estimativaDeFechamento(
  recebido: number, diaCorte: number, diasNoMes: number,
): number | null {
  if (diaCorte <= 0 || diasNoMes <= 0 || recebido <= 0) return null;
  if (diaCorte >= diasNoMes) return recebido;
  return (recebido / diaCorte) * diasNoMes;
}

/**
 * A força da cor de uma barra de carteira, entre 0 e 1.
 *
 * As barras deixaram de ser coloridas por categoria e passaram a ser um degradê
 * da cor da empresa: quanto maior o recebimento, mais forte o tom. A cor deixou
 * de ser rótulo e virou GRANDEZA, e por isso vira função — proporção crua não
 * serve.
 *
 * A raiz quadrada é o motivo de existir esta função. A distribuição do 59 é
 * torta: uma carteira leva metade do mês e a cauda fica abaixo de 5% da maior.
 * Com proporção direta, essa cauda inteira sai no mesmo cinza-quase-invisível e
 * a ordem some da tela. A raiz levanta o pé da escala mantendo a ordem intacta
 * — é monotônica, então barra maior NUNCA fica mais clara que barra menor.
 *
 * O piso 0,18 é para a menor carteira ainda ser vista; o teto 0,80 é para a
 * maior não virar bloco chapado ao lado do texto.
 *
 * Sem base (`maior` zero ou negativo) devolve o piso, e não `NaN`: `NaN` numa
 * opacidade de CSS é valor inválido, e valor inválido apaga a barra inteira.
 */
export function intensidadeDaBarra(valor: number, maior: number): number {
  if (!Number.isFinite(valor) || !Number.isFinite(maior) || maior <= 0) return 0.18;
  const p = Math.min(1, Math.max(0, valor / maior));
  return 0.18 + 0.62 * Math.sqrt(p);
}
