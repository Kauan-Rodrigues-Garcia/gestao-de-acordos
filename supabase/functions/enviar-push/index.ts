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
 * A rodada também confere a META das equipes (marca do gatilho da importação).
 * Migration 20260930192744.
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
  montarAvisos, montarAvisosDeSaida, montarAvisosMetaEquipe, montarResumosEquipe,
  type Aviso, type AvisosDaPessoa, type EquipeNaMeta, type ItemFila, type ItemSaida,
  type PessoaLote, type PessoaSaida, type ResumoEquipe,
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

/** Mês corrente em São Paulo, `yyyy-MM` — entra na `tag` do aviso de meta. */
function mesAtual(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year')?.value}-${p.find(x => x.type === 'month')?.value}`;
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
  const metasEquipe = await rodadaMetasEquipe(admin);
  return { entradas, saidas, metasEquipe };
}

/**
 * A META das equipes: o banco confere as empresas marcadas pela importação,
 * grava o marco (uma vez por equipe por mês) e devolve só quem bateu agora,
 * com líderes e membros. Sem a migration 20260930192744 a RPC não existe e só
 * registra — o resto da rodada segue.
 */
async function rodadaMetasEquipe(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.rpc('fn_push_metas_equipe_batidas');
  if (error) return { erro: error.message };
  const equipes = (data ?? []) as EquipeNaMeta[];
  if (!equipes.length) return { equipes: 0, avisos: 0 };
  const { avisos } = await entregar(admin, montarAvisosMetaEquipe(equipes));
  return { equipes: equipes.length, avisos };
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
    // Em ordem: os avisos de pagamento antes do de meta.
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

  const porPessoa = montarAvisos(itens, pessoas, corte, mesAtual());
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

    // Ativado na tela da equipe (o líder não recebe aviso de pagamento próprio).
    const daEquipe = corpo.contexto === 'equipe';
    const r = await enviarPara(admin, (data ?? []) as Inscricao[], {
      titulo: 'Pronto! 🔔',
      corpo: daEquipe
        ? 'Você vai receber o aviso quando a equipe bater a meta e, se ligado, o resumo de cada hora.'
        : 'Você vai ser avisado a cada pagamento que cair.',
      tag: 'teste',
      url: daEquipe ? '/#/m/equipe' : '/#/m',
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

  if (corpo.acao === 'resumo_equipes') {
    const { data: confere } = await admin.rpc('fn_push_segredo_confere', {
      p_segredo: req.headers.get('x-push-segredo'),
    });
    if (confere !== true) return resposta(401, { error: 'Não autorizado.' });
    return resposta(200, await rodadaResumoEquipes(admin));
  }

  return resposta(400, { error: 'Ação desconhecida.' });
});
