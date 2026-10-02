/**
 * iaVendas.service.ts — o cadastro das IAs do Comercial e os vínculos delas.
 *
 * Migration `20261001150000_vendas_ia_vinculos.sql`. A regra do crédito mora em
 * `@/lib/vendasIa`; aqui só se lê e se grava.
 *
 * ## Por que o cadastro tem cache
 *
 * Toda busca de vendas credita a lista antes de devolvê-la (`vendas.service`),
 * e uma tela faz três ou quatro buscas ao abrir. O cadastro das IAs muda
 * quando alguém troca um vínculo — uma vez por mês, se tanto. Um cache curto
 * evita perguntar a mesma coisa quatro vezes, e quem grava aqui o invalida
 * na hora.
 *
 * ## Sem a migration, nada quebra
 *
 * Se `fn_vendas_ia_cadastro` não existir, o índice vem vazio: nenhuma venda é
 * creditada a ninguém, e as telas mostram o que mostravam antes.
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import {
  agruparCadastroIa, indexarIas,
  type IaDoCadastro, type IndiceIas, type LinhaCadastroIa,
} from '@/lib/vendasIa';
import { mensagemDoErro, pareceNaoInstalado } from './erroDoBanco';

const MIGRATION = '20261001150000_vendas_ia_vinculos.sql';
const VALIDADE_MS = 30_000;

export interface CadastroDeIas {
  ias: IaDoCadastro[];
  indice: IndiceIas;
  /** `false` enquanto a migration não for aplicada. */
  disponivel: boolean;
  erro: string | null;
}

export interface TipoDeIa {
  id: string;
  nome: string;
  ordem: number;
}

const VAZIO: CadastroDeIas = { ias: [], indice: new Map(), disponivel: true, erro: null };

const cache = new Map<string, { em: number; promessa: Promise<CadastroDeIas> }>();

/** Esquece o cadastro em memória — chamado por toda escrita deste módulo. */
export function esquecerCadastroDeIas(empresaId?: string): void {
  if (empresaId) cache.delete(empresaId); else cache.clear();
}

async function carregarCadastro(empresaId: string): Promise<CadastroDeIas> {
  const { data, error } = await rpcSemTipo<LinhaCadastroIa[]>(
    'fn_vendas_ia_cadastro', { p_empresa_id: empresaId },
  );
  if (error) {
    return {
      ...VAZIO,
      disponivel: !pareceNaoInstalado(error.message),
      erro: mensagemDoErro(error.message, 'O cadastro das IAs', MIGRATION),
    };
  }
  const ias = agruparCadastroIa(Array.isArray(data) ? data : []);
  return { ias, indice: indexarIas(ias), disponivel: true, erro: null };
}

/** O cadastro das IAs da empresa, com os períodos de vínculo. */
export function buscarCadastroDeIas(empresaId: string): Promise<CadastroDeIas> {
  const agora = Date.now();
  const guardado = cache.get(empresaId);
  if (guardado && agora - guardado.em < VALIDADE_MS) return guardado.promessa;

  const promessa = carregarCadastro(empresaId).then(r => {
    // Erro não fica em cache: a próxima tela tenta de novo.
    if (r.erro) cache.delete(empresaId);
    return r;
  });
  cache.set(empresaId, { em: agora, promessa });
  return promessa;
}

/**
 * A lista da aba IAs, recortada pelo alcance de quem olha (`ias_escopo_*`).
 *
 * Migration 20261002160000. O cadastro de cima continua inteiro porque é dele
 * que sai o crédito das vendas; esta é só a lista que a aba mostra. Sem a
 * migration, cai no cadastro inteiro — o comportamento de antes — e avisa.
 */
export async function buscarIasDaAba(empresaId: string): Promise<CadastroDeIas> {
  const { data, error } = await rpcSemTipo<LinhaCadastroIa[]>(
    'fn_vendas_ias_da_aba', { p_empresa_id: empresaId },
  );
  if (error) {
    if (pareceNaoInstalado(error.message)) {
      const inteiro = await buscarCadastroDeIas(empresaId);
      return {
        ...inteiro,
        erro: inteiro.erro ?? 'A separação das IAs por setor ainda não está no banco '
          + '(migration 20261002160000_vendas_ias_por_setor.sql): a lista mostra todas as IAs da empresa.',
      };
    }
    return { ...VAZIO, erro: mensagemDoErro(error.message, 'A lista de IAs', '20261002160000_vendas_ias_por_setor.sql') };
  }
  const ias = agruparCadastroIa(Array.isArray(data) ? data : []);
  return { ias, indice: indexarIas(ias), disponivel: true, erro: null };
}

/** Só o índice, para creditar uma lista de vendas. Erro vira índice vazio. */
export async function indiceDeIas(empresaId: string): Promise<IndiceIas> {
  return (await buscarCadastroDeIas(empresaId)).indice;
}

export async function buscarTiposDeIa(empresaId: string): Promise<TipoDeIa[]> {
  const { data, error } = await tabelaSemTipo<TipoDeIa>('vendas_ia_tipos')
    .select('id, nome, ordem')
    .eq('empresa_id', empresaId)
    .order('ordem', { ascending: true });
  if (error || !data) return [];
  return data;
}

export interface ResultadoIa {
  ok: boolean;
  erro: string | null;
}

function resultado(error: { message: string } | null, oQue: string): ResultadoIa {
  if (!error) return { ok: true, erro: null };
  return { ok: false, erro: mensagemDoErro(error.message, oQue, MIGRATION) };
}

/**
 * Vincula, troca ou desvincula (`operadorId = null`) a partir de `desde`.
 *
 * `desde` já vem resolvido por quem chama: «mês inteiro» é o dia 1 do mês
 * (`inicioDoMes`), «a partir da data» é a data escolhida.
 */
export async function vincularIa(params: {
  empresaId: string;
  iaId: string;
  operadorId: string | null;
  desde: string;
}): Promise<ResultadoIa> {
  const { error } = await rpcSemTipo('fn_vendas_ia_vincular', {
    p_ia_id: params.iaId,
    p_operador_id: params.operadorId,
    p_desde: params.desde,
  });
  esquecerCadastroDeIas(params.empresaId);
  return resultado(error, 'O vínculo da IA');
}

export async function definirTipoDaIa(params: {
  empresaId: string;
  iaId: string;
  tipoId: string | null;
}): Promise<ResultadoIa> {
  const { error } = await rpcSemTipo('fn_vendas_ia_definir_tipo', {
    p_ia_id: params.iaId, p_tipo_id: params.tipoId,
  });
  esquecerCadastroDeIas(params.empresaId);
  return resultado(error, 'O tipo da IA');
}

export async function criarTipoDeIa(empresaId: string, nome: string): Promise<ResultadoIa> {
  const { error } = await rpcSemTipo<string>('fn_vendas_ia_tipo_criar', {
    p_empresa_id: empresaId, p_nome: nome,
  });
  esquecerCadastroDeIas(empresaId);
  return resultado(error, 'O tipo de IA');
}
