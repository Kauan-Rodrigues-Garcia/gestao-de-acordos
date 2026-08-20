/**
 * Função serverless (Vercel) — IMPERSONAÇÃO de usuário (login real).
 *
 * Só super_admin pode chamar. O fluxo:
 *   1. Valida o JWT de quem chamou e confirma perfil = super_admin (no SERVIDOR,
 *      via service_role — a UI sozinha não é confiável).
 *   2. Gera um magic link (OTP) do usuário-alvo com a Admin API do GoTrue.
 *   3. Registra a impersonação em logs_sistema (auditoria).
 *   4. Devolve o `token_hash` — o cliente troca a sessão com verifyOtp.
 *
 * A SERVICE_ROLE_KEY NUNCA chega ao navegador: fica só neste ambiente de
 * servidor. Requer as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 *
 * Salvaguardas: super_admin não pode impersonar outro super_admin.
 */
import { temPermissaoApi } from './_permissoes.js';

interface ReqLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (data: unknown) => void;
}

function header(req: ReqLike, nome: string): string | undefined {
  const v = req.headers?.[nome] ?? req.headers?.[nome.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Endereço de quem chamou, para a trilha de auditoria.
 *
 * `x-forwarded-for` chega como cadeia ("cliente, proxy1, proxy2") quando há
 * intermediários; o PRIMEIRO é o cliente. Os seguintes são infraestrutura e
 * registrá-los junto só polui a coluna.
 *
 * O corte em 400 caracteres é o mesmo que `fn_log_contexto` aplica no banco:
 * cabeçalho é entrada externa, e a coluna não deve virar depósito.
 */
function enderecoCliente(req: ReqLike): string | null {
  const cru = header(req, 'x-forwarded-for') ?? header(req, 'x-real-ip');
  if (!cru) return null;
  return cru.split(',')[0].trim().slice(0, 400) || null;
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(503).json({ error: 'Impersonação não configurada no servidor (falta SUPABASE_SERVICE_ROLE_KEY).' });
    return;
  }

  // JWT de quem está chamando
  const auth = header(req, 'authorization') || '';
  const callerJwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!callerJwt) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }

  const admin = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1) Identidade de quem chamou
    const userResp = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${callerJwt}` },
    });
    if (!userResp.ok) {
      res.status(401).json({ error: 'Sessão inválida.' });
      return;
    }
    const caller = (await userResp.json()) as { id?: string };
    if (!caller?.id) {
      res.status(401).json({ error: 'Sessão inválida.' });
      return;
    }

    // 2) A matriz, e não o nome do cargo, decide a ação.
    const perfilResp = await fetch(
      `${url}/rest/v1/perfis?id=eq.${caller.id}&select=perfil,nome,empresa_id`,
      { headers: admin },
    );
    const perfilArr = (await perfilResp.json()) as Array<{ perfil?: string; nome?: string; empresa_id?: string }>;
    const callerPerfil = Array.isArray(perfilArr) ? perfilArr[0] : null;
    if (!callerPerfil || !await temPermissaoApi({
      url, headers: admin, usuarioId: caller.id, empresaId: callerPerfil.empresa_id,
      cargo: callerPerfil.perfil, chave: 'impersonar_usuarios',
    })) {
      res.status(403).json({ error: 'A permissão de entrar como usuário não está habilitada.' });
      return;
    }

    // 3) Alvo
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { alvoUserId?: string };
    const alvoId = body?.alvoUserId;
    if (!alvoId) {
      res.status(400).json({ error: 'alvoUserId é obrigatório.' });
      return;
    }
    if (alvoId === caller.id) {
      res.status(400).json({ error: 'Você já está logado como você mesmo.' });
      return;
    }

    const alvoResp = await fetch(
      `${url}/rest/v1/perfis?id=eq.${alvoId}&select=id,nome,email,perfil,empresa_id`,
      { headers: admin },
    );
    const alvoArr = (await alvoResp.json()) as Array<{ id: string; nome?: string; email?: string; perfil?: string; empresa_id?: string }>;
    const alvo = Array.isArray(alvoArr) ? alvoArr[0] : null;
    if (!alvo?.email) {
      res.status(404).json({ error: 'Usuário-alvo não encontrado ou sem e-mail.' });
      return;
    }
    const podeCruzarEmpresa = await temPermissaoApi({
      url, headers: admin, usuarioId: caller.id, empresaId: callerPerfil.empresa_id,
      cargo: callerPerfil.perfil, chave: 'gerenciar_multiempresa',
    });
    if (!podeCruzarEmpresa && alvo.empresa_id !== callerPerfil.empresa_id) {
      res.status(403).json({ error: 'Você só pode entrar como usuários da sua empresa.' });
      return;
    }

    // 4) Gera o magic link (OTP) do alvo
    const linkResp = await fetch(`${url}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ type: 'magiclink', email: alvo.email }),
    });
    if (!linkResp.ok) {
      const msg = await linkResp.text().catch(() => '');
      res.status(502).json({ error: `Falha ao gerar sessão do alvo (${linkResp.status}). ${msg}`.trim() });
      return;
    }
    const link = (await linkResp.json()) as { hashed_token?: string; properties?: { hashed_token?: string } };
    const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
    if (!tokenHash) {
      res.status(502).json({ error: 'Resposta do provedor sem token de sessão.' });
      return;
    }

    // 5) Auditoria (best-effort — não bloqueia a impersonação se falhar)
    //
    // Escrita direta, e não pela RPC `fn_log_registrar`: a chamada usa
    // service_role e não tem `auth.uid()`, então a RPC não teria como saber quem
    // é o autor. O formato segue Logs 2.0 (migration 20260812a).
    //
    // Severidade crítica sem hesitação: a partir daqui, tudo que a trilha
    // registrar em nome do alvo foi feito com a mão do administrador.
    await fetch(`${url}/rest/v1/logs_sistema`, {
      method: 'POST',
      headers: { ...admin, Prefer: 'return=minimal' },
      body: JSON.stringify({
        usuario_id: caller.id,
        usuario_nome: callerPerfil.nome ?? null,
        acao: 'impersonar_inicio',
        categoria: 'seguranca',
        severidade: 'critico',
        descricao: `Entrou como ${alvo.nome ?? alvo.email} — os eventos seguintes desta sessão são desta pessoa`,
        tabela: 'auth.users',
        registro_id: alvo.id,
        alvo_tipo: 'usuario',
        alvo_rotulo: alvo.nome ?? alvo.email,
        empresa_id: callerPerfil.empresa_id ?? null,
        origem: 'api',
        detalhes: {
          admin_nome: callerPerfil.nome ?? null,
          alvo_id: alvo.id,
          alvo_nome: alvo.nome ?? null,
          alvo_email: alvo.email,
        },
        /*
         * De onde partiu.
         *
         * Até 17/08/2026 as 103 impersonações registradas não tinham IP nem
         * navegador — nenhuma. O gatilho `trg_log_contexto_padrao` completa
         * esses campos quando vêm nulos, mas ali ele veria o endereço do
         * servidor da Vercel, não o de quem clicou. O endereço real só existe
         * AQUI, no request que chegou, e é este o dado que importa: "quem
         * entrou como quem, e de onde".
         */
        ip: enderecoCliente(req),
        user_agent: header(req, 'user-agent') ?? null,
      }),
    }).catch(() => {/* auditoria falhou, segue */});

    res.status(200).json({
      token_hash: tokenHash,
      alvo: { id: alvo.id, nome: alvo.nome ?? '', email: alvo.email, perfil: alvo.perfil ?? '' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao impersonar.';
    res.status(500).json({ error: msg });
  }
}
