/**
 * enviar-push — manda o aviso de pagamento (Web Push) para os aparelhos inscritos.
 *
 * Spec: docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md §3–§5.
 *
 * `{ acao: 'teste' }` — a tela do celular chama logo depois de a pessoa ativar
 * os avisos. Só manda para os aparelhos DE QUEM CHAMOU: a sessão (getUser)
 * decide quem é, não o corpo da requisição.
 *
 * `{ acao: 'rodada' }` — o pg_cron chama (fn_push_disparar, via pg_net) quando
 * há pendente em `push_fila` ou saída vencida em `push_saidas`. Exige o
 * cabeçalho `x-push-segredo` igual a `push_config.segredo`. Migrations
 * 20260930124757 (entradas) e 20260930175642 (saídas, NR e «hoje»).
 *
 * `{ acao: 'resumo_equipes' }` — o pg_cron chama de hora em hora
 * (fn_push_resumo_disparar): o recebido de cada equipe desde o último resumo,
 * para quem lidera e para quem ligou o resumo. Mesmo segredo da rodada.
 * A rodada também confere as METAS (marca do gatilho da importação): a equipe
 * que alcançou a meta e cada operador que alcançou faixa nova — para a pessoa e
 * para quem lidera. Migrations 20260930192744 e 20260930195304.
 *
 * `{ acao: 'resumo_setores' }` — o pg_cron chama no minuto 10 de cada hora
 * (fn_push_setores_disparar): para a GERÊNCIA, o setor que alcançou a meta e o
 * resumo do setor. Na rodada das metas, o gerente também recebe a equipe e as
 * pessoas do setor que alcançaram meta. Migration 20261007120000.
 *
 * Regra Cofen: todo valor sai só em H.O. (06/10/2026).
 *
 * `{ acao: 'chat' }` — o gatilho de `chat_mensagens` chama na hora em que a
 * mensagem chega (migration 20261005235000). Um aviso por pessoa e conversa,
 * só para quem não está online no gestão; o aviso novo substitui o anterior da
 * mesma conversa. Melhor esforço: aviso que falha não volta para a fila.
 *
 * A função é publicada com verify_jwt DESLIGADO: o cron não tem sessão de
 * usuário, e as duas ações autenticam por conta própria (acima).
 *
 * Secrets (Supabase → Edge Functions → Secrets), NUNCA no repositório:
 *   VAPID_PUBLIC_KEY   a mesma de VITE_VAPID_PUBLIC_KEY na Vercel
 *   VAPID_PRIVATE_KEY  assina o envio
 *   VAPID_SUBJECT      mailto: de contato, exigido pelo protocolo
 * SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm do ambiente da função.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import {
  montarAvisos, montarAvisosChat, montarAvisosDeSaida, montarAvisosMetaEquipe, montarAvisosMetaEquipeGerencia,
  montarAvisosMetaOperador, montarAvisosMetaOperadorGerencia, montarAvisosMetaSetor, montarResumosEquipe,
  montarResumosSetor,
  type Aviso, type AvisosDaPessoa, type EquipeNaMeta, type GerenteDaEquipe, type ItemChat, type ItemFila,
  type ItemSaida, type OperadorNaMeta, type PessoaLote, type PessoaSaida, type ResumoEquipe, type ResumoSetor,
  type SetorNaMeta,
} from './texto.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-segredo',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface Inscricao { id: string; endpoint: string; p256dh: string; auth: string }

/**
 * Manda um aviso para uma lista de aparelhos. 404/410 = a inscrição morreu
 * (app desinstalado, permissão revogada): a linha sai. Outro erro conta falha.
 */
async function enviarPara(
  admin: ReturnType<typeof createClient>, inscricoes: Inscricao[], aviso: Aviso,
): Promise<{ enviados: number; removidos: number; falhas: number }> {
  let enviados = 0, removidos = 0, falhas = 0;
  const payload = JSON.stringify(aviso);
  await Promise.all(inscricoes.map(async (i) => {
    try {
      await webpush.sendNotification(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        payload,
        { TTL: 60 * 60 * 6 },  // aviso com mais de 6 h confunde — ver a spec §5
      );
      enviados++;
      await admin.from('push_inscricoes')
        .update({ ultimo_envio_em: new Date().toISOString(), falhas: 0 }).eq('id', i.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        removidos++;
        await admin.from('push_inscricoes').delete().eq('id', i.id);
      } else {
        falhas++;
        console.error('[enviar-push] falha', status, (e as Error).message);
      }
    }
  }));
  return { enviados, removidos, falhas };
}

/**
 * Uma rodada da fila: pega o lote, monta os avisos por pessoa (texto.ts), manda
 * para cada aparelho e fecha. A pessoa conta como «saiu» se ao menos um aparelho
 * recebeu ou se todos morreram (404/410); só falha de rede/servidor volta para
 * a fila (até a 3ª tentativa — fn_push_concluir).
 */
async function rodada(admin: ReturnType<typeof createClient>) {
  const entradas = await rodadaEntradas(admin);
  const saidas = await rodadaSaidas(admin);
  const metas = await rodadaMetas(admin);
  return { entradas, saidas, metas };
}

/**
 * As METAS: o banco consome as marcas da importação, grava os marcos (uma vez
 * por equipe/mês e por pessoa/mês/faixa) e devolve só o que foi alcançado
 * agora, já com quem recebe — fn_push_metas_da_rodada (20260930195304). Sem a
 * migration a RPC não existe e só registra: o resto da rodada segue.
 */
async function rodadaMetas(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc('fn_push_metas_da_rodada');
  if (error) return { erro: error.message };
  const r = (data ?? {}) as { equipes?: EquipeNaMeta[]; operadores?: OperadorNaMeta[] };
  const equipes = r.equipes ?? [];
  const operadores = r.operadores ?? [];
  if (!equipes.length && !operadores.length) return { equipes: 0, operadores: 0, avisos: 0 };
  const gerencia = await gerentesDasMetas(admin, equipes, operadores);
  const { avisos } = await entregar(admin, [
    ...montarAvisosMetaOperador(operadores),
    ...montarAvisosMetaEquipe(equipes),
    ...montarAvisosMetaEquipeGerencia(equipes, gerencia.equipes),
    ...montarAvisosMetaOperadorGerencia(operadores, gerencia.operadores),
  ]);
  return { equipes: equipes.length, operadores: operadores.length, avisos };
}

/**
 * O gerente do setor de cada equipe da rodada, por chave — 20261007120000.
 * Sem a migration a RPC não existe: o líder e a pessoa recebem como antes.
 */
async function gerentesDasMetas(
  admin: ReturnType<typeof createClient>, equipes: EquipeNaMeta[], operadores: OperadorNaMeta[],
): Promise<{ equipes: GerenteDaEquipe[]; operadores: GerenteDaEquipe[] }> {
  const ler = async (ids: string[], chave: string): Promise<GerenteDaEquipe[]> => {
    if (!ids.length) return [];
    const { data, error } = await admin.rpc('fn_push_gerentes_das_equipes', { p_equipes: ids, p_chave: chave });
    if (error) { console.error('[enviar-push] gerentes', error.message); return []; }
    return (data ?? []) as GerenteDaEquipe[];
  };
  const idsOperadores = [...new Set(operadores.flatMap(o => (o.equipes ?? []).map(e => e.equipe_id)))];
  return {
    equipes: await ler(equipes.map(e => e.equipe_id), 'setor_metas_equipes'),
    operadores: await ler(idsOperadores, 'setor_metas_operadores'),
  };
}

/**
 * A rodada da gerência (minuto 10 de cada hora): o setor que alcançou a meta e
 * o resumo de cada setor — fn_push_rodada_setores (20261007120000).
 */
async function rodadaSetores(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc('fn_push_rodada_setores');
  if (error) return { erro: error.message };
  const r = (data ?? {}) as { metas?: SetorNaMeta[]; resumos?: ResumoSetor[] };
  const metas = r.metas ?? [];
  const resumos = r.resumos ?? [];
  if (!metas.length && !resumos.length) return { metas: 0, resumos: 0, avisos: 0 };
  const { avisos } = await entregar(admin, [...montarAvisosMetaSetor(metas), ...montarResumosSetor(resumos)]);
  return { metas: metas.length, resumos: resumos.length, avisos };
}

/** O resumo por hora do recebido de cada equipe. */
async function rodadaResumoEquipes(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc('fn_push_resumo_equipes');
  if (error) return { erro: error.message };
  const itens = (data ?? []) as ResumoEquipe[];
  if (!itens.length) return { equipes: 0, avisos: 0 };
  const { avisos } = await entregar(admin, montarResumosEquipe(itens));
  return { equipes: itens.length, avisos };
}

/** Manda os avisos de cada pessoa para os aparelhos dela; devolve o que fechar. */
async function entregar(admin: ReturnType<typeof createClient>, porPessoa: AvisosDaPessoa[]) {
  const { data: insc } = await admin
    .from('push_inscricoes').select('id, perfil_id, endpoint, p256dh, auth')
    .in('perfil_id', porPessoa.map(p => p.perfilId));
  const aparelhos = new Map<string, Inscricao[]>();
  for (const i of (insc ?? []) as (Inscricao & { perfil_id: string })[]) {
    const l = aparelhos.get(i.perfil_id) ?? [];
    l.push(i);
    aparelhos.set(i.perfil_id, l);
  }

  const ok: number[] = [];
  const falha: number[] = [];
  let avisos = 0;
  for (const p of porPessoa) {
    const lista = aparelhos.get(p.perfilId) ?? [];
    if (!lista.length) { ok.push(...p.ids); continue; }
    let algumSaiu = false, soFalhaDeRede = true;
    // Em ordem: a pessoa recebe os avisos na ordem em que foram montados.
    for (const aviso of p.avisos) {
      const r = await enviarPara(admin, lista, aviso);
      avisos += r.enviados;
      if (r.enviados > 0) algumSaiu = true;
      if (r.removidos > 0 && r.falhas === 0) soFalhaDeRede = false;
    }
    if (algumSaiu || !soFalhaDeRede) ok.push(...p.ids);
    else falha.push(...p.ids);
  }
  return { ok, falha, avisos };
}

/**
 * Uma rodada da fila de ENTRADA: pega o lote, monta os avisos por pessoa
 * (texto.ts), manda para cada aparelho e fecha. A pessoa conta como «saiu» se
 * ao menos um aparelho recebeu ou se todos morreram (404/410); só falha de
 * rede/servidor volta para a fila (até a 3ª tentativa — fn_push_concluir).
 */
async function rodadaEntradas(admin: ReturnType<typeof createClient>) {
  const { data: lote, error } = await admin.rpc('fn_push_pegar_lote', { p_limite: 500 });
  if (error) return { erro: error.message };
  const itens = ((lote as { itens?: ItemFila[] })?.itens ?? []);
  if (!itens.length) return { pessoas: 0, avisos: 0 };
  const pessoas = (lote as { pessoas?: Record<string, PessoaLote> }).pessoas ?? {};
  const corte = Number((lote as { corte?: number }).corte) || 3;

  const porPessoa = montarAvisos(itens, pessoas, corte);
  const { ok, falha, avisos } = await entregar(admin, porPessoa);
  await admin.rpc('fn_push_concluir', { p_ok: ok, p_falha: falha });
  return { pessoas: porPessoa.length, avisos, ok: ok.length, falha: falha.length };
}

/**
 * Uma rodada das SAÍDAS (pagamento apagado ou transferido). A espera, o
 * «voltou» (limpar e reimportar) e o corte de limpeza em massa ficam no banco
 * (fn_push_pegar_saidas). Sem a migration 20260930175642, a RPC não existe e
 * a rodada só registra — as entradas seguem normais.
 */
async function rodadaSaidas(admin: ReturnType<typeof createClient>) {
  const { data: lote, error } = await admin.rpc('fn_push_pegar_saidas', { p_limite: 500 });
  if (error) return { erro: error.message };
  const itens = ((lote as { itens?: ItemSaida[] })?.itens ?? []);
  if (!itens.length) return { pessoas: 0, avisos: 0 };
  const pessoas = (lote as { pessoas?: Record<string, PessoaSaida> }).pessoas ?? {};
  const corte = Number((lote as { corte?: number }).corte) || 3;

  const porPessoa = montarAvisosDeSaida(itens, pessoas, corte);
  const { ok, falha, avisos } = await entregar(admin, porPessoa);
  await admin.rpc('fn_push_concluir_saidas', { p_ok: ok, p_falha: falha });
  return { pessoas: porPessoa.length, avisos, ok: ok.length, falha: falha.length };
}

/**
 * Uma rodada do chat: a RPC pega o que está pendente, marca quem está online
 * (não recebe) e devolve uma linha por pessoa + conversa com a última mensagem.
 */
async function rodadaChat(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc('fn_push_chat_pegar', { p_limite: 500 });
  if (error) return { erro: error.message };
  const itens = (data ?? []) as ItemChat[];
  if (!itens.length) return { conversas: 0, avisos: 0 };
  const { avisos } = await entregar(admin, montarAvisosChat(itens));
  return { conversas: itens.length, avisos };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta(405, { error: 'Method not allowed' });

  const publica = Deno.env.get('VAPID_PUBLIC_KEY');
  const privada = Deno.env.get('VAPID_PRIVATE_KEY');
  const assunto = Deno.env.get('VAPID_SUBJECT');
  if (!publica || !privada || !assunto) {
    return resposta(503, { error: 'Aviso não configurado no servidor (faltam as chaves VAPID).' });
  }
  webpush.setVapidDetails(assunto, publica, privada);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  let corpo: { acao?: string; contexto?: string };
  try { corpo = await req.json(); } catch { corpo = {}; }

  if (corpo.acao === 'teste') {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user) return resposta(401, { error: 'Sessão inválida.' });

    const { data, error: erroLeitura } = await admin
      .from('push_inscricoes').select('id, endpoint, p256dh, auth').eq('perfil_id', user.id);
    if (erroLeitura) return resposta(500, { error: erroLeitura.message });

    // Ativado na tela da equipe ou do setor (quem lidera ou cuida do setor não
    // recebe aviso de pagamento próprio).
    const contexto = corpo.contexto === 'equipe' || corpo.contexto === 'setor' ? corpo.contexto : null;
    const r = await enviarPara(admin, (data ?? []) as Inscricao[], {
      titulo: 'Avisos ativados',
      corpo: contexto === 'setor'
        ? 'Você vai receber os avisos do setor neste aparelho.'
        : contexto === 'equipe'
          ? 'Você vai receber os avisos da equipe neste aparelho.'
          : 'Você vai ser avisado a cada pagamento que cair.',
      tag: 'teste',
      url: contexto === 'setor' ? '/#/m/setor' : contexto === 'equipe' ? '/#/m/equipe' : '/#/m',
    });
    return resposta(200, r);
  }

  if (corpo.acao === 'rodada') {
    const { data: confere } = await admin.rpc('fn_push_segredo_confere', {
      p_segredo: req.headers.get('x-push-segredo'),
    });
    if (confere !== true) return resposta(401, { error: 'Não autorizado.' });
    return resposta(200, await rodada(admin));
  }

  if (corpo.acao === 'chat') {
    const { data: confere } = await admin.rpc('fn_push_segredo_confere', {
      p_segredo: req.headers.get('x-push-segredo'),
    });
    if (confere !== true) return resposta(401, { error: 'Não autorizado.' });
    return resposta(200, await rodadaChat(admin));
  }

  if (corpo.acao === 'resumo_equipes') {
    const { data: confere } = await admin.rpc('fn_push_segredo_confere', {
      p_segredo: req.headers.get('x-push-segredo'),
    });
    if (confere !== true) return resposta(401, { error: 'Não autorizado.' });
    return resposta(200, await rodadaResumoEquipes(admin));
  }

  if (corpo.acao === 'resumo_setores') {
    const { data: confere } = await admin.rpc('fn_push_segredo_confere', {
      p_segredo: req.headers.get('x-push-segredo'),
    });
    if (confere !== true) return resposta(401, { error: 'Não autorizado.' });
    return resposta(200, await rodadaSetores(admin));
  }

  return resposta(400, { error: 'Ação desconhecida.' });
});
