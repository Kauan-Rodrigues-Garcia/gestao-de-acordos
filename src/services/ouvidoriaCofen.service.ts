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
 * E de 20261109120000: agendar_retorno / retorno_dado, encaminhamento
 * (ciência, resposta, visto), ticket, etiquetas e grupos.
 *
 * As tabelas não têm acesso direto: tudo passa pelas funções. Ainda não estão
 * nos tipos gerados, daí `rpcSemTipo`.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type {
  Andamento, CorEtiqueta, Etiqueta, Grupo, Manifestacao, OrigemAcesso, PessoaOuvidoria, SetorOuvidoria,
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
  // 20261109120000: sem a chave, o banco mantém o que estava.
  anuidades_etiquetas?: Record<string, string>;
  precisa_ticket?: boolean;
  ticket_pedido?: string | null;
  /** Só vale ao criar (nascer dentro do grupo). Mover depois: `moverParaGrupo`. */
  grupo_id?: string | null;
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

// ── 20261109120000: retorno agendado, encaminhamento, ticket, etiquetas, grupos ──

/** Marca (`quando` ISO) ou cancela (`null`) o retorno agendado. */
export async function agendarRetorno(id: string, quando: string | null, nota: string | null): Promise<Manifestacao> {
  const { data, error } = await rpcSemTipo<Manifestacao>('fn_ouvidoria_cofen_agendar_retorno', {
    p_id: id, p_quando: quando, p_nota: nota,
  });
  falhar(error);
  return data as Manifestacao;
}

/** O retorno foi dado ao profissional hoje (tira o agendamento). */
export async function retornoDado(id: string, texto: string | null): Promise<Manifestacao> {
  const { data, error } = await rpcSemTipo<Manifestacao>('fn_ouvidoria_cofen_retorno_dado', { p_id: id, p_texto: texto });
  falhar(error);
  return data as Manifestacao;
}

/** `ciente` e `responder` são de quem recebeu; `visto` é de quem registrou. */
export async function encaminhamento(
  id: string, acao: 'ciente' | 'responder' | 'visto', texto: string | null = null,
): Promise<Manifestacao> {
  const { data, error } = await rpcSemTipo<Manifestacao>('fn_ouvidoria_cofen_encaminhamento', {
    p_id: id, p_acao: acao, p_texto: texto,
  });
  falhar(error);
  return data as Manifestacao;
}

export async function acaoTicket(
  id: string, acao: 'pedir' | 'abrir' | 'cancelar', numero: string | null = null, pedido: string | null = null,
): Promise<Manifestacao> {
  const { data, error } = await rpcSemTipo<Manifestacao>('fn_ouvidoria_cofen_ticket', {
    p_id: id, p_acao: acao, p_numero: numero, p_pedido: pedido,
  });
  falhar(error);
  return data as Manifestacao;
}

/**
 * A legenda de cores do setor. `null` quando a leitura falha — quase sempre a
 * migration 20261109120000 ainda não aplicada; a tela usa isso para esconder
 * o que depende dela.
 */
export async function listarEtiquetas(setorId: string): Promise<Etiqueta[] | null> {
  const { data, error } = await rpcSemTipo<Etiqueta[]>('fn_ouvidoria_cofen_etiquetas', { p_setor_id: setorId });
  if (error) return null;
  return data ?? [];
}

export async function salvarEtiqueta(setorId: string, id: string | null, nome: string, cor: CorEtiqueta): Promise<Etiqueta> {
  const { data, error } = await rpcSemTipo<Etiqueta>('fn_ouvidoria_cofen_etiqueta_salvar', {
    p_setor_id: setorId, p_id: id, p_nome: nome, p_cor: cor,
  });
  falhar(error);
  return data as Etiqueta;
}

export async function excluirEtiqueta(id: string): Promise<void> {
  const { error } = await rpcSemTipo('fn_ouvidoria_cofen_etiqueta_excluir', { p_id: id });
  falhar(error);
}

/** Os grupos do setor. `[]` se a migration 20261109120000 ainda não está no banco. */
export async function listarGrupos(setorId: string): Promise<Grupo[]> {
  const { data, error } = await rpcSemTipo<Grupo[]>('fn_ouvidoria_cofen_grupos', { p_setor_id: setorId });
  if (error) return [];
  return data ?? [];
}

export interface DadosGrupo {
  titulo: string;
  assunto: string;
  canal: string | null;
  descricao: string;
  providencia: string | null;
  responsavel_id: string | null;
  encerrado: boolean;
}

export async function salvarGrupo(setorId: string, id: string | null, dados: DadosGrupo): Promise<Grupo> {
  const { data, error } = await rpcSemTipo<Grupo>('fn_ouvidoria_cofen_grupo_salvar', {
    p_setor_id: setorId, p_id: id, p_dados: dados,
  });
  falhar(error);
  return data as Grupo;
}

/** Põe a manifestação no grupo (`grupoId`) ou tira (`null`). */
export async function moverParaGrupo(id: string, grupoId: string | null): Promise<Manifestacao> {
  const { data, error } = await rpcSemTipo<Manifestacao>('fn_ouvidoria_cofen_grupo_mover', { p_id: id, p_grupo_id: grupoId });
  falhar(error);
  return data as Manifestacao;
}

export async function excluirGrupo(id: string): Promise<void> {
  const { error } = await rpcSemTipo('fn_ouvidoria_cofen_grupo_excluir', { p_grupo_id: id });
  falhar(error);
}

export async function definirAcesso(setorId: string, perfilId: string, liberar: boolean): Promise<OrigemAcesso> {
  const { data, error } = await rpcSemTipo<OrigemAcesso>('fn_ouvidoria_cofen_definir_acesso', {
    p_setor_id: setorId, p_perfil_id: perfilId, p_liberar: liberar,
  });
  falhar(error);
  return data as OrigemAcesso;
}
