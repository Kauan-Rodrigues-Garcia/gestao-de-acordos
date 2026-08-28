/**
 * chat.service.ts — o chat interno.
 *
 * Toda a regra de quem fala com quem mora na RLS e nas RPCs (migrations
 * `20260825210000` e `20260825220000`), não aqui. Este arquivo pede "as minhas
 * conversas" e o banco devolve as que existem para mim — repetir o recorte no
 * cliente criaria duas verdades, e a que engana é sempre a do cliente.
 *
 * ## O que NÃO passa por aqui
 *
 * «Online» e «digitando» são efêmeros e vivem no Presence/Broadcast do canal,
 * em `useChatPresenca`. Não tocam o banco de propósito: heartbeat não é dado, e
 * gravar cada tecla digitada seria escrever milhares de linhas por hora para
 * mostrar três pontinhos.
 *
 * ## Sobre o cliente sem tipo
 *
 * `database.types.ts` é gerado do banco e ainda não conhece estas tabelas —
 * nem `setores.nome`, que existe desde sempre. `tabelaSemTipo` só lê; aqui é
 * preciso gravar mensagem e marcar leitura, daí o `db()` local, no mesmo molde
 * de `tickets.service.ts`.
 */
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

// ── Cliente sem tipo ─────────────────────────────────────────────────────────

interface Consulta extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  select(colunas?: string, opcoes?: { count?: 'exact'; head?: boolean }): Consulta;
  insert(valores: unknown): Consulta;
  update(valores: unknown): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  lt(coluna: string, valor: unknown): Consulta;
  is(coluna: string, valor: null): Consulta;
  in(coluna: string, valores: unknown[]): Consulta;
  order(coluna: string, opcoes?: { ascending?: boolean; nullsFirst?: boolean }): Consulta;
  limit(n: number): Consulta;
  maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function db(tabela: string): Consulta {
  return (supabase.from as unknown as (t: string) => Consulta)(tabela);
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface AnexoChat {
  url:     string;
  nome:    string;
  tipo:    string;
  tamanho: number;
}

export interface MensagemChat {
  id:           string;
  conversa_id:  string;
  autor_id:     string | null;
  texto:        string | null;
  anexos:       AnexoChat[];
  criado_em:    string;
  /** Saiu de um disparo. A tela não mostra isso a quem recebeu — ver a migration. */
  disparo_id:   string | null;
  expurgado_em: string | null;
}

/** Uma linha da lista de conversas, já com a outra pessoa resolvida. */
export interface ConversaChat {
  id:                 string;
  outro_id:           string;
  outro_nome:         string;
  outro_usuario:      string | null;
  outro_foto:         string | null;
  ultima_mensagem_em: string | null;
  /** Última mensagem que realmente reativou esta lista (disparo próprio não conta). */
  ultima_atividade_em: string | null;
  /** Calculado no banco pela meia-noite de America/Sao_Paulo. */
  em_historico:       boolean;
  /** Prévia da última mensagem, para a lista não precisar de uma consulta por linha. */
  ultimo_texto:       string | null;
  ultimo_autor_id:    string | null;
  /** Quantas chegaram depois da minha última leitura. */
  nao_lidas:          number;
  /** Quando o OUTRO leu por último — é o «visualizou» das minhas mensagens. */
  leitura_do_outro:   string | null;
  /** Até onde este aparelho já recebeu mensagens desta conversa. */
  entrega_minha:      string | null;
  /** Até onde o OUTRO recebeu — é o segundo check das minhas mensagens. */
  entrega_do_outro:   string | null;
  /**
   * A empresa da outra pessoa, para a tag da lista.
   *
   * `null` quando ela atende as duas: rotular de uma só seria dizer uma meia
   * verdade sobre onde ela está.
   */
  outro_empresa:      string | null;
}

export interface ContatoChat {
  perfil_id:    string;
  nome:         string;
  usuario:      string | null;
  foto_url:     string | null;
  cargo:        string;
  setor_id:     string | null;
  setor_nome:   string | null;
  equipe_id:    string | null;
  equipe_nome:  string | null;
  empresa_slug: string | null;
  /** Atende as duas operações — e por isso não recebe tag de empresa. */
  multiempresa: boolean;
}

export interface DisparoChat {
  id:             string;
  texto:          string | null;
  anexos:         AnexoChat[];
  criado_em:      string;
  total_destinos: number;
}

/** Uma pessoa que recebeu um disparo, ligada à conversa individual dela. */
export interface DestinoDisparoChat {
  perfil_id:   string;
  conversa_id: string;
  nome:        string;
  usuario:     string | null;
  foto_url:    string | null;
  empresa_slug: string | null;
}

export const PAGINA_DESTINOS_DISPARO = 50;

// ── A trava de lançamento ────────────────────────────────────────────────────

/**
 * Eu posso usar o chat AGORA?
 *
 * Quem responde é o banco, com a mesma função que a RLS usa. Não é conferência
 * de segurança — essa é a RLS, e ela se sustenta sozinha. É o que impede a tela
 * de mentir.
 *
 * Sem isto, `temPermissao('ver_chat')` bastaria — e ele responde `true` para
 * ADMINISTRADOR por acesso total, antes de olhar tabela nenhuma. O administrador
 * veria a bolha, abriria, e encontraria uma lista vazia com um campo de escrita
 * que não escreve: a trava `chat_config` está fechada e só o super_admin passa.
 * Botão que abre um cômodo vazio é pior que botão que não existe.
 */
export async function possoUsarOChat(): Promise<boolean> {
  const { data, error } = await rpcSemTipo<boolean>('fn_chat_pode_usar', {});
  if (error) {
    // Migration ainda não aplicada, ou rede caiu: o chat não aparece. Errar
    // para o lado de esconder é o certo aqui — a alternativa é oferecer.
    return false;
  }
  return data === true;
}

/** A trava de lançamento está aberta nesta empresa? */
export async function lerLiberacaoChat(empresaId: string): Promise<boolean> {
  const { data, error } = await db('chat_config')
    .select('liberado')
    .eq('empresa_id', empresaId)
    .maybeSingle() as unknown as {
      data: { liberado: boolean } | null; error: { message: string } | null;
    };
  if (error) {
    console.warn('[chat] lerLiberacao:', error.message);
    return false;
  }
  return data?.liberado === true;
}

/**
 * Vira a chave. Só super_admin passa — a policy `chat_config_update` confere.
 *
 * A linha já existe para toda empresa (semeada na migration), então é UPDATE e
 * não upsert: se ela sumiu, é um problema que vale aparecer, e não um que vale
 * remendar em silêncio.
 */
export async function definirLiberacaoChat(
  empresaId: string, liberado: boolean,
): Promise<{ erro: string | null }> {
  const { error } = await db('chat_config')
    .update({ liberado, atualizado_em: new Date().toISOString() })
    .eq('empresa_id', empresaId);
  if (error) {
    return {
      erro: /row-level security|violates/i.test(error.message)
        ? 'Só o super admin pode abrir ou fechar o chat.'
        : 'Tente novamente.',
    };
  }
  return { erro: null };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/**
 * As minhas conversas, na ordem da mais recente.
 *
 * UMA ida ao banco. Até 25/08/2026 eram cinco, e duas delas baixavam o
 * histórico INTEIRO — a prévia da última mensagem pedia todas as mensagens de
 * todas as conversas e jogava fora tudo menos a primeira de cada, e a contagem
 * de não lidas pedia as mesmas linhas de novo. Como esta função roda a cada
 * evento de tempo real, cada mensagem recebida baixava o histórico duas vezes.
 * Funcionava no primeiro dia e travaria no terceiro mês.
 *
 * Agora quem monta é `fn_chat_minhas_conversas`, com `DISTINCT ON` sobre o
 * índice `(conversa_id, criado_em DESC)`: uma linha por conversa, sem varrer
 * o resto.
 *
 * Quem some daqui continua saindo do banco: conversa apagada por mim
 * (`apagada_em`) e conversa nascida de um disparo meu ainda sem resposta
 * (`oculta_em`).
 */
export async function listarConversas(): Promise<ConversaChat[]> {
  const { data, error } = await rpcSemTipo<{
    id: string; outro_id: string; outro_nome: string; outro_usuario: string | null;
    outro_foto: string | null; outro_empresa: string | null;
    ultima_mensagem_em: string | null; ultima_atividade_em: string | null;
    em_historico: boolean; ultimo_texto: string | null;
    ultimo_anexos: AnexoChat[] | null; ultimo_autor_id: string | null;
    nao_lidas: number; leitura_do_outro: string | null;
    entrega_minha: string | null; entrega_do_outro: string | null;
  }[]>('fn_chat_minhas_conversas', {});

  if (error) {
    console.warn('[chat] listarConversas:', error.message);
    return [];
  }

  return (data ?? []).map(c => {
    const anexos = Array.isArray(c.ultimo_anexos) ? c.ultimo_anexos : [];
    return {
      id:                 c.id,
      outro_id:           c.outro_id,
      outro_nome:         c.outro_nome ?? 'Sem nome',
      outro_usuario:      c.outro_usuario,
      outro_foto:         c.outro_foto,
      ultima_mensagem_em: c.ultima_mensagem_em,
      ultima_atividade_em: c.ultima_atividade_em,
      em_historico:       c.em_historico === true,
      // Sem texto e com anexo, a prévia vira «Foto», «Áudio», «2 arquivos».
      ultimo_texto:       c.ultimo_texto ?? (anexos.length ? rotuloAnexo(anexos) : null),
      ultimo_autor_id:    c.ultimo_autor_id,
      nao_lidas:          c.nao_lidas ?? 0,
      leitura_do_outro:   c.leitura_do_outro,
      entrega_minha:      c.entrega_minha,
      entrega_do_outro:   c.entrega_do_outro,
      outro_empresa:      c.outro_empresa,
    };
  });
}

/** «Foto», «Arquivo», «3 arquivos» — o que a lista mostra quando não há texto. */
export function rotuloAnexo(anexos: AnexoChat[]): string {
  if (anexos.length > 1) return `${anexos.length} arquivos`;
  const a = anexos[0];
  if (!a) return 'Arquivo';
  if (a.tipo?.startsWith('image/')) return 'Foto';
  if (a.tipo?.startsWith('video/')) return 'Vídeo';
  if (a.tipo?.startsWith('audio/')) return 'Áudio';
  return a.nome || 'Arquivo';
}

/**
 * UMA conversa, mesmo que ela ainda não tenha nenhuma mensagem.
 *
 * `fn_chat_minhas_conversas` descarta conversa sem mensagem de propósito —
 * aberta e abandonada viraria uma linha vazia que não some sozinha. Só que a
 * conversa RECÉM-CRIADA também não tem mensagem, e sem esta função a tela abria
 * um painel em branco.
 */
export async function buscarConversa(
  conversaId: string,
): Promise<ConversaChat | null> {
  const { data, error } = await rpcSemTipo<{
    id: string; outro_id: string; outro_nome: string; outro_usuario: string | null;
    outro_foto: string | null; outro_empresa: string | null;
    ultima_mensagem_em: string | null;
  }[]>('fn_chat_uma_conversa', { p_conversa: conversaId });

  const c = data?.[0];
  if (error || !c) return null;

  return {
    id:                 c.id,
    outro_id:           c.outro_id,
    outro_nome:         c.outro_nome ?? 'Sem nome',
    outro_usuario:      c.outro_usuario,
    outro_foto:         c.outro_foto,
    ultima_mensagem_em: c.ultima_mensagem_em,
    ultima_atividade_em: c.ultima_mensagem_em,
    em_historico:       false,
    ultimo_texto:       null,
    ultimo_autor_id:    null,
    nao_lidas:          0,
    leitura_do_outro:   null,
    entrega_minha:      null,
    entrega_do_outro:   null,
    outro_empresa:      c.outro_empresa,
  };
}

/** Quantas mensagens a conversa abre de uma vez. */
export const PAGINA_MENSAGENS = 60;

/**
 * As mensagens da conversa, da mais antiga para a mais nova.
 *
 * Traz a ÚLTIMA página, não a conversa inteira: quem abre um chat quer ver o
 * fim, e uma conversa de meses baixaria milhares de linhas para desenhar as
 * cinco que cabem na tela. A consulta pede em ordem decrescente (que é a que o
 * índice serve) e devolve invertido.
 *
 * `antesDe` pagina para trás — é o «ver anteriores» do topo.
 */
export async function listarMensagens(
  conversaId: string, antesDe?: string,
): Promise<{ mensagens: MensagemChat[]; temMais: boolean }> {
  let q = db('chat_mensagens')
    .select('id, conversa_id, autor_id, texto, anexos, criado_em, disparo_id, expurgado_em')
    .eq('conversa_id', conversaId);

  if (antesDe) q = q.lt('criado_em', antesDe);

  const { data, error } = await q
    .order('criado_em', { ascending: false })
    // Pede uma a mais só para saber se existe página anterior, e descarta.
    // Uma consulta de contagem para responder isso seria uma ida a mais.
    .limit(PAGINA_MENSAGENS + 1);

  if (error) {
    console.warn('[chat] listarMensagens:', error.message);
    return { mensagens: [], temMais: false };
  }

  const linhas = (data ?? []) as MensagemChat[];
  const temMais = linhas.length > PAGINA_MENSAGENS;

  return {
    mensagens: linhas
      .slice(0, PAGINA_MENSAGENS)
      .map(m => ({ ...m, anexos: Array.isArray(m.anexos) ? m.anexos : [] }))
      .reverse(),
    temMais,
  };
}

/** Com quem eu posso INICIAR conversa, agrupado por setor e equipe. */
export async function listarContatos(): Promise<ContatoChat[]> {
  const { data, error } = await rpcSemTipo<ContatoChat[]>('fn_chat_contatos', {});
  if (error) {
    console.warn('[chat] listarContatos:', error.message);
    return [];
  }
  return data ?? [];
}

export async function listarDisparos(): Promise<DisparoChat[]> {
  const { data, error } = await db('chat_disparos')
    .select('id, texto, anexos, criado_em, total_destinos')
    .order('criado_em', { ascending: false })
    .limit(100);

  if (error) {
    console.warn('[chat] listarDisparos:', error.message);
    return [];
  }
  return ((data ?? []) as DisparoChat[]).map(d => ({
    ...d, anexos: Array.isArray(d.anexos) ? d.anexos : [],
  }));
}

/**
 * Destinatários de um disparo, cinquenta por vez.
 *
 * A autorização continua inteira no banco. A RPC confere que `auth.uid()` é o
 * autor do disparo e que o chat segue liberado antes de atravessar a RLS mais
 * estreita de `perfis`. Isso evita que cargos não administrativos recebam 50
 * linhas chamadas apenas de «Pessoa indisponível».
 *
 * Pedimos uma linha a mais para descobrir se existe próxima página sem fazer
 * uma consulta de contagem.
 */
export async function listarDestinosDisparo(
  disparoId: string,
  inicio = 0,
): Promise<{ destinos: DestinoDisparoChat[]; temMais: boolean; erro: string | null }> {
  type LinhaDestino = {
    perfil_id: string;
    conversa_id: string;
    nome: string | null;
    usuario: string | null;
    foto_url: string | null;
    empresa_slug: string | null;
  };

  const { data, error } = await rpcSemTipo<LinhaDestino[]>('fn_chat_destinos_disparo', {
    p_disparo: disparoId,
    p_inicio: inicio,
    p_limite: PAGINA_DESTINOS_DISPARO + 1,
  });

  if (error) {
    console.warn('[chat] listarDestinosDisparo:', error.message);
    return { destinos: [], temMais: false, erro: 'Não foi possível carregar os destinatários.' };
  }

  const linhas = ((data ?? []) as LinhaDestino[]);
  const temMais = linhas.length > PAGINA_DESTINOS_DISPARO;

  return {
    destinos: linhas.slice(0, PAGINA_DESTINOS_DISPARO).map(linha => {
      return {
        perfil_id:    linha.perfil_id,
        conversa_id:  linha.conversa_id,
        nome:         linha.nome?.trim() || 'Pessoa indisponível',
        usuario:      linha.usuario ?? null,
        foto_url:     linha.foto_url ?? null,
        empresa_slug: linha.empresa_slug ?? null,
      };
    }),
    temMais,
    erro: null,
  };
}

// ── Escrita ──────────────────────────────────────────────────────────────────

/** Abre (ou reabre) a conversa com alguém. Devolve o id, ou o motivo da recusa. */
export async function abrirConversa(alvoId: string): Promise<{ id: string | null; erro: string | null }> {
  const { data, error } = await rpcSemTipo<string>('fn_chat_abrir', { p_alvo: alvoId });
  if (error) return { id: null, erro: traduzir(error.message) };
  return { id: (data as unknown as string) ?? null, erro: null };
}

export async function enviarMensagem(params: {
  conversaId: string;
  empresaId:  string;
  autorId:    string;
  texto:      string;
  anexos?:    AnexoChat[];
}): Promise<{ erro: string | null }> {
  const anexos = params.anexos ?? [];
  const texto  = params.texto.trim();
  if (!texto && !anexos.length) return { erro: 'Escreva alguma coisa.' };

  const { error } = await db('chat_mensagens').insert({
    conversa_id: params.conversaId,
    empresa_id:  params.empresaId,
    autor_id:    params.autorId,
    texto:       texto || null,
    anexos,
  });
  return { erro: error ? traduzir(error.message) : null };
}

/** Confirma que este cliente recebeu as mensagens da conversa. */
export async function marcarEntregue(conversaId: string, meuId: string): Promise<void> {
  const { error } = await db('chat_participantes')
    .update({ ultima_entrega_em: new Date().toISOString() })
    .eq('conversa_id', conversaId)
    .eq('perfil_id', meuId);
  if (error) console.warn('[chat] marcarEntregue:', error.message);
}

/** Marca a conversa como recebida e lida até agora. */
export async function marcarLido(conversaId: string, meuId: string): Promise<void> {
  const agora = new Date().toISOString();
  const { error } = await db('chat_participantes')
    .update({ ultima_entrega_em: agora, ultima_leitura_em: agora })
    .eq('conversa_id', conversaId)
    .eq('perfil_id', meuId);
  if (error) console.warn('[chat] marcarLido:', error.message);
}

/** Some com a conversa da MINHA lista. A do outro continua, e nada é apagado. */
export async function apagarConversa(conversaId: string, meuId: string): Promise<void> {
  const { error } = await db('chat_participantes')
    .update({ apagada_em: new Date().toISOString() })
    .eq('conversa_id', conversaId)
    .eq('perfil_id', meuId);
  if (error) console.warn('[chat] apagarConversa:', error.message);
}

export interface ResultadoDisparo {
  disparoId: string | null;
  enviados:  number;
  pulados:   string[];
  erro:      string | null;
}

/**
 * Manda a mesma mensagem para várias pessoas, em conversas de duas.
 *
 * Quem não pode receber é pulado e volta em `pulados` — o disparo não cai por
 * causa de um bloqueado no meio, e quem disparou fica sabendo quem ficou de fora.
 */
export async function dispararMensagem(
  destinos: string[], texto: string, anexos: AnexoChat[] = [],
): Promise<ResultadoDisparo> {
  const { data, error } = await rpcSemTipo<{
    disparo_id?: string; enviados?: number; pulados?: string[];
  }>('fn_chat_disparar', {
    p_destinos: destinos,
    p_texto:    texto.trim() || null,
    p_anexos:   anexos,
  });

  if (error) return { disparoId: null, enviados: 0, pulados: [], erro: traduzir(error.message) };
  return {
    disparoId: data?.disparo_id ?? null,
    enviados:  data?.enviados ?? 0,
    pulados:   data?.pulados ?? [],
    erro:      null,
  };
}

/**
 * Registra que a pessoa leu as boas-vindas do chat.
 *
 * Vai por `db()` e não por `supabase.from('perfis')` porque
 * `database.types.ts` é gerado do banco e ainda não conhece
 * `chat_boas_vindas_em` (migration 20260825240000). Quando os tipos forem
 * regenerados, vira substituição direta.
 */
export async function registrarBoasVindas(perfilId: string): Promise<{ erro: string | null }> {
  const { error } = await db('perfis')
    .update({ chat_boas_vindas_em: new Date().toISOString() })
    .eq('id', perfilId);
  return { erro: error?.message ?? null };
}

// ── Anexos ───────────────────────────────────────────────────────────────────

/** 10 MB. O balde recusa acima disso; aqui é só para avisar antes de subir. */
export const LIMITE_ANEXO = 10 * 1024 * 1024;

/**
 * Sobe o arquivo e devolve o anexo pronto para a mensagem.
 *
 * O balde `chat` é PRIVADO, ao contrário do de tickets: guardamos o caminho, e
 * a tela pede uma URL assinada na hora de mostrar. Balde público entregaria o
 * arquivo a quem tivesse o link, sem sessão e para sempre — o que contradiria o
 * expurgo de CPF que a mesma migration instala.
 */
export async function subirAnexo(
  arquivo: File, pasta: string,
): Promise<{ anexo: AnexoChat | null; erro: string | null }> {
  if (arquivo.size > LIMITE_ANEXO) {
    return { anexo: null, erro: `«${arquivo.name}» passa de 10 MB.` };
  }

  const limpo = arquivo.name.replace(/[^\w.-]+/g, '_').slice(-80);
  // Conversa normal usa o UUID da conversa. Um disparo ainda não tem id antes
  // do upload, então usa `disparos/<uuid-do-rascunho>`; a policy continua a
  // mesma e o caminho evita misturar anexos de composições diferentes.
  const caminho = `${pasta}/${crypto.randomUUID()}-${limpo}`;

  const { error } = await supabase.storage.from('chat').upload(caminho, arquivo, {
    contentType: arquivo.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) return { anexo: null, erro: `Não foi possível enviar «${arquivo.name}».` };

  return {
    anexo: { url: caminho, nome: arquivo.name, tipo: arquivo.type || '', tamanho: arquivo.size },
    erro: null,
  };
}

/**
 * URL temporária para ver ou baixar um anexo.
 *
 * Uma hora é o suficiente para a pessoa abrir o que está na tela, e curto o
 * bastante para um link copiado por engano não virar acesso permanente.
 */
const VALIDADE_URL = 3600;
/**
 * As assinaturas já pedidas, guardadas até quase vencer.
 *
 * Sem cache, cada rolagem que remonta um balão pede uma assinatura nova — numa
 * conversa com trinta fotos, subir e descer duas vezes são sessenta chamadas de
 * rede para mostrar as mesmas trinta imagens.
 *
 * Guarda com cinco minutos de folga antes do vencimento real: uma URL que
 * expira enquanto o vídeo toca quebra no meio, e renovar cedo custa nada.
 */
const assinaturas = new Map<string, { url: string; ate: number }>();

export async function urlDoAnexo(caminho: string): Promise<string | null> {
  const guardada = assinaturas.get(caminho);
  if (guardada && guardada.ate > Date.now()) return guardada.url;

  const { data, error } = await supabase.storage
    .from('chat').createSignedUrl(caminho, VALIDADE_URL);
  if (error) {
    console.warn('[chat] urlDoAnexo:', error.message);
    return null;
  }
  const url = data?.signedUrl ?? null;
  if (url) {
    assinaturas.set(caminho, { url, ate: Date.now() + (VALIDADE_URL - 300) * 1000 });
  }
  return url;
}

// ── Erros ────────────────────────────────────────────────────────────────────

/** As exceções do banco viram frase. O texto cru nunca chega à tela. */
function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes('sem_sessao'))      return 'Sessão expirada. Entre novamente.';
  if (m.includes('sem_chat'))        return 'Seu acesso ao chat está desligado.';
  if (m.includes('fora_do_alcance')) return 'Você não pode iniciar conversa com esta pessoa.';
  if (m.includes('mensagem_vazia'))  return 'Escreva alguma coisa.';
  if (m.includes('row-level security') || m.includes('violates row-level')) {
    return 'Esta conversa não está disponível para você.';
  }
  return 'Não foi possível concluir. Tente de novo.';
}
