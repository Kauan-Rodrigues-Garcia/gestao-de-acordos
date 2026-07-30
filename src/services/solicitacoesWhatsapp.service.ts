/**
 * solicitacoesWhatsapp.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Solicitações de atendimento por WhatsApp (PaguePlay) — migration 20260730b.
 *
 * Setores que só atendem por ligação pedem ao pessoal do digital que mande uma
 * mensagem para o cliente. O pedido tem dono, status, carimbos de tempo,
 * histórico e uma conversa presa a ele.
 *
 * Regras que NÃO moram aqui, e sim no banco (front não é lugar de garantia):
 *   • limite de 10 pendentes por operador  → trigger fn_wpp_limite_pendentes
 *   • quem vê o quê                        → RLS (operador vê só o dele)
 *   • histórico de status                  → trigger fn_wpp_registrar_evento
 *   • carimbos iniciado_em/finalizado_em   → trigger fn_wpp_carimbos
 */
import { supabase } from '@/lib/supabase';

// ── Tipos ────────────────────────────────────────────────────────────────────

export type CategoriaSolicitacao = 'proposta' | 'preventivo' | 'quebra_acordo' | 'outros';
export type StatusSolicitacao    = 'pendente' | 'em_andamento' | 'feito' | 'falta_info';

export const CATEGORIA_LABEL: Record<CategoriaSolicitacao, string> = {
  proposta:      'Proposta',
  preventivo:    'Preventivo',
  quebra_acordo: 'Quebra de acordo',
  outros:        'Outros',
};

export const STATUS_LABEL: Record<StatusSolicitacao, string> = {
  pendente:     'Pendente',
  em_andamento: 'Em andamento',
  feito:        'Feito',
  falta_info:   'Falta informação',
};

/** Status que ainda pedem alguma ação — a lista "em aberto" da tela. */
export const STATUS_EM_ABERTO: StatusSolicitacao[] = ['pendente', 'em_andamento', 'falta_info'];

/** Teto de pendentes por operador. Espelha o trigger; a tela avisa antes. */
export const MAX_PENDENTES = 10;

/**
 * Janela em que a conversa continua aceitando mensagem depois de o chamado ser
 * fechado. Espelha `fn_wpp_chat_aberto` (migration 20260730d) — mudar aqui sem
 * mudar lá faz a tela oferecer uma caixa de texto que a policy recusa.
 */
export const HORAS_CHAT_APOS_FECHAR = 24;

/**
 * A conversa ainda aceita mensagem nova?
 *
 * O histórico segue LEGÍVEL para sempre — isto governa só a escrita.
 */
export function chatAindaAberto(s: Pick<SolicitacaoWhatsapp, 'status' | 'finalizado_em'>): boolean {
  if (s.status !== 'feito') return true;
  if (!s.finalizado_em) return true;   // carimbo ausente: erra para o lado aberto
  const limite = new Date(s.finalizado_em).getTime() + HORAS_CHAT_APOS_FECHAR * 3_600_000;
  return Date.now() < limite;
}

export interface PessoaResumo {
  id:       string;
  nome:     string;
  foto_url: string | null;
}

export interface SolicitacaoWhatsapp {
  id:             string;
  empresa_id:     string;
  solicitante_id: string;
  setor_id:       string | null;
  equipe_id:      string | null;
  codigo_cliente: string;
  nome_cliente:   string | null;
  estado_uf:      string | null;
  whatsapp:       string;
  categoria:      CategoriaSolicitacao;
  mensagem:       string;
  status:         StatusSolicitacao;
  responsavel_id: string | null;
  iniciado_em:    string | null;
  finalizado_em:  string | null;
  criado_em:      string;
  atualizado_em:  string;
  /** Join: quem abriu. */
  solicitante?:   PessoaResumo | null;
  /** Join: quem está atendendo. */
  responsavel?:   PessoaResumo | null;
}

export interface EventoSolicitacao {
  id:              string;
  solicitacao_id:  string;
  status_anterior: StatusSolicitacao | null;
  status_novo:     StatusSolicitacao;
  autor_id:        string | null;
  criado_em:       string;
  autor?:          PessoaResumo | null;
}

export interface MensagemSolicitacao {
  id:             string;
  solicitacao_id: string;
  autor_id:       string;
  conteudo:       string;
  lida_em:        string | null;
  criado_em:      string;
  autor?:         PessoaResumo | null;
}

export interface ClienteEncontrado {
  nome_cliente: string | null;
  estado_uf:    string | null;
  whatsapp:     string | null;
}

/** Erro de "tabela/função não existe" — migration pendente, não falha real. */
function ehMigrationAusente(mensagem: string): boolean {
  return /relation|does not exist|schema cache|function/i.test(mensagem);
}

/** Mensagem do trigger de limite, traduzida para a tela. */
export function ehErroLimitePendentes(mensagem: string): boolean {
  return mensagem.includes('LIMITE_PENDENTES');
}

// Joins nomeados: `perfis` entra duas vezes, então cada um precisa do apelido
// com o nome da FK, senão o PostgREST não sabe qual coluna usar.
const SELECT_COM_PESSOAS = `
  *,
  solicitante:perfis!solicitacoes_whatsapp_solicitante_id_fkey (id, nome, foto_url),
  responsavel:perfis!solicitacoes_whatsapp_responsavel_id_fkey (id, nome, foto_url)
`;

// ── Solicitações ─────────────────────────────────────────────────────────────

export interface ResultadoSolicitacoes {
  data:    SolicitacaoWhatsapp[];
  /** false = migration 20260730b ainda não aplicada. */
  dbAtiva: boolean;
  erro:    string | null;
}

/**
 * Lista as solicitações visíveis para o usuário atual.
 *
 * Não filtra por papel aqui de propósito: a RLS já devolve só o que a pessoa
 * pode ver (operador → as próprias; líder+/responsável → todas da empresa).
 * Duplicar a regra no cliente só criaria uma segunda verdade para divergir.
 */
export async function buscarSolicitacoes(params: {
  empresaId: string;
  /** Recorte obrigatório para quem enxerga mais de um setor. */
  setorId?:  string | null;
  /** Filtro do líder por equipe. */
  equipeId?: string | null;
}): Promise<ResultadoSolicitacoes> {
  try {
    let q = supabase
      .from('solicitacoes_whatsapp')
      .select(SELECT_COM_PESSOAS)
      .eq('empresa_id', params.empresaId)
      .order('criado_em', { ascending: false });

    if (params.setorId)  q = q.eq('setor_id',  params.setorId);
    if (params.equipeId) q = q.eq('equipe_id', params.equipeId);

    const { data, error } = await q;

    if (error) {
      const pendente = ehMigrationAusente(error.message);
      if (!pendente) console.warn('[solicitacoesWhatsapp] erro na listagem:', error.message);
      return { data: [], dbAtiva: !pendente, erro: pendente ? null : error.message };
    }
    return { data: (data ?? []) as unknown as SolicitacaoWhatsapp[], dbAtiva: true, erro: null };
  } catch (e) {
    return { data: [], dbAtiva: false, erro: e instanceof Error ? e.message : 'Falha de rede' };
  }
}

export interface NovaSolicitacao {
  empresaId:      string;
  solicitanteId:  string;
  setorId:        string | null;
  equipeId:       string | null;
  codigoCliente:  string;
  nomeCliente:    string | null;
  estadoUf:       string | null;
  whatsapp:       string;
  categoria:      CategoriaSolicitacao;
  mensagem:       string;
}

export async function criarSolicitacao(
  nova: NovaSolicitacao,
): Promise<{ ok: boolean; erro: string | null }> {
  try {
    const { error } = await supabase.from('solicitacoes_whatsapp').insert({
      empresa_id:     nova.empresaId,
      solicitante_id: nova.solicitanteId,
      setor_id:       nova.setorId,
      equipe_id:      nova.equipeId,
      codigo_cliente: nova.codigoCliente.trim(),
      nome_cliente:   nova.nomeCliente?.trim() || null,
      estado_uf:      nova.estadoUf?.trim() || null,
      whatsapp:       nova.whatsapp.trim(),
      categoria:      nova.categoria,
      mensagem:       nova.mensagem.trim(),
    });

    if (error) {
      // O trigger de limite chega aqui como exceção do postgres — a tela
      // precisa distinguir isso de "deu erro" genérico.
      if (ehErroLimitePendentes(error.message)) {
        return {
          ok: false,
          erro: `Você já tem ${MAX_PENDENTES} solicitações pendentes. Aguarde o atendimento das atuais.`,
        };
      }
      console.warn('[solicitacoesWhatsapp] erro ao criar:', error.message);
      return { ok: false, erro: error.message };
    }
    return { ok: true, erro: null };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha de rede' };
  }
}

/**
 * Troca o status. `responsavelId` assume o atendimento — o trigger carimba
 * `iniciado_em` e, se vier vazio, grava quem fez a mudança como responsável.
 */
export async function atualizarStatus(params: {
  id:             string;
  status:         StatusSolicitacao;
  responsavelId?: string | null;
}): Promise<{ ok: boolean; erro: string | null }> {
  const patch: Record<string, unknown> = { status: params.status };
  if (params.responsavelId !== undefined) patch.responsavel_id = params.responsavelId;

  const { error } = await supabase
    .from('solicitacoes_whatsapp')
    .update(patch)
    .eq('id', params.id);

  if (error) {
    console.warn('[solicitacoesWhatsapp] erro ao atualizar status:', error.message);
    return { ok: false, erro: error.message };
  }
  return { ok: true, erro: null };
}

/** Edição dos campos do pedido (responsável/líder, ou o dono enquanto pode). */
export async function atualizarSolicitacao(
  id: string,
  campos: Partial<Pick<SolicitacaoWhatsapp,
    'codigo_cliente' | 'nome_cliente' | 'estado_uf' | 'whatsapp' | 'categoria' | 'mensagem'>>,
): Promise<{ ok: boolean; erro: string | null }> {
  const { error } = await supabase.from('solicitacoes_whatsapp').update(campos).eq('id', id);
  if (error) {
    console.warn('[solicitacoesWhatsapp] erro ao editar:', error.message);
    return { ok: false, erro: error.message };
  }
  return { ok: true, erro: null };
}

export async function excluirSolicitacao(id: string): Promise<{ ok: boolean; erro: string | null }> {
  const { error } = await supabase.from('solicitacoes_whatsapp').delete().eq('id', id);
  if (error) {
    console.warn('[solicitacoesWhatsapp] erro ao excluir:', error.message);
    return { ok: false, erro: error.message };
  }
  return { ok: true, erro: null };
}

// ── Histórico ────────────────────────────────────────────────────────────────

export async function buscarEventos(solicitacaoId: string): Promise<EventoSolicitacao[]> {
  const { data, error } = await supabase
    .from('solicitacoes_whatsapp_eventos')
    .select('*, autor:perfis!solicitacoes_whatsapp_eventos_autor_id_fkey (id, nome, foto_url)')
    .eq('solicitacao_id', solicitacaoId)
    .order('criado_em', { ascending: true });

  if (error) {
    console.warn('[solicitacoesWhatsapp] erro no histórico:', error.message);
    return [];
  }
  return (data ?? []) as unknown as EventoSolicitacao[];
}

// ── Mensagens da thread ──────────────────────────────────────────────────────

export async function buscarMensagens(solicitacaoId: string): Promise<MensagemSolicitacao[]> {
  const { data, error } = await supabase
    .from('solicitacoes_whatsapp_mensagens')
    .select('*, autor:perfis!solicitacoes_whatsapp_mensagens_autor_id_fkey (id, nome, foto_url)')
    .eq('solicitacao_id', solicitacaoId)
    .order('criado_em', { ascending: true });

  if (error) {
    console.warn('[solicitacoesWhatsapp] erro nas mensagens:', error.message);
    return [];
  }
  return (data ?? []) as unknown as MensagemSolicitacao[];
}

export async function enviarMensagem(params: {
  empresaId:     string;
  solicitacaoId: string;
  autorId:       string;
  conteudo:      string;
}): Promise<{ ok: boolean; erro: string | null }> {
  const conteudo = params.conteudo.trim();
  if (!conteudo) return { ok: false, erro: 'Mensagem vazia' };

  const { error } = await supabase.from('solicitacoes_whatsapp_mensagens').insert({
    empresa_id:     params.empresaId,
    solicitacao_id: params.solicitacaoId,
    autor_id:       params.autorId,
    conteudo,
  });

  if (error) {
    console.warn('[solicitacoesWhatsapp] erro ao enviar mensagem:', error.message);
    return { ok: false, erro: error.message };
  }
  return { ok: true, erro: null };
}

/**
 * Carimba como lidas as mensagens da thread escritas por OUTRA pessoa.
 *
 * O filtro `autor_id <> eu` é o mesmo da policy de UPDATE: sem ele o autor
 * marcaria a própria mensagem e o recibo de leitura viraria mentira.
 */
export async function marcarMensagensLidas(params: {
  solicitacaoId: string;
  usuarioId:     string;
}): Promise<void> {
  const { error } = await supabase
    .from('solicitacoes_whatsapp_mensagens')
    .update({ lida_em: new Date().toISOString() })
    .eq('solicitacao_id', params.solicitacaoId)
    .neq('autor_id', params.usuarioId)
    .is('lida_em', null);

  if (error) console.warn('[solicitacoesWhatsapp] erro ao marcar lidas:', error.message);
}

// ── Responsáveis ─────────────────────────────────────────────────────────────

export async function buscarResponsaveis(empresaId: string): Promise<PessoaResumo[]> {
  const { data, error } = await supabase
    .from('atendimento_responsaveis')
    .select('usuario:perfis!atendimento_responsaveis_usuario_id_fkey (id, nome, foto_url)')
    .eq('empresa_id', empresaId);

  if (error) {
    console.warn('[solicitacoesWhatsapp] erro ao listar responsáveis:', error.message);
    return [];
  }
  return ((data ?? []) as unknown as { usuario: PessoaResumo | null }[])
    .map(r => r.usuario)
    .filter((p): p is PessoaResumo => !!p);
}

export async function definirResponsavel(params: {
  empresaId:   string;
  usuarioId:   string;
  definidoPor: string;
}): Promise<{ ok: boolean; erro: string | null }> {
  const { error } = await supabase.from('atendimento_responsaveis').insert({
    empresa_id:   params.empresaId,
    usuario_id:   params.usuarioId,
    definido_por: params.definidoPor,
  });
  if (error) {
    // Já é responsável — clique repetido não é erro para o usuário.
    if (/duplicate key|unique/i.test(error.message)) return { ok: true, erro: null };
    console.warn('[solicitacoesWhatsapp] erro ao definir responsável:', error.message);
    return { ok: false, erro: error.message };
  }
  return { ok: true, erro: null };
}

export async function removerResponsavel(params: {
  empresaId: string;
  usuarioId: string;
}): Promise<{ ok: boolean; erro: string | null }> {
  const { error } = await supabase
    .from('atendimento_responsaveis')
    .delete()
    .eq('empresa_id', params.empresaId)
    .eq('usuario_id', params.usuarioId);
  if (error) {
    console.warn('[solicitacoesWhatsapp] erro ao remover responsável:', error.message);
    return { ok: false, erro: error.message };
  }
  return { ok: true, erro: null };
}

// ── Auto-preenchimento pelo código do cliente ────────────────────────────────

/**
 * Busca nome/estado/telefone pelo código, na tabela `profissionais`.
 *
 * ⚠️  `profissionais` é o cadastro CANÔNICO do cliente — `acordos` é cópia (a
 * migration 20260621_backfill_profissionais preencheu `acordos` a partir dela).
 * A primeira versão desta função lia `acordos`, e por isso não achava nenhum
 * cliente que ainda não tivesse acordo: exatamente o caso comum aqui, já que o
 * operador pede a mensagem ANTES de fechar acordo. Corrigido na 20260730c.
 *
 * É a mesma consulta do formulário de novo acordo (hook `useProfissional`).
 */
export async function buscarClientePorCodigo(
  codigo: string,
  empresaId: string,
): Promise<ClienteEncontrado | null> {
  const limpo = codigo.trim();
  if (!limpo || !empresaId) return null;

  try {
    const { data, error } = await supabase
      .from('profissionais')
      .select('nome, estado_uf, telefone')
      .eq('codigo', limpo)
      .eq('empresa_id', empresaId)
      .maybeSingle();

    if (error) {
      if (!ehMigrationAusente(error.message)) {
        console.warn('[solicitacoesWhatsapp] erro na busca do cliente:', error.message);
      }
      return null;
    }
    if (!data) return null;

    const linha = data as { nome: string | null; estado_uf: string | null; telefone: string | null };
    return {
      nome_cliente: linha.nome ?? null,
      estado_uf:    linha.estado_uf ?? null,
      whatsapp:     linha.telefone ?? null,
    };
  } catch {
    return null;
  }
}
