/**
 * diretoriaSetores.service.ts — a aba «Setores e equipes» do Painel Diretoria.
 *
 * Fase 2 do painel: a Visão Geral respondeu «a empresa está melhor ou pior»,
 * esta responde «onde». O dinheiro continua vindo do 59; o que este arquivo
 * acrescenta é o encontro dele com o que o SISTEMA sabe — meta, quartil e
 * projeção, que não existem no relatório.
 *
 * ## Duas fontes, e a costura fica aqui
 *
 * O 59 traz o realizado. `metas` e `metas_config_mes` trazem o alvo e o
 * calendário. São bancos de verdade diferentes: um é relatório do ERP, o outro
 * é configuração de quem administra. Juntá-los numa função de banco só faria
 * uma função que fala de duas verdades e não sabe dizer qual delas falhou —
 * por isso a junção é aqui, explícita, e um setor sem meta simplesmente não
 * mostra projeção em vez de mostrar 0%.
 *
 * ## A régua da projeção é a MESMA da tela
 *
 * `calcularProjecao` conta em DIAS ÚTEIS, e o corte do painel é um dia do
 * CALENDÁRIO. `projecaoDoSetor` traduz um no outro passando o dia de corte como
 * «hoje»: mover o corte para o dia 20 tem que mover o esperado junto. Sem isso
 * o card compararia o recebido até o dia 20 com a meta esperada até hoje, e a
 * projeção despencaria por um motivo que não existe.
 *
 * ## O denominador da porcentagem NÃO é o total da empresa
 *
 * A soma dos setores é maior que o total do arquivo, de propósito: o `Integral`
 * cobrado por um setor para outro conta nos dois (ver `20260904300000`). Dividir
 * pelo total da empresa faria as fatias passarem de 100%. `participacao` usa a
 * soma dos setores, e é por isso que ela recebe o denominador em vez de
 * calculá-lo.
 *
 * ## O que este arquivo NÃO faz
 *
 * Não sincroniza. Ler o 59 aqui não altera `analitico_recebimentos`, meta,
 * quartil nem qualquer número das outras abas.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { calcularProjecao, type ResultadoProjecao } from '@/lib/projecaoMetas';
import { diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO } from '@/lib/diasUteis';
import type { QuartilConfig } from '@/lib/supabase';
import type { DiaDaSerie, FormaDePagamento } from './diretoria.service';

/** `numeric` do Postgres chega como string. Mesma regra do resto do mestre. */
const n = (v: unknown): number => Number(v) || 0;

// ── O que a grade devolve ───────────────────────────────────────────────────

export interface SetorDoPainel {
  setorId: string;
  setorNome: string;
  fotoUrl: string | null;
  valor: number;
  linhas: number;
  operadores: number;
  carteiras: number;
  /** `Integral` que outro setor cobrou para este. Conta nos dois — não é erro. */
  integralRecebido: number;
  /** Equipes que outros grupos mandaram para cá (`mestre_equipes.destino`). */
  movidoParaCa: number;
  valorAnterior: number;
  temAnterior: boolean;
  /** Tem ao menos uma carteira vinculada. Falso = só recebeu equipe movida. */
  temGrupo: boolean;
}

/** Carteira que ainda não foi vinculada a setor nenhum. Vira card também. */
export interface CarteiraSemSetor {
  cod: string;
  nome: string;
  valor: number;
  linhas: number;
  operadores: number;
  valorAnterior: number;
}

export interface GradeDeSetores {
  mes: string;
  mesAnterior: string;
  diaCorte: number;
  diasNoMes: number;
  /** O total do arquivo, sem a 2ª perna do Integral. Fecha com a Visão Geral. */
  totalEmpresa: number;
  /** A soma dos cards. MAIOR que `totalEmpresa` quando há Integral cruzado. */
  totalSetores: number;
  semSetor: { valor: number; linhas: number };
  setores: SetorDoPainel[];
  carteirasSemSetor: CarteiraSemSetor[];
}

export interface EquipeDoSetor {
  nome: string;
  codGrupo: string;
  carteira: string;
  valor: number;
  linhas: number;
  operadores: number;
  /** Veio de outro grupo por `destino = outro_setor`. */
  veioDeFora: boolean;
  /** É a 2ª perna do Integral: o mesmo dinheiro também conta na origem. */
  eIntegral: boolean;
  /** `false` = rótulo do ERP que não é equipe (ATESTADOS|FERIAS e afins). */
  eEquipe: boolean;
  equipeId: string | null;
  equipeNome: string | null;
  liderId: string | null;
  liderNome: string | null;
  liderFoto: string | null;
}

export interface DetalheDoSetor {
  setorId: string | null;
  codGrupo: string | null;
  setorNome: string;
  /** `true` = setor vinculado (com atribuição). `false` = carteira crua do 59. */
  vinculado: boolean;
  mes: string;
  mesAnterior: string;
  diaCorte: number;
  diasNoMes: number;
  recebido: number;
  linhas: number;
  operadores: number;
  recebidoAnterior: number;
  temAnterior: boolean;
  serie: DiaDaSerie[];
  formas: FormaDePagamento[];
  carteiras: { cod: string; nome: string; valor: number; qtd: number }[];
  equipes: EquipeDoSetor[];
}

// ── Formato cru do jsonb ────────────────────────────────────────────────────

interface GradeCrua {
  mes: string; mes_anterior: string; dia_corte: unknown; dias_no_mes: unknown;
  total_empresa: unknown; total_setores: unknown;
  sem_setor: { valor: unknown; linhas: unknown };
  setores: {
    setor_id: string; setor_nome: string; foto_url: string | null;
    valor: unknown; linhas: unknown; operadores: unknown; carteiras: unknown;
    integral_recebido: unknown; movido_para_ca: unknown;
    valor_anterior: unknown; tem_anterior: boolean; tem_grupo: boolean;
  }[];
  carteiras_sem_setor: {
    cod: string; nome: string; valor: unknown; linhas: unknown;
    operadores: unknown; valor_anterior: unknown;
  }[];
}

interface DetalheCru {
  setor_id: string | null; cod_grupo: string | null; setor_nome: string;
  vinculado: boolean; mes: string; mes_anterior: string;
  dia_corte: unknown; dias_no_mes: unknown;
  recebido: unknown; linhas: unknown; operadores: unknown;
  recebido_anterior: unknown; tem_anterior: boolean;
  serie: { dia: unknown; valor: unknown; valor_anterior: unknown; dentro_do_corte: boolean }[];
  formas: { forma: string; valor: unknown; qtd: unknown; valor_anterior: unknown }[];
  carteiras: { cod: string; nome: string; valor: unknown; qtd: unknown }[];
  equipes: {
    nome: string; cod_grupo: string; carteira: string;
    valor: unknown; linhas: unknown; operadores: unknown;
    veio_de_fora: boolean; e_integral: boolean; e_equipe: boolean;
    equipe_id: string | null; equipe_nome: string | null;
    lider_id: string | null; lider_nome: string | null; lider_foto: string | null;
  }[];
}

// ── As buscas ───────────────────────────────────────────────────────────────

export async function buscarGradeDeSetores(
  empresaId: string, mes: string, diaCorte?: number | null,
): Promise<GradeDeSetores> {
  const { data, error } = await rpcSemTipo<GradeCrua>(
    'fn_mestre_diretoria_setores',
    { p_empresa_id: empresaId, p_mes: mes, p_dia_corte: diaCorte ?? null },
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error('A grade de setores não devolveu resultado.');

  return {
    mes:          data.mes,
    mesAnterior:  data.mes_anterior,
    diaCorte:     n(data.dia_corte),
    diasNoMes:    n(data.dias_no_mes),
    totalEmpresa: n(data.total_empresa),
    totalSetores: n(data.total_setores),
    semSetor: {
      valor:  n(data.sem_setor?.valor),
      linhas: n(data.sem_setor?.linhas),
    },
    setores: (data.setores ?? []).map(s => ({
      setorId:          s.setor_id,
      setorNome:        s.setor_nome,
      fotoUrl:          s.foto_url,
      valor:            n(s.valor),
      linhas:           n(s.linhas),
      operadores:       n(s.operadores),
      carteiras:        n(s.carteiras),
      integralRecebido: n(s.integral_recebido),
      movidoParaCa:     n(s.movido_para_ca),
      valorAnterior:    n(s.valor_anterior),
      temAnterior:      s.tem_anterior === true,
      temGrupo:         s.tem_grupo === true,
    })),
    carteirasSemSetor: (data.carteiras_sem_setor ?? []).map(c => ({
      cod:           c.cod,
      nome:          c.nome,
      valor:         n(c.valor),
      linhas:        n(c.linhas),
      operadores:    n(c.operadores),
      valorAnterior: n(c.valor_anterior),
    })),
  };
}

/**
 * O detalhe de um setor vinculado OU de uma carteira crua.
 *
 * Exatamente um dos dois — o banco recusa os dois juntos em vez de escolher em
 * silêncio, e esta assinatura existe para o erro aparecer aqui e não lá.
 */
export async function buscarDetalheDoSetor(
  empresaId: string,
  mes: string,
  alvo: { setorId: string; codGrupo?: never } | { codGrupo: string; setorId?: never },
  diaCorte?: number | null,
): Promise<DetalheDoSetor> {
  const { data, error } = await rpcSemTipo<DetalheCru>(
    'fn_mestre_diretoria_setor',
    {
      p_empresa_id: empresaId,
      p_mes:        mes,
      p_setor_id:   alvo.setorId ?? null,
      p_cod_grupo:  alvo.codGrupo ?? null,
      p_dia_corte:  diaCorte ?? null,
    },
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error('O detalhe do setor não devolveu resultado.');

  return {
    setorId:   data.setor_id,
    codGrupo:  data.cod_grupo,
    setorNome: data.setor_nome,
    vinculado: data.vinculado === true,
    mes:         data.mes,
    mesAnterior: data.mes_anterior,
    diaCorte:    n(data.dia_corte),
    diasNoMes:   n(data.dias_no_mes),
    recebido:    n(data.recebido),
    linhas:      n(data.linhas),
    operadores:  n(data.operadores),
    recebidoAnterior: n(data.recebido_anterior),
    temAnterior: data.tem_anterior === true,
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
    carteiras: (data.carteiras ?? []).map(c => ({
      cod: c.cod, nome: c.nome, valor: n(c.valor), qtd: n(c.qtd),
    })),
    equipes: (data.equipes ?? []).map(e => ({
      nome:       e.nome,
      codGrupo:   e.cod_grupo,
      carteira:   e.carteira,
      valor:      n(e.valor),
      linhas:     n(e.linhas),
      operadores: n(e.operadores),
      veioDeFora: e.veio_de_fora === true,
      eIntegral:  e.e_integral === true,
      eEquipe:    e.e_equipe === true,
      equipeId:   e.equipe_id,
      equipeNome: e.equipe_nome,
      liderId:    e.lider_id,
      liderNome:  e.lider_nome,
      liderFoto:  e.lider_foto,
    })),
  };
}

// ── Contas puras ────────────────────────────────────────────────────────────

/**
 * Participação de um setor no conjunto.
 *
 * `total` é a SOMA DOS SETORES, nunca o total da empresa — ver o cabeçalho.
 * Devolve `null` sem base: uma participação de 0% e a ausência de base são
 * coisas diferentes, e a segunda não deve virar um número na tela.
 */
export function participacao(valor: number, total: number): number | null {
  if (!Number.isFinite(valor) || !Number.isFinite(total) || total <= 0) return null;
  return (valor / total) * 100;
}

export interface EntradaProjecaoSetor {
  /** Meta do setor no mês. `null`/0 = sem meta configurada. */
  meta: number | null | undefined;
  /** Recebido do 59 até o corte. */
  recebido: number;
  /** 'yyyy-MM' do mês em foco. */
  mes: string;
  /** Dia de corte do painel. É ele que faz o papel de «hoje». */
  diaCorte: number;
  feriados: string[];
  quartis: QuartilConfig[];
  /** `metas_config_mes.contar_dia_atual`. Padrão do banco é false. */
  contarDiaAtual: boolean;
}

/**
 * Projeção e quartil de um setor, na régua do painel.
 *
 * O ponto todo é a tradução entre as duas réguas: o painel corta por dia do
 * CALENDÁRIO, `calcularProjecao` mede em DIAS ÚTEIS. Passar o dia de corte como
 * `hojeISO` é o que mantém as duas honestas — recebido até o dia 20 comparado
 * com o esperado até o dia 20.
 *
 * Devolve `null` quando não há meta. É diferente de «0% da meta»: um setor sem
 * meta configurada não está mal, ele não está medido, e o card tem que dizer
 * isso em vez de pintar de vermelho.
 */
export function projecaoDoSetor(e: EntradaProjecaoSetor): ResultadoProjecao | null {
  const meta = Number(e.meta) || 0;
  if (meta <= 0) return null;

  const [anoTxt, mesTxt] = e.mes.split('-');
  const ano = Number(anoTxt);
  const mesNum = Number(mesTxt);
  if (!Number.isFinite(ano) || !Number.isFinite(mesNum) || mesNum < 1 || mesNum > 12) return null;

  const corteIso = `${e.mes}-${String(Math.max(1, e.diaCorte)).padStart(2, '0')}`;

  return calcularProjecao({
    meta,
    recebido:   e.recebido,
    totalUteis: diasUteisDoMes(ano, mesNum, e.feriados),
    decorridos: diasUteisDecorridos(
      ano, mesNum, e.feriados, corteIso, undefined, e.contarDiaAtual,
    ),
    quartis: e.quartis.length ? e.quartis : QUARTIS_PADRAO,
  });
}
