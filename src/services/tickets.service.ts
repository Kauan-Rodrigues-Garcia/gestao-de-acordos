/**
 * tickets.service.ts — a fila de pedidos da liderança.
 *
 * Toda a regra de QUEM VÊ O QUÊ mora na RLS (migration 20260819100000), não
 * aqui: as consultas abaixo pedem "os tickets da empresa" e o banco devolve os
 * que a pessoa pode ver. Repetir o recorte no cliente criaria duas verdades, e
 * a que engana é sempre a do cliente.
 *
 * O mesmo vale para trilha e notificação: são gatilhos. Este arquivo escreve o
 * ticket e a mensagem; quem avisa quem é assunto do banco.
 *
 * ## Sobre o cliente sem tipo
 *
 * `database.types.ts` é gerado do banco e ainda não conhece estas tabelas.
 * `tabelaSemTipo` só faz leitura de propósito, e aqui é preciso gravar — daí o
 * `db()` local. Quando os tipos forem regenerados, trocar por
 * `supabase.from('tickets')` é substituição direta.
 */
import { supabase } from '@/lib/supabase';
import type { StatusTicket, PrioridadeTicket } from '@/pages/Tickets/categorias';

// ── Cliente sem tipo ─────────────────────────────────────────────────────────

interface Consulta extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  select(colunas?: string, opcoes?: { count?: 'exact'; head?: boolean }): Consulta;
  insert(valores: unknown): Consulta;
  update(valores: unknown): Consulta;
  upsert(valores: unknown, opcoes?: { onConflict?: string }): Consulta;
  delete(): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  in(coluna: string, valores: unknown[]): Consulta;
  order(coluna: string, opcoes?: { ascending?: boolean }): Consulta;
  limit(n: number): Consulta;
  maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function db(tabela: string): Consulta {
  return (supabase.from as unknown as (t: string) => Consulta)(tabela);
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface Ticket {
  id: string;
  numero: number;
  empresaId: string;
  setorId: string | null;
  abertoPor: string;
  abertoPorNome: string | null;
  categoria: string;
  assunto: string;
  descricao: string | null;
  prioridade: PrioridadeTicket;
  status: StatusTicket;
  responsavelId: string | null;
  responsavelNome: string | null;
  campos: Record<string, string>;
  criadoEm: string;
  atualizadoEm: string;
  fechadoEm: string | null;
}

export interface AnexoTicket {
  url: string;
  nome: string;
  tipo: string;
  tamanho: number;
}

export interface MensagemTicket {
  id: string;
  ticketId: string;
  autorId: string | null;
  autorNome: string | null;
  autorFoto: string | null;
  texto: string | null;
  anexos: AnexoTicket[];
  criadoEm: string;
}

export interface EventoTicket {
  id: string;
  tipo: string;
  autorNome: string | null;
  de: string | null;
  para: string | null;
  criadoEm: string;
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function listarTickets(empresaId: string, limite = 300): Promise<Ticket[]> {
  const { data, error } = await db('tickets')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false })
    .limit(limite);

  // Migration pendente devolve lista vazia em vez de tela quebrada — mesmo
  // padrão de `listarTransferencias`.
  if (error || !data) {
    if (error) console.warn('[tickets] leitura falhou:', error.message);
    return [];
  }
  return (data as Record<string, unknown>[]).map(paraTicket);
}

export async function listarMensagens(ticketId: string): Promise<MensagemTicket[]> {
  const { data, error } = await db('tickets_mensagens')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('criado_em', { ascending: true });

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(l => ({
    id:        String(l.id),
    ticketId:  String(l.ticket_id),
    autorId:   (l.autor_id as string | null) ?? null,
    autorNome: (l.autor_nome as string | null) ?? null,
    autorFoto: (l.autor_foto as string | null) ?? null,
    texto:     (l.texto as string | null) ?? null,
    anexos:    Array.isArray(l.anexos) ? l.anexos as AnexoTicket[] : [],
    criadoEm:  String(l.criado_em),
  }));
}

export async function listarEventos(ticketId: string): Promise<EventoTicket[]> {
  const { data, error } = await db('tickets_eventos')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('criado_em', { ascending: true });

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(l => ({
    id:        String(l.id),
    tipo:      String(l.tipo),
    autorNome: (l.autor_nome as string | null) ?? null,
    de:        (l.de as string | null) ?? null,
    para:      (l.para as string | null) ?? null,
    criadoEm:  String(l.criado_em),
  }));
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function abrirTicket(params: {
  empresaId: string;
  setorId: string | null;
  abertoPor: string;
  abertoPorNome: string;
  categoria: string;
  assunto: string;
  descricao: string;
  prioridade: PrioridadeTicket;
  campos: Record<string, string>;
}): Promise<{ id: string | null; erro: string | null }> {
  const { data, error } = await db('tickets')
    .insert({
      empresa_id:      params.empresaId,
      setor_id:        params.setorId,
      aberto_por:      params.abertoPor,
      aberto_por_nome: params.abertoPorNome,
      categoria:       params.categoria,
      assunto:         params.assunto.trim(),
      descricao:       params.descricao.trim() || null,
      prioridade:      params.prioridade,
      campos:          params.campos,
    })
    .select('id')
    .maybeSingle() as unknown as { data: { id: string } | null; error: { message: string } | null };

  if (error || !data) return { id: null, erro: traduzir(error?.message ?? 'motivo desconhecido') };
  return { id: data.id, erro: null };
}

export async function enviarMensagem(params: {
  ticketId: string;
  autorId: string;
  autorNome: string;
  autorFoto: string | null;
  texto: string;
  anexos: AnexoTicket[];
}): Promise<{ erro: string | null }> {
  const { error } = await db('tickets_mensagens').insert({
    ticket_id:  params.ticketId,
    autor_id:   params.autorId,
    autor_nome: params.autorNome,
    autor_foto: params.autorFoto,
    texto:      params.texto.trim() || null,
    anexos:     params.anexos,
  });
  return { erro: error ? traduzir(error.message) : null };
}

/** Muda o estado. Quem pode, o banco decide. */
export async function mudarStatus(
  ticketId: string, status: StatusTicket,
): Promise<{ erro: string | null }> {
  const { error } = await db('tickets').update({ status }).eq('id', ticketId);
  return { erro: error ? traduzir(error.message) : null };
}

/**
 * Assumir o ticket.
 *
 * Assumir e colocar "em andamento" são a mesma decisão na prática, e separá-las
 * só produziria tickets com dono e status de abandonado. Um `null` devolve o
 * ticket à fila, e aí ele volta a "aberto".
 */
export async function assumirTicket(params: {
  ticketId: string;
  responsavelId: string | null;
  responsavelNome: string | null;
  statusAtual: StatusTicket;
}): Promise<{ erro: string | null }> {
  const patch: Record<string, unknown> = {
    responsavel_id:   params.responsavelId,
    responsavel_nome: params.responsavelNome,
  };
  if (params.responsavelId && params.statusAtual === 'aberto') patch.status = 'em_andamento';
  if (!params.responsavelId && params.statusAtual === 'em_andamento') patch.status = 'aberto';

  const { error } = await db('tickets').update(patch).eq('id', params.ticketId);
  return { erro: error ? traduzir(error.message) : null };
}

export async function mudarPrioridade(
  ticketId: string, prioridade: PrioridadeTicket,
): Promise<{ erro: string | null }> {
  const { error } = await db('tickets').update({ prioridade }).eq('id', ticketId);
  return { erro: error ? traduzir(error.message) : null };
}

// ── Anexos ───────────────────────────────────────────────────────────────────

/**
 * Sobe um arquivo e devolve o endereço público.
 *
 * O caminho leva `empresa/ticket/uuid`: o UUID impede que dois prints chamados
 * "Captura de tela.png" se sobrescrevam, e a pasta por ticket deixa a limpeza
 * de um ticket apagado ser um prefixo só.
 */
export async function subirAnexo(
  arquivo: File, empresaId: string, ticketId: string,
): Promise<AnexoTicket> {
  const extensao = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : 'bin';
  const caminho  = `${empresaId}/${ticketId}/${crypto.randomUUID()}.${extensao}`;

  const { error } = await supabase.storage.from('tickets').upload(caminho, arquivo, {
    contentType: arquivo.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(`Não foi possível enviar "${arquivo.name}": ${error.message}`);

  const { data } = supabase.storage.from('tickets').getPublicUrl(caminho);
  return {
    url: data.publicUrl,
    nome: arquivo.name,
    tipo: arquivo.type || 'application/octet-stream',
    tamanho: arquivo.size,
  };
}

// ── Atendentes e a chave da aba ──────────────────────────────────────────────

export interface Atendente { perfilId: string; nome: string; perfil: string | null }

export async function listarAtendentes(empresaId: string): Promise<Atendente[]> {
  const { data, error } = await db('tickets_atendentes')
    .select('perfil_id, perfis(nome, perfil)')
    .eq('empresa_id', empresaId);

  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(l => {
    const p = l.perfis as { nome?: string; perfil?: string } | null;
    return {
      perfilId: String(l.perfil_id),
      nome:     p?.nome ?? '(sem nome)',
      perfil:   p?.perfil ?? null,
    };
  });
}

export async function autorizarAtendente(
  empresaId: string, perfilId: string, porQuem: string | null,
): Promise<{ erro: string | null }> {
  const { error } = await db('tickets_atendentes')
    .insert({ empresa_id: empresaId, perfil_id: perfilId, criado_por: porQuem });
  return { erro: error ? traduzir(error.message) : null };
}

export async function revogarAtendente(
  empresaId: string, perfilId: string,
): Promise<{ erro: string | null }> {
  const { error } = await db('tickets_atendentes')
    .delete().eq('empresa_id', empresaId).eq('perfil_id', perfilId);
  return { erro: error ? traduzir(error.message) : null };
}

/**
 * A aba está liberada para a liderança?
 *
 * Sem linha na tabela a resposta é NÃO — a aba nasce fechada, e é assim que ela
 * chega em produção no dia do deploy: só administrador enxerga, até alguém
 * virar a chave.
 */
export async function lerLiberacaoDaAba(empresaId: string): Promise<boolean> {
  const { data, error } = await db('tickets_config')
    .select('liberado_para_lideranca')
    .eq('empresa_id', empresaId)
    .maybeSingle() as unknown as {
      data: { liberado_para_lideranca?: boolean } | null; error: { message: string } | null;
    };
  if (error || !data) return false;
  return data.liberado_para_lideranca === true;
}

export async function definirLiberacaoDaAba(
  empresaId: string, liberado: boolean, porQuem: string | null,
): Promise<{ erro: string | null }> {
  const { error } = await db('tickets_config').upsert(
    {
      empresa_id: empresaId,
      liberado_para_lideranca: liberado,
      atualizado_por: porQuem,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'empresa_id' },
  );
  return { erro: error ? traduzir(error.message) : null };
}

// ── Conversões e erros ───────────────────────────────────────────────────────

function paraTicket(l: Record<string, unknown>): Ticket {
  return {
    id:              String(l.id),
    numero:          Number(l.numero) || 0,
    empresaId:       String(l.empresa_id),
    setorId:         (l.setor_id as string | null) ?? null,
    abertoPor:       String(l.aberto_por),
    abertoPorNome:   (l.aberto_por_nome as string | null) ?? null,
    categoria:       String(l.categoria),
    assunto:         String(l.assunto),
    descricao:       (l.descricao as string | null) ?? null,
    prioridade:      (l.prioridade as PrioridadeTicket) ?? 'normal',
    status:          (l.status as StatusTicket) ?? 'aberto',
    responsavelId:   (l.responsavel_id as string | null) ?? null,
    responsavelNome: (l.responsavel_nome as string | null) ?? null,
    campos:          (l.campos as Record<string, string> | null) ?? {},
    criadoEm:        String(l.criado_em),
    atualizadoEm:    String(l.atualizado_em),
    fechadoEm:       (l.fechado_em as string | null) ?? null,
  };
}

/** Texto cru do Postgres → frase que diz o que fazer. */
export function traduzir(mensagem: string): string {
  if (/TICKET_SEM_PERMISSAO/i.test(mensagem)) {
    return mensagem.split('TICKET_SEM_PERMISSAO:')[1]?.trim()
      || 'Você não tem permissão para esta alteração.';
  }
  if (/could not find the table|does not exist|schema cache/i.test(mensagem)) {
    return 'Migration 20260819100000 pendente — aplique-a no Supabase para usar os tickets.';
  }
  if (/row-level security|permission denied/i.test(mensagem)) {
    return 'O banco recusou: você não tem permissão para isso.';
  }
  return mensagem;
}
