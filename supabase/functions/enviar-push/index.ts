/**
 * enviar-push — manda o aviso de pagamento (Web Push) para os aparelhos inscritos.
 *
 * Spec: docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md §3–§5.
 *
 * Etapa 2 (esta): `{ acao: 'teste' }`, chamada pela tela do celular logo depois
 * de a pessoa ativar os avisos. Só manda para os aparelhos DE QUEM CHAMOU — o
 * JWT decide quem é, não o corpo da requisição.
 *
 * Etapa 3 (depois): `{ acao: 'rodada' }`, chamada pelo pg_cron para drenar a
 * fila `push_fila`.
 *
 * Secrets (Supabase → Edge Functions → Secrets), NUNCA no repositório:
 *   VAPID_PUBLIC_KEY   a mesma de VITE_VAPID_PUBLIC_KEY na Vercel
 *   VAPID_PRIVATE_KEY  assina o envio
 *   VAPID_SUBJECT      mailto: de contato, exigido pelo protocolo
 * SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm do ambiente da função.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface Inscricao { id: string; endpoint: string; p256dh: string; auth: string }

export interface Aviso { titulo: string; corpo: string; tag?: string; url?: string }

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

  let corpo: { acao?: string };
  try { corpo = await req.json(); } catch { corpo = {}; }

  if (corpo.acao === 'teste') {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user) return resposta(401, { error: 'Sessão inválida.' });

    const { data, error: erroLeitura } = await admin
      .from('push_inscricoes').select('id, endpoint, p256dh, auth').eq('perfil_id', user.id);
    if (erroLeitura) return resposta(500, { error: erroLeitura.message });

    const r = await enviarPara(admin, (data ?? []) as Inscricao[], {
      titulo: 'Pronto! 🔔',
      corpo: 'Você vai ser avisado a cada pagamento que cair.',
      tag: 'teste',
      url: '/#/m',
    });
    return resposta(200, r);
  }

  return resposta(400, { error: 'Ação desconhecida.' });
});
