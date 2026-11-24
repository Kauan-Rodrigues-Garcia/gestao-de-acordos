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
import { invalidarCache, lerComCache } from '@/lib/cacheCurto';
import { registrarLog } from '@/services/logs.service';
import { recusadoPeloTamanho } from '@/lib/tetoDeUpload';
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
  /**
   * Quem foi chamado para o ticket além de quem abriu e de quem atende.
   * Opcional: sem a migration 20261123180000 a lista vem sem ela.
   */
  participantes?: ParticipanteTicket[];
}

export interface ParticipanteTicket {
  id: string;
  nome: string;
}

/** Uma pessoa nos seletores (transferir, chamar participante). */
export interface PessoaTicket {
  id: string;
  nome: string;
  foto: string | null;
  perfil: string | null;
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
  /** Anexo enviado no formulário de abertura — mora dentro do cartão do pedido. */
  doPedido: boolean;
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

/**
 * Os tickets que a pessoa pode ver.
 *
 * `empresaId: null` NÃO afrouxa nada — é para quem tem acesso às duas empresas
 * e quer as duas listas juntas. O filtro que importa continua sendo a RLS, que
 * chama `fn_can_access_empresa` linha a linha; tirar o `.eq` daqui só deixa de
 * esconder o que o banco já ia deixar passar.
 */
export async function listarTickets(
  empresaId: string | null, limite = 300,
): Promise<Ticket[]> {
  const consultar = (colunas: string) => {
    let q = db('tickets').select(colunas);
    if (empresaId) q = q.eq('empresa_id', empresaId);
    return q.order('criado_em', { ascending: false }).limit(limite);
  };

  // Os participantes vêm junto, num JOIN só. Sem a migration 20261123180000 a
  // tabela não existe e o PostgREST recusa a consulta inteira — aí a fila cai
  // para a leitura antiga, sem participante, em vez de ficar vazia.
  let { data, error } = await consultar('*, tickets_participantes(perfil_id, perfil_nome)');
  if (error && /tickets_participantes|relationship|schema cache/i.test(error.message)) {
    ({ data, error } = await consultar('*'));
  }

  // Migration pendente devolve lista vazia em vez de tela quebrada — mesmo
  // padrão de `listarTransferencias`.
  if (error || !data) {
    if (error) console.warn('[tickets] leitura falhou:', error.message);
    return [];
  }
  return (data as Record<string, unknown>[]).map(paraTicket);
}

/**
 * Foto e nome de quem aparece nos cards.
 *
 * O ticket guarda o NOME de quem abriu, não a foto — e guardar a foto na linha
 * a deixaria velha no dia em que a pessoa trocasse a dela. Uma consulta só,
 * sem filtro de empresa: quem enxerga as duas precisa das duas, e a RLS de
 * `perfis` já recorta o que cada um pode ler.
 */
export async function buscarFotosDosPerfis(): Promise<Map<string, string | null>> {
  const { data, error } = await db('perfis').select('id, foto_url');
  if (error || !data) return new Map();
  return new Map((data as { id: string; foto_url: string | null }[])
    .map(p => [p.id, p.foto_url]));
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
    doPedido:  l.do_pedido === true,
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
  /** Anexos do formulário de abertura. Só quem abriu pode (RLS). */
  doPedido?: boolean;
}): Promise<{ erro: string | null }> {
  const linha: Record<string, unknown> = {
    ticket_id:  params.ticketId,
    autor_id:   params.autorId,
    autor_nome: params.autorNome,
    autor_foto: params.autorFoto,
    texto:      params.texto.trim() || null,
    anexos:     params.anexos,
  };
  if (params.doPedido) linha.do_pedido = true;

  let { error } = await db('tickets_mensagens').insert(linha);
  // Sem a migration 20261123180000 a coluna não existe: o anexo entra como
  // mensagem comum, que é melhor do que perder o print.
  if (error && params.doPedido && /do_pedido/i.test(error.message)) {
    delete linha.do_pedido;
    ({ error } = await db('tickets_mensagens').insert(linha));
  }
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

/**
 * Transferir o ticket para outra pessoa que atende.
 *
 * É a mesma coluna de «assumir» — o banco grava o evento «passou de X para Y» e
 * avisa quem abriu, quem largou, quem recebeu e os participantes. O recado,
 * quando há, vai como mensagem logo depois: é para quem recebe ler junto.
 */
export async function transferirTicket(params: {
  ticketId: string;
  para: { id: string; nome: string };
  statusAtual: StatusTicket;
  recado?: string;
  autor: { id: string; nome: string; foto: string | null };
}): Promise<{ erro: string | null }> {
  const r = await assumirTicket({
    ticketId: params.ticketId,
    responsavelId: params.para.id,
    responsavelNome: params.para.nome,
    statusAtual: params.statusAtual,
  });
  if (r.erro) return r;

  const recado = params.recado?.trim();
  if (!recado) return { erro: null };
  return enviarMensagem({
    ticketId: params.ticketId,
    autorId: params.autor.id,
    autorNome: params.autor.nome,
    autorFoto: params.autor.foto,
    texto: `Transferi para ${params.para.nome}: ${recado}`,
    anexos: [],
  });
}

// ── Participantes ────────────────────────────────────────────────────────────

/** Chama uma ou várias pessoas para o ticket. Devolve quantas entraram. */
export async function adicionarParticipantes(
  ticketId: string, perfilIds: string[],
): Promise<{ adicionados: number; erro: string | null }> {
  if (!perfilIds.length) return { adicionados: 0, erro: null };
  const { data, error } = await supabase.rpc(
    'fn_ticket_participantes_adicionar' as never,
    { p_ticket: ticketId, p_perfis: perfilIds } as never,
  ) as unknown as { data: number | null; error: { message: string } | null };
  if (error) return { adicionados: 0, erro: traduzirParticipante(error.message) };
  return { adicionados: Number(data) || 0, erro: null };
}

/** Tira alguém do ticket — ou a própria pessoa sai. */
export async function removerParticipante(
  ticketId: string, perfilId: string,
): Promise<{ erro: string | null }> {
  const { error } = await supabase.rpc(
    'fn_ticket_participante_remover' as never,
    { p_ticket: ticketId, p_perfil: perfilId } as never,
  ) as unknown as { error: { message: string } | null };
  return { erro: error ? traduzirParticipante(error.message) : null };
}

function traduzirParticipante(mensagem: string): string {
  if (/fn_ticket_particip/i.test(mensagem) && /schema cache|does not exist|could not find/i.test(mensagem)) {
    return 'Migration 20261123180000 pendente — aplique-a no Supabase para chamar pessoas no ticket.';
  }
  return traduzir(mensagem);
}

// ── Pessoas para os seletores ────────────────────────────────────────────────

interface LinhaPerfil {
  id?: string;
  nome?: string | null;
  foto_url?: string | null;
  perfil?: string | null;
  ativo?: boolean | null;
}

function paraPessoa(p: LinhaPerfil): PessoaTicket {
  return { id: String(p.id), nome: p.nome ?? '(sem nome)', foto: p.foto_url ?? null, perfil: p.perfil ?? null };
}

/**
 * Quem pode receber um ticket transferido: administradores (atendem por
 * cargo) e quem foi autorizado em `tickets_atendentes`. Transferir para quem
 * não atende deixaria o ticket com um dono que não consegue mexer nele.
 */
export async function listarQuemAtende(empresaId: string): Promise<PessoaTicket[]> {
  const [admins, autorizados] = await Promise.all([
    db('perfis').select('id, nome, foto_url, perfil, ativo')
      .eq('empresa_id', empresaId)
      .in('perfil', ['administrador', 'super_admin']),
    db('tickets_atendentes').select('perfil_id, perfis(id, nome, foto_url, perfil, ativo)')
      .eq('empresa_id', empresaId),
  ]);

  const mapa = new Map<string, PessoaTicket>();
  const guardar = (p: LinhaPerfil | null | undefined) => {
    if (!p?.id || p.ativo === false) return;
    mapa.set(p.id, paraPessoa(p));
  };
  for (const p of (admins.data ?? []) as LinhaPerfil[]) guardar(p);
  for (const l of (autorizados.data ?? []) as { perfis?: LinhaPerfil | null }[]) guardar(l.perfis);
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Quem pode ser chamado como participante: gente ativa da empresa.
 *
 * Sem recorte por cargo de propósito — quem decide quem abre a aba é o painel
 * de permissões (`ver_tickets`), não uma lista escrita aqui (ver
 * `painel-manda.test.ts`). O seletor mostra o cargo ao lado do nome para quem
 * chama saber quem está chamando.
 */
export async function listarPessoasParaChamar(empresaId: string): Promise<PessoaTicket[]> {
  const { data, error } = await db('perfis').select('id, nome, foto_url, perfil, ativo')
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error || !data) return [];
  return (data as LinhaPerfil[])
    .filter(p => p.ativo !== false)
    .map(paraPessoa);
}

export async function mudarPrioridade(
  ticketId: string, prioridade: PrioridadeTicket,
): Promise<{ erro: string | null }> {
  const { error } = await db('tickets').update({ prioridade }).eq('id', ticketId);
  return { erro: error ? traduzir(error.message) : null };
}

/**
 * Exclui o ticket de vez — pedido de 14/09/2026, sem Lixeira.
 *
 * ## A ordem é a garantia
 *
 * 1. `fn_ticket_excluir` confere a chave `tickets_excluir` e se a pessoa
 *    ENXERGA o ticket, e apaga (mensagens e eventos vão em cascata).
 * 2. Só depois de ela aceitar, a pasta `empresa/ticket/` do bucket é apagada.
 *    Apagar antes deixaria um ticket recusado sem os prints.
 * 3. O log fica com o número e o assunto: a trilha do ticket foi junto com ele,
 *    e este é o único registro de que existiu e de quem o apagou.
 *
 * Anexo que não sai do Storage não desfaz nada — o ticket já não existe. Volta
 * `anexosPendentes` para a tela avisar, e o arquivo órfão fica no prefixo, fácil
 * de achar depois.
 */
export async function excluirTicket(
  ticketId: string,
): Promise<{ erro: string | null; anexosPendentes?: boolean }> {
  const { data, error } = await supabase.rpc(
    'fn_ticket_excluir' as never, { p_ticket: ticketId } as never,
  ) as unknown as {
    data: { id: string; numero: number; empresa_id: string; assunto: string } | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    const mensagem = error?.message ?? '';
    if (/fn_ticket_excluir/i.test(mensagem) && /schema cache|does not exist|could not find/i.test(mensagem)) {
      return { erro: 'Migration 20260914200000 pendente — aplique-a no Supabase para excluir tickets.' };
    }
    return { erro: traduzir(mensagem || 'Não foi possível excluir o ticket.') };
  }

  let anexosPendentes = false;
  const pasta = `${data.empresa_id}/${data.id}`;
  const { data: arquivos, error: erroLista } = await supabase.storage.from('tickets').list(pasta, { limit: 1000 });
  if (erroLista) {
    anexosPendentes = true;
    console.warn('[tickets] excluirTicket, listando anexos:', erroLista.message);
  } else if (arquivos && arquivos.length > 0) {
    const { error: erroRemove } = await supabase.storage.from('tickets')
      .remove(arquivos.map(a => `${pasta}/${a.name}`));
    if (erroRemove) {
      anexosPendentes = true;
      console.warn('[tickets] excluirTicket, apagando anexos:', erroRemove.message);
    }
  }

  void registrarLog({
    acao: 'ticket_excluido',
    categoria: 'sistema',
    severidade: 'aviso',
    descricao: `Excluiu o ticket #${data.numero} — ${data.assunto}`,
    empresaId: data.empresa_id,
    tabela: 'tickets',
    registroId: data.id,
    alvoTipo: 'ticket',
    alvoRotulo: `#${data.numero} — ${data.assunto}`,
    detalhes: { numero: data.numero, anexos_pendentes: anexosPendentes },
  });

  return { erro: null, anexosPendentes };
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
  if (error) {
    throw new Error(recusadoPeloTamanho(error)
      ? `"${arquivo.name}" passa do limite de tamanho do armazenamento.`
      : `Não foi possível enviar "${arquivo.name}": ${error.message}`);
  }

  const { data } = supabase.storage.from('tickets').getPublicUrl(caminho);
  return {
    url: data.publicUrl,
    nome: arquivo.name,
    tipo: arquivo.type || 'application/octet-stream',
    tamanho: arquivo.size,
  };
}

/**
 * O balde `tickets` é privado desde a auditoria de segurança de 06/10/2026:
 * print de chamado tem dado de cliente e não pode ficar num endereço público.
 *
 * Os anexos continuam gravados com o endereço público (os antigos e os novos),
 * porque dele sai o CAMINHO no balde. Para mostrar, o caminho vira um link
 * assinado de 1 h — guardado aqui por 50 min, para a conversa não reassinar
 * a cada render.
 */
const ANEXO_ASSINADO_S = 3600;
const assinados = new Map<string, { url: string; ate: number }>();

export function caminhoDoAnexoTicket(url: string): string | null {
  const m = url.match(/\/object\/(?:public|sign|authenticated)\/tickets\/([^?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  return /^(https?:|blob:|data:)/i.test(url) ? null : url;
}

export function urlDoAnexoTicketEmCache(url: string): string | null {
  const caminho = caminhoDoAnexoTicket(url);
  if (!caminho) return url;
  const c = assinados.get(caminho);
  return c && c.ate > Date.now() ? c.url : null;
}

export async function urlDoAnexoTicket(url: string): Promise<string | null> {
  const caminho = caminhoDoAnexoTicket(url);
  if (!caminho) return url;
  const pronto = urlDoAnexoTicketEmCache(url);
  if (pronto) return pronto;
  const { data, error } = await supabase.storage.from('tickets').createSignedUrl(caminho, ANEXO_ASSINADO_S);
  if (error || !data?.signedUrl) return null;
  assinados.set(caminho, { url: data.signedUrl, ate: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
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
  // Guardada por 5 min (05/10/2026: ~3 mil leituras por dia de uma chave que
  // muda uma vez na vida). `definirLiberacaoDaAba` descarta na hora.
  return lerComCache(`tickets:liberacao:${empresaId}`, 5 * 60_000, async () => {
    const { data, error } = await db('tickets_config')
      .select('liberado_para_lideranca')
      .eq('empresa_id', empresaId)
      .maybeSingle() as unknown as {
        data: { liberado_para_lideranca?: boolean } | null; error: { message: string } | null;
      };
    if (error) throw new Error(error.message);
    return data?.liberado_para_lideranca === true;
  }).catch(() => false);
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
  invalidarCache('tickets:liberacao:');
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
    participantes:   Array.isArray(l.tickets_participantes)
      ? (l.tickets_participantes as { perfil_id: string; perfil_nome: string | null }[])
          .map(p => ({ id: String(p.perfil_id), nome: p.perfil_nome ?? 'Sem nome' }))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      : [],
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
