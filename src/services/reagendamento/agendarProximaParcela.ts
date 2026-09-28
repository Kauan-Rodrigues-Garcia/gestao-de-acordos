/**
 * agendarProximaParcela.ts — a única porta para criar a próxima parcela.
 *
 * Dashboard, aba Acordos e detalhe do acordo faziam cada um o seu `insert`,
 * cada um esquecendo algo (estado_uf, valor_total, valor_entrada), e todos
 * batiam na RLS `acordos_insert` — que não tem o ramo de EQUIPE que a leitura
 * tem. O líder de equipe via o acordo do operador, clicava e recebia «new row
 * violates row-level security policy».
 *
 * Agora quem cria é `fn_acordo_agendar_proxima_parcela` (migration
 * 20260929010000): mesma régua da leitura, parcela sempre do DONO, identidade
 * inteira copiada, par Direto/Extra na mesma transação.
 *
 * Enquanto a função não existir no banco, cai no insert antigo — o dono
 * continua conseguindo; só o líder de equipe fica esperando a migration.
 */
import { supabase, type Acordo } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { getTodayISO } from '@/lib/index';
import { ehParcelaDuplicada } from './reagendamento';

export interface AgendarInput {
  vencimento: string;
  valor: number;
  /** Valor da parcela do par Direto/Extra. Nulo = o mesmo de `valor`. */
  valorPar?: number | null;
}

export type AgendarResultado =
  | { ok: true; parcela: Acordo | null; jaExistia: boolean; numero: number; total: number }
  | { ok: false; erro: string };

interface RespostaRpc {
  id: string;
  numero_parcela: number;
  parcelas: number;
  ja_existia: boolean;
  par_id: string | null;
}

const SELECT_LINHA = '*, perfis(id, nome, email, perfil, setor_id)';

/** A função ainda não está no banco (front subiu antes da migration). */
export function ehFuncaoAusente(e: { code?: string | null; message?: string | null } | null): boolean {
  if (!e) return false;
  return e.code === 'PGRST202' || e.code === '42883'
    || /fn_acordo_agendar_proxima_parcela|could not find the function|schema cache|does not exist/i
      .test(e.message ?? '');
}

/** Tira o prefixo técnico (`NAO_AUTORIZADO: …`) e deixa a frase. */
export function mensagemDoServidor(msg: string): string {
  const m = /^[A-Z_]+:\s*(.+)$/.exec(msg.trim());
  if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1);
  if (/row-level security/i.test(msg)) {
    return 'O banco não deixou criar a parcela para o dono deste acordo.';
  }
  return msg;
}

export async function agendarProximaParcela(
  base: Acordo,
  input: AgendarInput,
): Promise<AgendarResultado> {
  const numero = (base.numero_parcela ?? 1) + 1;
  const total  = base.parcelas ?? 1;

  const { data, error } = await rpcSemTipo<RespostaRpc>('fn_acordo_agendar_proxima_parcela', {
    p_acordo_id:  base.id,
    p_vencimento: input.vencimento,
    p_valor:      input.valor,
    p_valor_par:  input.valorPar ?? null,
  });

  if (error && ehFuncaoAusente(error)) return legado(base, input, numero, total);
  if (error) return { ok: false, erro: mensagemDoServidor(error.message) };
  if (!data?.id) return { ok: false, erro: 'O banco não devolveu a parcela criada.' };

  const { data: linha } = await supabase
    .from('acordos').select(SELECT_LINHA).eq('id', data.id).maybeSingle();

  return {
    ok: true,
    parcela: (linha as Acordo | null) ?? null,
    jaExistia: !!data.ja_existia,
    numero: data.numero_parcela ?? numero,
    total: data.parcelas ?? total,
  };
}

/**
 * O caminho de antes da migration 20260929010000, já com a identidade inteira
 * — o que as três telas esqueciam, cada uma a sua parte. Não cria o par
 * Direto/Extra: isso fica para a função do banco.
 */
async function legado(
  base: Acordo, input: AgendarInput, numero: number, total: number,
): Promise<AgendarResultado> {
  if (!base.acordo_grupo_id) return { ok: false, erro: 'O acordo não tem grupo de parcelas.' };

  const { data: existe } = await supabase
    .from('acordos').select(SELECT_LINHA)
    .eq('acordo_grupo_id', base.acordo_grupo_id)
    .eq('numero_parcela', numero)
    .maybeSingle();
  if (existe) return { ok: true, parcela: existe as Acordo, jaExistia: true, numero, total };

  const payload: Record<string, unknown> = {
    nome_cliente:          base.nome_cliente,
    nr_cliente:            base.nr_cliente,
    instituicao:           base.instituicao ?? null,
    whatsapp:              base.whatsapp ?? null,
    observacoes:           base.observacoes ?? null,
    estado_uf:             base.estado_uf ?? null,
    tipo:                  base.tipo,
    parcelas:              base.parcelas,
    operador_id:           base.operador_id,
    empresa_id:            base.empresa_id,
    setor_id:              base.setor_id ?? null,
    data_cadastro:         getTodayISO(),
    acordo_grupo_id:       base.acordo_grupo_id,
    numero_parcela:        numero,
    tipo_vinculo:          base.tipo_vinculo ?? null,
    vinculo_operador_id:   base.vinculo_operador_id ?? null,
    vinculo_operador_nome: base.vinculo_operador_nome ?? null,
    valor_total:           base.valor_total ?? null,
    usou_quarenta_pct:     base.usou_quarenta_pct ?? false,
    ...(base.valor_entrada != null ? { valor_entrada: base.valor_entrada } : {}),
    status:                'verificar_pendente',
    valor:                 input.valor,
    vencimento:            input.vencimento,
  };

  const { data, error } = await supabase
    .from('acordos').insert(payload as never).select(SELECT_LINHA).single();

  if (error && ehParcelaDuplicada(error)) {
    return { ok: true, parcela: null, jaExistia: true, numero, total };
  }
  if (error) return { ok: false, erro: mensagemDoServidor(error.message) };
  return { ok: true, parcela: data as Acordo, jaExistia: false, numero, total };
}
