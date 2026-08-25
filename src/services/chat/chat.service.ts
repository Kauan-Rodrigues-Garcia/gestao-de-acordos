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
  /** Prévia da última mensagem, para a lista não precisar de uma consulta por linha. */
  ultimo_texto:       string | null;
  ultimo_autor_id:    string | null;
  /** Quantas chegaram depois da minha última leitura. */
  nao_lidas:          number;
  /** Quando o OUTRO leu por último — é o «visualizou» das minhas mensagens. */
  leitura_do_outro:   string | null;
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
 * Uma consulta só, com os embeds. A alternativa — listar conversas e depois
 * buscar perfil e última mensagem de cada uma — são 1 + 2N idas ao banco para
 * desenhar uma lista que muda a cada mensagem que chega.
 *
 * Quem some daqui: conversa apagada por mim (`apagada_em`) e conversa que
 * nasceu de um disparo meu e ainda não foi respondida (`oculta_em`). As duas
 * condições são do BANCO — a policy já não me devolve o que não é meu, e o
 * filtro aqui é sobre o meu próprio estado.
 */
export async function listarConversas(meuId: string): Promise<ConversaChat[]> {
  const { data, error } = await db('chat_participantes')
    .select(`
      conversa_id, ultima_leitura_em,
      chat_conversas!inner (
        id, par_menor, par_maior, ultima_mensagem_em
      )
    `)
    .eq('perfil_id', meuId)
    .is('apagada_em', null)
    .is('oculta_em', null);

  if (error) {
    console.warn('[chat] listarConversas:', error.message);
    return [];
  }

  const linhas = (data ?? []) as unknown as {
    conversa_id: string;
    ultima_leitura_em: string | null;
    chat_conversas: { id: string; par_menor: string; par_maior: string; ultima_mensagem_em: string | null };
  }[];

  // Conversa sem nenhuma mensagem não é conversa ainda: foi aberta e a pessoa
  // desistiu de escrever. Mostrar seria uma linha vazia que não some sozinha.
  const comMensagem = linhas.filter(l => l.chat_conversas?.ultima_mensagem_em);
  if (!comMensagem.length) return [];

  const outros = comMensagem.map(l =>
    l.chat_conversas.par_menor === meuId ? l.chat_conversas.par_maior : l.chat_conversas.par_menor);

  const [perfis, ultimas, leituras, naoLidas, empresas] = await Promise.all([
    buscarPerfis(outros),
    buscarUltimaMensagem(comMensagem.map(l => l.conversa_id)),
    buscarLeituraDosOutros(comMensagem.map(l => l.conversa_id), meuId),
    contarNaoLidas(comMensagem, meuId),
    buscarEmpresasDosOutros(),
  ]);

  return comMensagem
    .map(l => {
      const outroId = l.chat_conversas.par_menor === meuId
        ? l.chat_conversas.par_maior : l.chat_conversas.par_menor;
      const p = perfis.get(outroId);
      const u = ultimas.get(l.conversa_id);
      return {
        id:                 l.conversa_id,
        outro_id:           outroId,
        outro_nome:         p?.nome ?? 'Sem nome',
        outro_usuario:      p?.usuario ?? null,
        outro_foto:         p?.foto_url ?? null,
        ultima_mensagem_em: l.chat_conversas.ultima_mensagem_em,
        ultimo_texto:       u?.texto ?? null,
        ultimo_autor_id:    u?.autor_id ?? null,
        nao_lidas:          naoLidas.get(l.conversa_id) ?? 0,
        leitura_do_outro:   leituras.get(l.conversa_id) ?? null,
        outro_empresa:      empresas.get(outroId) ?? null,
      };
    })
    .sort((a, b) => (b.ultima_mensagem_em ?? '').localeCompare(a.ultima_mensagem_em ?? ''));
}

/**
 * A empresa de cada pessoa com quem eu converso — só para quem NÃO atende as
 * duas.
 *
 * Vem de RPC, e não de um `select` em `perfis`, porque a policy de `perfis`
 * recorta por empresa: quem eu alcanço por multiempresa pode não voltar nessa
 * consulta, e a tag apareceria em algumas linhas e em outras não, sem padrão
 * visível. O banco responde só o slug e o sinal, e só sobre quem já conversa
 * comigo.
 */
async function buscarEmpresasDosOutros(): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>();
  const { data, error } = await rpcSemTipo<{
    perfil_id: string; empresa_slug: string | null; multiempresa: boolean;
  }[]>('fn_chat_empresas_das_conversas', {});
  if (error || !data) return mapa;

  for (const r of data) {
    mapa.set(r.perfil_id, r.multiempresa ? null : r.empresa_slug);
  }
  return mapa;
}

interface PerfilResumo { nome: string; usuario: string | null; foto_url: string | null }

async function buscarPerfis(ids: string[]): Promise<Map<string, PerfilResumo>> {
  const mapa = new Map<string, PerfilResumo>();
  if (!ids.length) return mapa;

  const { data } = await supabase
    .from('perfis').select('id, nome, usuario, foto_url').in('id', [...new Set(ids)]);

  for (const p of (data ?? []) as PerfilResumo[] & { id: string }[]) {
    mapa.set(p.id, { nome: p.nome, usuario: p.usuario, foto_url: p.foto_url });
  }
  return mapa;
}

/** A última mensagem de cada conversa, para a prévia da lista. */
async function buscarUltimaMensagem(
  conversas: string[],
): Promise<Map<string, { texto: string | null; autor_id: string | null }>> {
  const mapa = new Map<string, { texto: string | null; autor_id: string | null }>();
  if (!conversas.length) return mapa;

  const { data } = await db('chat_mensagens')
    .select('conversa_id, texto, autor_id, anexos, criado_em')
    .in('conversa_id', conversas)
    .order('criado_em', { ascending: false });

  // A consulta vem do mais novo para o mais velho: a primeira de cada conversa
  // é a que interessa, e as seguintes são descartadas sem custo.
  for (const m of (data ?? []) as { conversa_id: string; texto: string | null; autor_id: string | null; anexos: AnexoChat[] }[]) {
    if (mapa.has(m.conversa_id)) continue;
    const anexos = Array.isArray(m.anexos) ? m.anexos : [];
    mapa.set(m.conversa_id, {
      texto: m.texto ?? (anexos.length ? rotuloAnexo(anexos) : null),
      autor_id: m.autor_id,
    });
  }
  return mapa;
}

/** Quando o OUTRO leu por último — o «visualizou» das minhas mensagens. */
async function buscarLeituraDosOutros(
  conversas: string[], meuId: string,
): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>();
  if (!conversas.length) return mapa;

  const { data } = await db('chat_participantes')
    .select('conversa_id, perfil_id, ultima_leitura_em')
    .in('conversa_id', conversas);

  for (const p of (data ?? []) as { conversa_id: string; perfil_id: string; ultima_leitura_em: string | null }[]) {
    if (p.perfil_id === meuId) continue;
    mapa.set(p.conversa_id, p.ultima_leitura_em);
  }
  return mapa;
}

async function contarNaoLidas(
  linhas: { conversa_id: string; ultima_leitura_em: string | null }[], meuId: string,
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (!linhas.length) return mapa;

  const { data } = await db('chat_mensagens')
    .select('conversa_id, autor_id, criado_em')
    .in('conversa_id', linhas.map(l => l.conversa_id));

  const lidoAte = new Map(linhas.map(l => [l.conversa_id, l.ultima_leitura_em]));
  for (const m of (data ?? []) as { conversa_id: string; autor_id: string | null; criado_em: string }[]) {
    if (m.autor_id === meuId) continue;
    const marca = lidoAte.get(m.conversa_id);
    if (marca && m.criado_em <= marca) continue;
    mapa.set(m.conversa_id, (mapa.get(m.conversa_id) ?? 0) + 1);
  }
  return mapa;
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
 * `listarConversas` descarta conversa sem mensagem de propósito — aberta e
 * abandonada viraria uma linha vazia que não some sozinha. Só que a conversa
 * RECÉM-CRIADA também não tem mensagem nenhuma, e sem esta função a tela abria
 * um painel em branco: a conversa não estava na lista, e no tamanho compacto a
 * lista já tinha saído de cena para dar lugar a ela.
 */
export async function buscarConversa(
  conversaId: string, meuId: string,
): Promise<ConversaChat | null> {
  const { data, error } = await db('chat_conversas')
    .select('id, par_menor, par_maior, ultima_mensagem_em')
    .eq('id', conversaId)
    .maybeSingle() as unknown as {
      data: { id: string; par_menor: string; par_maior: string; ultima_mensagem_em: string | null } | null;
      error: { message: string } | null;
    };

  if (error || !data) return null;

  const outroId = data.par_menor === meuId ? data.par_maior : data.par_menor;
  const [perfis, empresas] = await Promise.all([
    buscarPerfis([outroId]),
    buscarEmpresasDosOutros(),
  ]);
  const p = perfis.get(outroId);

  return {
    id:                 data.id,
    outro_id:           outroId,
    outro_nome:         p?.nome ?? 'Sem nome',
    outro_usuario:      p?.usuario ?? null,
    outro_foto:         p?.foto_url ?? null,
    ultima_mensagem_em: data.ultima_mensagem_em,
    ultimo_texto:       null,
    ultimo_autor_id:    null,
    nao_lidas:          0,
    leitura_do_outro:   null,
    outro_empresa:      empresas.get(outroId) ?? null,
  };
}

export async function listarMensagens(conversaId: string): Promise<MensagemChat[]> {
  const { data, error } = await db('chat_mensagens')
    .select('id, conversa_id, autor_id, texto, anexos, criado_em, disparo_id, expurgado_em')
    .eq('conversa_id', conversaId)
    .order('criado_em', { ascending: true });

  if (error) {
    console.warn('[chat] listarMensagens:', error.message);
    return [];
  }
  return ((data ?? []) as MensagemChat[]).map(m => ({
    ...m, anexos: Array.isArray(m.anexos) ? m.anexos : [],
  }));
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

/** Marca a conversa como lida até agora. */
export async function marcarLido(conversaId: string, meuId: string): Promise<void> {
  const { error } = await db('chat_participantes')
    .update({ ultima_leitura_em: new Date().toISOString() })
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
  arquivo: File, conversaId: string,
): Promise<{ anexo: AnexoChat | null; erro: string | null }> {
  if (arquivo.size > LIMITE_ANEXO) {
    return { anexo: null, erro: `«${arquivo.name}» passa de 10 MB.` };
  }

  const limpo = arquivo.name.replace(/[^\w.-]+/g, '_').slice(-80);
  const caminho = `${conversaId}/${crypto.randomUUID()}-${limpo}`;

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
export async function urlDoAnexo(caminho: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('chat').createSignedUrl(caminho, 3600);
  if (error) {
    console.warn('[chat] urlDoAnexo:', error.message);
    return null;
  }
  return data?.signedUrl ?? null;
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
