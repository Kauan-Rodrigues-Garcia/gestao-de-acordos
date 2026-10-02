/**
 * metasVendas.service.ts — a meta do Comercial, com a régua que decide.
 *
 * ## Por que não usa a RPC de metas da cobrança
 *
 * `fn_metas_upsert` serve a tela de Metas da cobrança, com quartis, dias úteis,
 * metas extras, validação por setor e treinamento de equipe. Estendê-la para
 * caber a régua amarraria uma tela de 1.573 linhas a outra que ainda está
 * nascendo — e o primeiro ajuste de qualquer lado quebraria o outro.
 *
 * `fn_vendas_meta_salvar` grava na MESMA tabela `metas`, na mesma linha, com a
 * mesma chave. O que é próprio é só o caminho de escrita e a régua.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { ReguaMeta } from '@/lib/vendasMeta';
import { mensagemDoErro } from './erroDoBanco';

/** Um setor ou equipe, com a meta do mês — ou sem, se ninguém configurou. */
export interface MetaDeRecorte {
  tipo: 'setor' | 'equipe';
  referencia_id: string;
  nome: string;
  setor_id: string | null;
  setor_nome: string | null;
  regua: ReguaMeta | null;
  quantidade: number;
  valor: number;
}

export interface Resultado<T = null> {
  ok: boolean;
  dado: T | null;
  erro: string | null;
}

/** Ver `erroDoBanco.ts`: vínculo que falta não é tabela que falta. */
function traduzir(mensagem: string): string {
  return mensagemDoErro(mensagem, 'A meta de vendas', '20260915140000_vendas_fase5_meta_com_duas_reguas.sql');
}

function num(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Todo setor e toda equipe do mês, com ou sem meta.
 *
 * Quem não tem meta vem com `regua: null` e zeros — é assim que a tela mostra
 * o que falta configurar em vez de escondê-lo.
 */
export async function buscarMetasDoMes(
  empresaId: string, ano: number, mes: number,
): Promise<Resultado<MetaDeRecorte[]>> {
  const { data, error } = await rpcSemTipo<MetaDeRecorte[]>('fn_vendas_metas_do_mes', {
    p_empresa_id: empresaId, p_ano: ano, p_mes: mes,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };

  const linhas = (Array.isArray(data) ? data : []).map(l => ({
    ...l,
    quantidade: num(l.quantidade),
    valor:      num(l.valor),
  }));
  return { ok: true, dado: linhas, erro: null };
}

/**
 * A meta de UMA pessoa no mês (`metas.tipo = 'operador'`), desde 02/10/2026.
 *
 * Quem tem meta individual é medido por ela; quem não tem continua medido pela
 * parte dele na meta da equipe (ou do setor). Ver `QuartisComercial`.
 */
export interface MetaIndividual {
  perfil_id: string;
  nome: string;
  equipe_id: string | null;
  setor_id: string | null;
  regua: ReguaMeta | null;
  quantidade: number;
  valor: number;
}

/**
 * As metas individuais do mês. Com `ver_metas_vendas`, de todos; sem, só a
 * própria. Sem a migration 20261002120000 a RPC não existe e a lista volta
 * vazia — a tela segue com a parte na meta do time, como antes.
 */
export async function buscarMetasIndividuaisDoMes(
  empresaId: string, ano: number, mes: number,
): Promise<Resultado<MetaIndividual[]>> {
  const { data, error } = await rpcSemTipo<MetaIndividual[]>('fn_vendas_metas_individuais_do_mes', {
    p_empresa_id: empresaId, p_ano: ano, p_mes: mes,
  });
  if (error) {
    return {
      ok: false, dado: null,
      erro: mensagemDoErro(error.message, 'A meta individual', '20261002120000_vendas_meta_individual.sql'),
    };
  }

  const linhas = (Array.isArray(data) ? data : []).map(l => ({
    ...l,
    quantidade: num(l.quantidade),
    valor:      num(l.valor),
  }));
  return { ok: true, dado: linhas, erro: null };
}

/**
 * Grava a meta de um recorte.
 *
 * `regua: null` com as duas metas em zero **apaga** a linha — meta vazia não
 * informa nada. Escolher uma régua sem preencher a meta dela é recusado pelo
 * banco: uma meta de zero «bate» sozinha no primeiro dia do mês.
 */
export async function salvarMeta(params: {
  empresaId: string;
  /** `operador` = meta individual (02/10/2026); a RPC aceita desde a Fase 5. */
  tipo: 'setor' | 'equipe' | 'operador';
  referenciaId: string;
  ano: number;
  mes: number;
  regua: ReguaMeta | null;
  quantidade: number;
  valor: number;
}): Promise<Resultado<string>> {
  const { data, error } = await rpcSemTipo<string>('fn_vendas_meta_salvar', {
    p_empresa_id:    params.empresaId,
    p_tipo:          params.tipo,
    p_referencia_id: params.referenciaId,
    p_ano:           params.ano,
    p_mes:           params.mes,
    p_regua:         params.regua,
    p_quantidade:    params.quantidade,
    p_valor:         params.valor,
  });
  if (error) return { ok: false, dado: null, erro: traduzir(error.message) };
  return { ok: true, dado: data ?? null, erro: null };
}
