/**
 * operadores.service.ts — o recebimento de cada pessoa no 59.
 *
 * ## Por que somar pela COBRADORA, e não pela carteira
 *
 * O recebimento de uma pessoa se espalha: ela cobra em mais de uma carteira
 * (`cod_grupo_filtro`) e aparece em mais de um subgrupo (`subgrupo_equipe`) no
 * mesmo mês. Qualquer recorte por carteira devolve pedaço, nunca a pessoa.
 *
 * Medido em 01–10/09/2026: das 337 pessoas do 59, várias têm 2 e 3 carteiras, e
 * é justamente nelas que o número parecia divergir do 58.
 *
 * ## Os dois números, e os dois são certos
 *
 * `total` .............. tudo o que a pessoa cobrou, em qualquer carteira.
 * `no_setor_dele` ...... a parte que caiu no setor DELA.
 *
 * Eles respondem perguntas diferentes e por isso convivem:
 *
 * - `no_setor_dele` é o que conta para o setor da pessoa — é este o número que
 *   o operador vê. Para a Karolaine, em setembro, são R$ 7.445,58 de
 *   R$ 37.081,78, e os R$ 7.445,58 batem ao centavo com o 58.
 * - `total` é o que ela produziu. Some com o `fora_do_setor_dele`, que abre no
 *   detalhe dizendo para qual setor cada parte foi.
 *
 * O que parecia «18 operadores divergentes» era isto: a diferença não era erro,
 * era a parte fora do setor. Ver `docs/PLANO-SINCRONIZACAO-59.md`.
 *
 * ## Carteira sem vínculo não é erro
 *
 * Setor que ainda não foi cadastrado na planilha aparece com o nome que o ERP
 * manda e `oficial: false`. O valor conta do mesmo jeito — vincular é o que o
 * torna oficial, não o que o faz existir.
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { espiarDo59, lerDo59 } from './cache59';

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

// ── A lista ──────────────────────────────────────────────────────────────────

export interface OperadorDoMes {
  /** O login como o ERP manda. É a chave — sobrevive a quem não tem perfil. */
  cobradora: string;
  operadorId: string | null;
  /** Nome congelado em `composicao_mes`; `null` para quem não tem perfil. */
  nome: string | null;
  temPerfil: boolean;
  setorId: string | null;
  setorNome: string | null;
  total: number;
  noSetorDele: number;
  foraDoSetorDele: number;
  linhas: number;
  carteiras: number;
  subgrupos: number;
}

interface OperadorCru {
  cobradora: string;
  operador_id: string | null;
  nome: string | null;
  tem_perfil: boolean;
  setor_do_operador_id: string | null;
  setor_do_operador: string | null;
  total: unknown;
  no_setor_dele: unknown;
  fora_do_setor_dele: unknown;
  linhas: unknown;
  carteiras: unknown;
  subgrupos: unknown;
}

/** Guardada por alguns minutos: ver `cache59.ts`. */
export function buscarOperadoresDoMes(
  empresaId: string,
  mes: string,
  diaCorte?: number | null,
): Promise<OperadorDoMes[]> {
  return lerDo59(['operadores', empresaId, mes, diaCorte],
    () => buscarOperadoresDoMesNoBanco(empresaId, mes, diaCorte));
}

/** A lista já buscada, se ainda válida — para a aba abrir sem esqueleto. */
export function espiarOperadoresDoMes(
  empresaId: string, mes: string, diaCorte?: number | null,
): OperadorDoMes[] | undefined {
  return espiarDo59(['operadores', empresaId, mes, diaCorte]);
}

async function buscarOperadoresDoMesNoBanco(
  empresaId: string,
  mes: string,
  diaCorte?: number | null,
): Promise<OperadorDoMes[]> {
  const { data, error } = await rpcSemTipo<OperadorCru[]>('fn_mestre_operadores_do_mes', {
    p_empresa_id: empresaId, p_mes: mes, p_dia_corte: diaCorte ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map(o => ({
    cobradora:       o.cobradora,
    operadorId:      o.operador_id,
    nome:            o.nome,
    temPerfil:       o.tem_perfil,
    setorId:         o.setor_do_operador_id,
    setorNome:       o.setor_do_operador,
    total:           n(o.total),
    noSetorDele:     n(o.no_setor_dele),
    foraDoSetorDele: n(o.fora_do_setor_dele),
    linhas:          n(o.linhas),
    carteiras:       n(o.carteiras),
    subgrupos:       n(o.subgrupos),
  }));
}

// ── O detalhe ────────────────────────────────────────────────────────────────

export interface ParteDoSetor {
  setorId: string | null;
  rotulo: string;
  /** Carteira vinculada a um setor da planilha? `false` = cadastro pendente. */
  oficial: boolean;
  eOSetorDele: boolean;
  valor: number;
  linhas: number;
}

export interface ParteDaCarteira {
  cod: string;
  nome: string;
  oficial: boolean;
  setorNome: string | null;
  valor: number;
  linhas: number;
}

export interface ParteDaEquipe {
  subgrupo: string;
  codGrupo: string;
  carteira: string;
  equipeId: string | null;
  equipeNome: string | null;
  /** Subgrupo do 59 já amarrado a uma equipe da planilha? */
  vinculada: boolean;
  valor: number;
  linhas: number;
}

export interface OperadorDetalhe {
  cobradora: string;
  mes: string;
  operadorId: string | null;
  temPerfil: boolean;
  nome: string | null;
  setorId: string | null;
  setorNome: string | null;
  total: number;
  noSetorDele: number;
  foraDoSetorDele: number;
  porSetor: ParteDoSetor[];
  porCarteira: ParteDaCarteira[];
  porEquipe: ParteDaEquipe[];
  porDia: { dia: string; valor: number; linhas: number }[];
}

/** Guardado por alguns minutos: reabrir a mesma pessoa não refaz a consulta. */
export function buscarOperadorDetalhe(
  empresaId: string,
  mes: string,
  cobradora: string,
  diaCorte?: number | null,
): Promise<OperadorDetalhe> {
  return lerDo59(['operador', empresaId, mes, cobradora, diaCorte],
    () => buscarOperadorDetalheNoBanco(empresaId, mes, cobradora, diaCorte));
}

async function buscarOperadorDetalheNoBanco(
  empresaId: string,
  mes: string,
  cobradora: string,
  diaCorte?: number | null,
): Promise<OperadorDetalhe> {
  const { data, error } = await rpcSemTipo<{
    cobradora: string; mes: string; operador_id: string | null; tem_perfil: boolean;
    nome: string | null; setor_do_operador_id: string | null; setor_do_operador: string | null;
    total: unknown; no_setor_dele: unknown; fora_do_setor_dele: unknown;
    por_setor: { setor_id: string | null; rotulo: string; oficial: boolean;
                 e_o_setor_dele: boolean; valor: unknown; linhas: unknown }[];
    por_carteira: { cod: string; nome: string; oficial: boolean;
                    setor_nome: string | null; valor: unknown; linhas: unknown }[];
    por_equipe: { subgrupo: string; cod_grupo: string; carteira: string;
                  equipe_id: string | null; equipe_nome: string | null;
                  vinculada: boolean; valor: unknown; linhas: unknown }[];
    por_dia: { dia: string; valor: unknown; linhas: unknown }[];
  }>('fn_mestre_operador_detalhe', {
    p_empresa_id: empresaId, p_mes: mes, p_cobradora: cobradora, p_dia_corte: diaCorte ?? null,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('O detalhe do operador não devolveu resultado.');

  return {
    cobradora:       data.cobradora,
    mes:             data.mes,
    operadorId:      data.operador_id,
    temPerfil:       data.tem_perfil,
    nome:            data.nome,
    setorId:         data.setor_do_operador_id,
    setorNome:       data.setor_do_operador,
    total:           n(data.total),
    noSetorDele:     n(data.no_setor_dele),
    foraDoSetorDele: n(data.fora_do_setor_dele),
    porSetor: (data.por_setor ?? []).map(s => ({
      setorId: s.setor_id, rotulo: s.rotulo, oficial: s.oficial,
      eOSetorDele: s.e_o_setor_dele, valor: n(s.valor), linhas: n(s.linhas),
    })),
    porCarteira: (data.por_carteira ?? []).map(c => ({
      cod: c.cod, nome: c.nome, oficial: c.oficial,
      setorNome: c.setor_nome, valor: n(c.valor), linhas: n(c.linhas),
    })),
    porEquipe: (data.por_equipe ?? []).map(e => ({
      subgrupo: e.subgrupo, codGrupo: e.cod_grupo, carteira: e.carteira,
      equipeId: e.equipe_id, equipeNome: e.equipe_nome,
      vinculada: e.vinculada, valor: n(e.valor), linhas: n(e.linhas),
    })),
    porDia: (data.por_dia ?? []).map(d => ({
      dia: d.dia, valor: n(d.valor), linhas: n(d.linhas),
    })),
  };
}
