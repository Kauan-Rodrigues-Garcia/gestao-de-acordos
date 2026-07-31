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
import type { Leitura } from '@/pages/SolicitacoesWhatsapp/leitura';

export type { Leitura };

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
  /** 'status' = mudou o andamento; 'responsavel' = o atendimento trocou de dono. */
  tipo:            'status' | 'responsavel';
  status_anterior: StatusSolicitacao | null;
  status_novo:     StatusSolicitacao;
  responsavel_anterior: string | null;
  responsavel_novo:     string | null;
  autor_id:        string | null;
  criado_em:       string;
  autor?:          PessoaResumo | null;
  /** Resolvidos pelo diretório, como `autor`. */
  de?:             PessoaResumo | null;
  para?:           PessoaResumo | null;
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

// ── Diretório de pessoas ─────────────────────────────────────────────────────
//
// Nome e foto NÃO vêm mais de join em `perfis`. A policy `perfis_select` só
// deixa 'lider' e 'administrador' lerem o perfil de outra pessoa, e join no
// PostgREST respeita a RLS da tabela juntada — então para operador, elite,
// gerência e diretoria o join voltava NULO e o card ficava sem dono.
//
// A RPC `fn_wpp_diretorio` (migration 20260730e) devolve só id/nome/foto da
// empresa do chamador. Ver o comentário da migration para o raciocínio de
// segurança.

/** Cache por empresa: a lista muda pouco e várias telas pedem ao mesmo tempo. */
const diretorioEmVoo = new Map<string, Promise<Map<string, PessoaResumo>>>();

// Sem parâmetro: a RPC resolve a empresa pela sessão (`fn_user_empresa_id()`),
// então não há o que passar. O `empresaId` do `buscarDiretorio` serve só de
// chave de cache — se o usuário trocar de empresa (impersonação), a chave muda
// e a lista é buscada de novo.
async function carregarDiretorio(): Promise<Map<string, PessoaResumo>> {
  const { data, error } = await supabase.rpc('fn_wpp_diretorio');
  if (error) {
    if (!ehMigrationAusente(error.message)) {
      console.warn('[solicitacoesWhatsapp] erro no diretório:', error.message);
    }
    return new Map();
  }
  const mapa = new Map<string, PessoaResumo>();
  for (const p of (data ?? []) as PessoaResumo[]) {
    mapa.set(p.id, { id: p.id, nome: p.nome, foto_url: p.foto_url ?? null });
  }
  return mapa;
}

/**
 * Diretório da empresa: `id → { nome, foto_url }`.
 *
 * Deduplicado por empresa enquanto a requisição está em voo, para que a lista e
 * o chat não peçam a mesma coisa duas vezes ao abrir a aba.
 */
export function buscarDiretorio(empresaId: string): Promise<Map<string, PessoaResumo>> {
  const emVoo = diretorioEmVoo.get(empresaId);
  if (emVoo) return emVoo;

  const promessa = carregarDiretorio()
    .catch(() => new Map<string, PessoaResumo>())
    .finally(() => { diretorioEmVoo.delete(empresaId); });

  diretorioEmVoo.set(empresaId, promessa);
  return promessa;
}

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
      .select('*')
      .eq('empresa_id', params.empresaId)
      .order('criado_em', { ascending: false });

    if (params.setorId)  q = q.eq('setor_id',  params.setorId);
    if (params.equipeId) q = q.eq('equipe_id', params.equipeId);

    // O diretório vai junto: sem ele o card não sabe de quem é o pedido.
    const [{ data, error }, pessoas] = await Promise.all([
      q,
      buscarDiretorio(params.empresaId),
    ]);

    if (error) {
      const pendente = ehMigrationAusente(error.message);
      if (!pendente) console.warn('[solicitacoesWhatsapp] erro na listagem:', error.message);
      return { data: [], dbAtiva: !pendente, erro: pendente ? null : error.message };
    }

    const linhas = ((data ?? []) as unknown as SolicitacaoWhatsapp[]).map(s => ({
      ...s,
      solicitante: pessoas.get(s.solicitante_id) ?? null,
      responsavel: s.responsavel_id ? pessoas.get(s.responsavel_id) ?? null : null,
    }));

    return { data: linhas, dbAtiva: true, erro: null };
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

/**
 * Só os DOIS envolvidos escrevem na conversa: quem abriu e quem atende AGORA.
 *
 * Espelha `fn_wpp_pode_falar` (migration 20260730f). Líder e demais responsáveis
 * continuam LENDO — a caixa de texto some para eles, o histórico não.
 */
export function podeFalarNaConversa(
  s: Pick<SolicitacaoWhatsapp, 'solicitante_id' | 'responsavel_id'>,
  usuarioId: string | null,
): boolean {
  if (!usuarioId) return false;
  return s.solicitante_id === usuarioId || s.responsavel_id === usuarioId;
}

/**
 * Transfere o atendimento para outra pessoa.
 *
 * O status não muda de propósito: transferir um 'falta_info' não deve reabrir o
 * atendimento, só trocar quem responde. O trigger registra a troca no histórico
 * e, com ela, a voz na conversa passa para quem assumiu.
 */
export async function transferirAtendimento(params: {
  id:                string;
  novoResponsavelId: string;
}): Promise<{ ok: boolean; erro: string | null }> {
  const { error } = await supabase
    .from('solicitacoes_whatsapp')
    .update({ responsavel_id: params.novoResponsavelId })
    .eq('id', params.id);

  if (error) {
    console.warn('[solicitacoesWhatsapp] erro ao transferir:', error.message);
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

export async function buscarEventos(
  solicitacaoId: string,
  empresaId: string,
): Promise<EventoSolicitacao[]> {
  const [{ data, error }, pessoas] = await Promise.all([
    supabase
      .from('solicitacoes_whatsapp_eventos')
      .select('*')
      .eq('solicitacao_id', solicitacaoId)
      .order('criado_em', { ascending: true }),
    buscarDiretorio(empresaId),
  ]);

  if (error) {
    console.warn('[solicitacoesWhatsapp] erro no histórico:', error.message);
    return [];
  }
  return ((data ?? []) as unknown as EventoSolicitacao[]).map(e => ({
    ...e,
    autor: e.autor_id ? pessoas.get(e.autor_id) ?? null : null,
    de:    e.responsavel_anterior ? pessoas.get(e.responsavel_anterior) ?? null : null,
    para:  e.responsavel_novo     ? pessoas.get(e.responsavel_novo)     ?? null : null,
  }));
}

// ── Mensagens da thread ──────────────────────────────────────────────────────

export async function buscarMensagens(
  solicitacaoId: string,
  empresaId: string,
): Promise<MensagemSolicitacao[]> {
  const [{ data, error }, pessoas] = await Promise.all([
    supabase
      .from('solicitacoes_whatsapp_mensagens')
      .select('*')
      .eq('solicitacao_id', solicitacaoId)
      .order('criado_em', { ascending: true }),
    buscarDiretorio(empresaId),
  ]);

  if (error) {
    console.warn('[solicitacoesWhatsapp] erro nas mensagens:', error.message);
    return [];
  }
  return ((data ?? []) as unknown as MensagemSolicitacao[]).map(m => ({
    ...m,
    autor: pessoas.get(m.autor_id) ?? null,
  }));
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

// ── Leitura por pessoa (migration 20260731d) ─────────────────────────────────

/**
 * Avança o MEU cursor de leitura desta conversa até agora.
 *
 * Substituiu o carimbo `lida_em`, que era por mensagem: bastava um líder abrir
 * a conversa para a bolinha sumir da tela do responsável, que não tinha lido
 * nada. Agora cada pessoa tem a própria linha e ninguém mexe na do outro — a
 * policy `sol_wpp_leitura_insert/update` exige `usuario_id = auth.uid()`.
 */
export async function marcarConversaLida(params: {
  empresaId:     string;
  solicitacaoId: string;
  usuarioId:     string;
}): Promise<void> {
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from('solicitacoes_whatsapp_leitura')
    .upsert({
      empresa_id:     params.empresaId,
      solicitacao_id: params.solicitacaoId,
      usuario_id:     params.usuarioId,
      lido_ate:       agora,
      atualizado_em:  agora,
    }, { onConflict: 'solicitacao_id,usuario_id' });

  if (error) console.warn('[solicitacoesWhatsapp] erro ao marcar conversa lida:', error.message);
}

/** Cursores de leitura da empresa — os meus alimentam o badge, os outros o ✓✓. */
export async function buscarLeituras(empresaId: string): Promise<Leitura[]> {
  const { data, error } = await supabase
    .from('solicitacoes_whatsapp_leitura')
    .select('solicitacao_id, usuario_id, lido_ate')
    .eq('empresa_id', empresaId);

  if (error) {
    console.warn('[solicitacoesWhatsapp] erro nas leituras:', error.message);
    return [];
  }
  return (data ?? []) as Leitura[];
}

// ── Responsáveis ─────────────────────────────────────────────────────────────

export async function buscarResponsaveis(empresaId: string): Promise<PessoaResumo[]> {
  // Mesmo motivo da listagem: o join em `perfis` voltava nulo para quem não é
  // lider/administrador, e o painel de responsáveis aparecia vazio justamente
  // para o operador que precisa saber a quem recorrer.
  const [{ data, error }, pessoas] = await Promise.all([
    supabase
      .from('atendimento_responsaveis')
      .select('usuario_id')
      .eq('empresa_id', empresaId),
    buscarDiretorio(empresaId),
  ]);

  if (error) {
    console.warn('[solicitacoesWhatsapp] erro ao listar responsáveis:', error.message);
    return [];
  }
  return ((data ?? []) as { usuario_id: string }[])
    .map(r => pessoas.get(r.usuario_id))
    .filter((p): p is PessoaResumo => !!p)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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
