/**
 * Função serverless (Vercel) — REDEFINIR a senha de um usuário.
 *
 * Substitui a Edge Function `admin-change-password`, que existia em
 * supabase/edge_function/ mas nunca foi publicada: a CLI do Supabase só publica
 * o que está em supabase/functions/<nome>/index.ts, então o invoke do frontend
 * sempre recebeu 404. Aqui a rota sobe junto com o site no deploy da Vercel,
 * no mesmo padrão de api/impersonar-usuario.ts.
 *
 * Não existe "ver a senha": o GoTrue guarda bcrypt, que não é reversível. O
 * admin define uma senha nova e a informa ao usuário — só isso é possível.
 *
 * A SERVICE_ROLE_KEY NUNCA chega ao navegador: fica só neste ambiente de
 * servidor. Requer as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 *
 * Salvaguardas (todas no SERVIDOR — a UI sozinha não é confiável):
 *   - só administrador e super_admin chamam;
 *   - administrador não redefine a senha de um super_admin. Sem isso, um admin
 *     tomaria a conta de um super_admin trocando a senha dela e logando;
 *   - administrador só age dentro da própria empresa;
 *   - ninguém redefine a própria senha por aqui (o usuário tem o modal da
 *     topbar, que exige a sessão dele e não passa pelo service_role).
 */

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

const MIN_SENHA = 6;

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(503).json({ error: 'Troca de senha não configurada no servidor (falta SUPABASE_SERVICE_ROLE_KEY).' });
    return;
  }

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

    // 2) Confirma administrador ou super_admin
    const perfilResp = await fetch(
      `${url}/rest/v1/perfis?id=eq.${caller.id}&select=perfil,nome,empresa_id`,
      { headers: admin },
    );
    const perfilArr = (await perfilResp.json()) as Array<{ perfil?: string; nome?: string; empresa_id?: string }>;
    const callerPerfil = Array.isArray(perfilArr) ? perfilArr[0] : null;
    const callerRole = callerPerfil?.perfil;
    if (!callerPerfil || (callerRole !== 'administrador' && callerRole !== 'super_admin')) {
      res.status(403).json({ error: 'Apenas administradores podem redefinir senhas.' });
      return;
    }

    // 3) Alvo e senha nova
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      alvoUserId?: string;
      novaSenha?: string;
    };
    const alvoId = body?.alvoUserId;
    const novaSenha = body?.novaSenha;
    if (!alvoId || !novaSenha) {
      res.status(400).json({ error: 'alvoUserId e novaSenha são obrigatórios.' });
      return;
    }
    if (novaSenha.length < MIN_SENHA) {
      res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_SENHA} caracteres.` });
      return;
    }
    if (alvoId === caller.id) {
      res.status(400).json({ error: 'Para trocar a sua própria senha, use o botão de chave na barra do topo.' });
      return;
    }

    const alvoResp = await fetch(
      `${url}/rest/v1/perfis?id=eq.${alvoId}&select=id,nome,perfil,empresa_id`,
      { headers: admin },
    );
    const alvoArr = (await alvoResp.json()) as Array<{
      id: string; nome?: string; perfil?: string; empresa_id?: string;
    }>;
    const alvo = Array.isArray(alvoArr) ? alvoArr[0] : null;
    if (!alvo) {
      res.status(404).json({ error: 'Usuário-alvo não encontrado.' });
      return;
    }

    // Escalada de privilégio: um administrador que redefinisse a senha de um
    // super_admin poderia logar como ele. Só super_admin mexe em super_admin.
    if (alvo.perfil === 'super_admin' && callerRole !== 'super_admin') {
      res.status(403).json({ error: 'Apenas um super_admin pode redefinir a senha de outro super_admin.' });
      return;
    }
    // Isolamento entre empresas — super_admin é global, administrador não.
    if (callerRole === 'administrador' && alvo.empresa_id !== callerPerfil.empresa_id) {
      res.status(403).json({ error: 'Você só pode redefinir a senha de usuários da sua empresa.' });
      return;
    }

    // 4) Redefine no GoTrue (Admin API)
    const updResp = await fetch(`${url}/auth/v1/admin/users/${alvoId}`, {
      method: 'PUT',
      headers: admin,
      body: JSON.stringify({ password: novaSenha }),
    });
    if (!updResp.ok) {
      const msg = await updResp.text().catch(() => '');
      res.status(502).json({ error: `Falha ao redefinir a senha (${updResp.status}). ${msg}`.trim() });
      return;
    }

    // 5) Faz o botão de chave voltar para o usuário definir a senha dele.
    //    A senha que o admin digitou é temporária de propósito: enquanto ela
    //    valer, duas pessoas conhecem o acesso.
    await fetch(`${url}/rest/v1/perfis?id=eq.${alvoId}`, {
      method: 'PATCH',
      headers: { ...admin, Prefer: 'return=minimal' },
      body: JSON.stringify({ senha_alterada: false }),
    }).catch(() => {/* senha já trocou; não falha a operação por causa da flag */});

    // 6) Auditoria (best-effort). A senha NUNCA entra no log.
    await fetch(`${url}/rest/v1/logs_sistema`, {
      method: 'POST',
      headers: { ...admin, Prefer: 'return=minimal' },
      body: JSON.stringify({
        usuario_id: caller.id,
        acao: 'senha_redefinida',
        tabela: 'auth.users',
        registro_id: alvo.id,
        empresa_id: callerPerfil.empresa_id ?? null,
        detalhes: {
          admin_nome: callerPerfil.nome ?? null,
          alvo_id: alvo.id,
          alvo_nome: alvo.nome ?? null,
          em: new Date().toISOString(),
        },
      }),
    }).catch(() => {/* auditoria falhou, segue */});

    res.status(200).json({ success: true, alvo: { id: alvo.id, nome: alvo.nome ?? '' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao redefinir a senha.';
    res.status(500).json({ error: msg });
  }
}
