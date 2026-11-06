/**
 * ouvidoriaCofen.service.ts — o banco da aba Ouvidoria da regra Cofen
 * (migration 20261106150000).
 *
 *   fn_ouvidoria_cofen_setores        os setores Cofen que a pessoa alcança, e se gerencia.
 *   fn_ouvidoria_cofen_listar         as manifestações do setor.
 *   fn_ouvidoria_cofen_salvar         cria ou atualiza (o formulário inteiro).
 *   fn_ouvidoria_cofen_excluir        só quem gerencia.
 *   fn_ouvidoria_cofen_andamentos     a linha do tempo de uma manifestação.
 *   fn_ouvidoria_cofen_anotar         acrescenta um andamento escrito.
 *   fn_ouvidoria_cofen_pessoas        quem do setor atende, e de onde vem o acesso.
 *   fn_ouvidoria_cofen_definir_acesso libera ou tira um atendente (exceção por pessoa).
 *
 * As tabelas não têm acesso direto: tudo passa pelas funções. Ainda não estão
 * nos tipos gerados, daí `rpcSemTipo`.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type {
  Andamento, Manifestacao, OrigemAcesso, PessoaOuvidoria, SetorOuvidoria,
} from '@/pages/Ouvidoria/ouvidoria';

/** Erro do banco numa frase para a tela. */
function falhar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * Os setores da pessoa. `null` quando a leitura falha — quase sempre a
 * migration ainda não aplicada (a função não existe).
 */
export async function listarSetores(): Promise<SetorOuvidoria[] | null> {
  const { data, error } = await rpcSemTipo<SetorOuvidoria[]>('fn_ouvidoria_cofen_setores', {});
  if (error) return null;
  return data ?? [];
}

export async function listarManifestacoes(setorId: string): Promise<Manifestacao[]> {
  const { data, error } = await rpcSemTipo<Manifestacao[]>('fn_ouvidoria_cofen_listar', { p_setor_id: setorId });
  falhar(error);
  return data ?? [];
}

/** O que o formulário manda. O código do cliente vai só em dígitos. */
export interface DadosManifestacao {
  data_manifestacao: string;
  canal: string;
  nome_profissional: string;
  codigo_cliente: string | null;
  conselho_uf: string | null;
  assunto: string;
  descricao: string;
  anuidades: number[];
  situacao_financeira: string | null;
  providencia: string | null;
  responsavel_id: string | null;
  data_resposta: string | null;
  status: string;
  acompanhar: boolean;
  observacoes: string | null;
}

export async function salvarManifestacao(
  setorId: string, id: string | null, dados: DadosManifestacao,
): Promise<Manifestacao> {
  const { data, error } = await rpcSemTipo<Manifestacao>('fn_ouvidoria_cofen_salvar', {
    p_setor_id: setorId, p_id: id, p_dados: dados,
  });
  falhar(error);
  return data as Manifestacao;
}

export async function excluirManifestacao(id: string): Promise<void> {
  const { error } = await rpcSemTipo('fn_ouvidoria_cofen_excluir', { p_id: id });
  falhar(error);
}

export async function listarAndamentos(id: string): Promise<Andamento[]> {
  const { data, error } = await rpcSemTipo<Andamento[]>('fn_ouvidoria_cofen_andamentos', { p_id: id });
  falhar(error);
  return data ?? [];
}

export async function anotar(id: string, texto: string): Promise<void> {
  const { error } = await rpcSemTipo('fn_ouvidoria_cofen_anotar', { p_id: id, p_texto: texto });
  falhar(error);
}

export async function listarPessoas(setorId: string): Promise<PessoaOuvidoria[]> {
  const { data, error } = await rpcSemTipo<PessoaOuvidoria[]>('fn_ouvidoria_cofen_pessoas', { p_setor_id: setorId });
  falhar(error);
  return data ?? [];
}

export async function definirAcesso(setorId: string, perfilId: string, liberar: boolean): Promise<OrigemAcesso> {
  const { data, error } = await rpcSemTipo<OrigemAcesso>('fn_ouvidoria_cofen_definir_acesso', {
    p_setor_id: setorId, p_perfil_id: perfilId, p_liberar: liberar,
  });
  falhar(error);
  return data as OrigemAcesso;
}
