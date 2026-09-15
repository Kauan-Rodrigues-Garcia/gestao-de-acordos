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

const NAO_INSTALADO =
  'A meta de vendas não respondeu. Recarregue a página — se persistir, ou a migration '
  + 'não foi aplicada, ou o cache de schema do banco ainda não recarregou.';

function tabelaAusente(mensagem: string): boolean {
  return /relation|does not exist|schema cache|could not find/i.test(mensagem);
}

function traduzir(mensagem: string): string {
  return tabelaAusente(mensagem) ? NAO_INSTALADO : mensagem;
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
 * Grava a meta de um recorte.
 *
 * `regua: null` com as duas metas em zero **apaga** a linha — meta vazia não
 * informa nada. Escolher uma régua sem preencher a meta dela é recusado pelo
 * banco: uma meta de zero «bate» sozinha no primeiro dia do mês.
 */
export async function salvarMeta(params: {
  empresaId: string;
  tipo: 'setor' | 'equipe';
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
