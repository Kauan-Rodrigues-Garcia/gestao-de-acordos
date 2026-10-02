/**
 * calendarioVendas.service.ts — os dias úteis do mês no Comercial.
 *
 * Migration `20261002170000_vendas_calendario_do_mes.sql`. A regra do dia útil
 * mora em `@/lib/vendasCalendario`; aqui só se lê e se grava.
 *
 * ## Sem a migration, nada quebra
 *
 * Tabela ausente = calendário padrão (segunda a sexta, sem feriado), que é
 * exatamente o que as telas contavam antes. Só a gravação acusa o erro.
 *
 * ## Cache curto
 *
 * Cinco telas perguntam o mesmo mês ao abrir; o calendário muda uma vez por
 * mês, se tanto. Quem grava aqui invalida na hora e avisa as telas abertas
 * (`EVENTO_CALENDARIO`).
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import { CALENDARIO_PADRAO, type CalendarioDoMes } from '@/lib/vendasCalendario';
import { mensagemDoErro } from './erroDoBanco';

const MIGRATION = '20261002170000_vendas_calendario_do_mes.sql';
const VALIDADE_MS = 60_000;

/** Disparado depois de gravar: as telas abertas releem o calendário. */
export const EVENTO_CALENDARIO = 'vendas-calendario-mudou';

interface LinhaCalendario {
  feriados: string[] | null;
  sabado_util: boolean | null;
}

const cache = new Map<string, { em: number; promessa: Promise<CalendarioDoMes> }>();

function chave(empresaId: string, ano: number, mes: number): string {
  return `${empresaId}:${ano}-${mes}`;
}

async function carregar(empresaId: string, ano: number, mes: number): Promise<CalendarioDoMes> {
  const { data, error } = await tabelaSemTipo<LinhaCalendario>('vendas_calendario_mes')
    .select('feriados, sabado_util')
    .eq('empresa_id', empresaId)
    .eq('ano', String(ano))
    .eq('mes', String(mes));
  if (error || !data || data.length === 0) return CALENDARIO_PADRAO;
  const l = data[0];
  return {
    feriados: (Array.isArray(l.feriados) ? l.feriados : []).map(d => String(d).slice(0, 10)).sort(),
    sabadoUtil: l.sabado_util === true,
  };
}

/** O calendário do mês. Erro ou mês sem linha = calendário padrão. */
export function buscarCalendario(empresaId: string, ano: number, mes: number): Promise<CalendarioDoMes> {
  const k = chave(empresaId, ano, mes);
  const agora = Date.now();
  const guardado = cache.get(k);
  if (guardado && agora - guardado.em < VALIDADE_MS) return guardado.promessa;
  const promessa = carregar(empresaId, ano, mes);
  cache.set(k, { em: agora, promessa });
  return promessa;
}

export async function salvarCalendario(params: {
  empresaId: string;
  ano: number;
  mes: number;
  calendario: CalendarioDoMes;
}): Promise<{ ok: boolean; erro: string | null }> {
  const { error } = await rpcSemTipo('fn_vendas_calendario_salvar', {
    p_empresa_id: params.empresaId,
    p_ano: params.ano,
    p_mes: params.mes,
    p_feriados: params.calendario.feriados,
    p_sabado_util: params.calendario.sabadoUtil,
  });
  cache.delete(chave(params.empresaId, params.ano, params.mes));
  if (error) return { ok: false, erro: mensagemDoErro(error.message, 'O calendário do mês', MIGRATION) };
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_CALENDARIO));
  return { ok: true, erro: null };
}
