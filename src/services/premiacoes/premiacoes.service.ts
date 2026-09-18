/**
 * premiacoes.service.ts — o que Fechamento › Premiações e Comissões lê e grava.
 *
 * As duas RPCs da migration 20260918150000. Elas usam as tabelas do RH Gestão
 * (`rh_config_setores`, `rh_celulas`, `rh_dados_operadores`) com o recorte do
 * Fechamento — o RH está desligado para quase todo cargo, e a RLS dele não
 * entregaria nada à gerência. Ver o cabeçalho da migration.
 *
 * `rpcSemTipo` porque as funções são novas e ainda não estão em `database.types.ts`.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { TipoRemuneracao, VinculoSetor } from './calculoPremiacoes';

interface RespostaDados {
  setores?: { setor_id: string; celula: string; tipo_remuneracao: string }[] | null;
  crachas?: { operador_id: string; cracha: string | null }[] | null;
}

export interface DadosPremiacoes {
  /** setor_id → cidade e tipo de remuneração. */
  vinculos: Map<string, VinculoSetor>;
  /** operador_id → crachá. */
  crachas: Map<string, string>;
  /** `false` = a migration ainda não foi aplicada neste banco. */
  disponivel: boolean;
  erro: string | null;
}

function rpcAusente(mensagem: string): boolean {
  return /could not find the function|does not exist|schema cache/i.test(mensagem);
}

function ehTipo(v: unknown): v is TipoRemuneracao {
  return v === 'premiacao' || v === 'comissao';
}

export async function buscarDadosPremiacoes(
  empresaId: string, ano: number, mes: number,
): Promise<DadosPremiacoes> {
  const { data, error } = await rpcSemTipo<RespostaDados>('fn_fechamento_premiacoes_dados', {
    p_empresa_id: empresaId, p_ano: ano, p_mes: mes,
  });
  if (error) {
    return {
      vinculos: new Map(), crachas: new Map(),
      disponivel: !rpcAusente(error.message),
      erro: error.message,
    };
  }

  const vinculos = new Map<string, VinculoSetor>();
  for (const s of data?.setores ?? []) {
    if (s.setor_id && ehTipo(s.tipo_remuneracao)) {
      vinculos.set(s.setor_id, { celula: s.celula, tipo: s.tipo_remuneracao });
    }
  }
  const crachas = new Map<string, string>();
  for (const c of data?.crachas ?? []) {
    const cracha = c.cracha?.trim();
    if (c.operador_id && cracha) crachas.set(c.operador_id, cracha);
  }
  return { vinculos, crachas, disponivel: true, erro: null };
}

/** Grava (ou apaga, com `null`) o crachá do operador. */
export async function salvarCracha(params: {
  empresaId: string;
  operadorId: string;
  ano: number;
  mes: number;
  cracha: string | null;
}): Promise<{ ok: boolean; erro: string | null }> {
  const { error } = await rpcSemTipo<string | null>('fn_fechamento_salvar_cracha', {
    p_empresa_id: params.empresaId,
    p_operador_id: params.operadorId,
    p_ano: params.ano,
    p_mes: params.mes,
    p_cracha: params.cracha,
  });
  if (!error) return { ok: true, erro: null };
  if (rpcAusente(error.message)) {
    return { ok: false, erro: 'Premiações e Comissões ainda não foi instalado neste banco.' };
  }
  return { ok: false, erro: error.message };
}
