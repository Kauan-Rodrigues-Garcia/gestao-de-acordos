/**
 * Função serverless (Vercel) — CRIAR usuário pela administração.
 *
 * ## Por que existe (auditoria de segurança, 06/10/2026)
 *
 * A tela de Usuários criava a conta com `auth.signUp` no navegador, mandando o
 * cargo nos metadados, e o gatilho `fn_criar_perfil_novo_usuario` gravava o
 * cargo que viesse. Para isso funcionar o cadastro público do Supabase tinha
 * de ficar ligado — e aí qualquer pessoa com a chave pública (que está no
 * JavaScript do site) criava a própria conta já como `super_admin`.
 *
 * Agora a conta nasce aqui, pela Admin API do GoTrue com a service_role, e só
 * depois de o SERVIDOR conferir quem pediu. Com isso o cadastro público pode
 * ser desligado no painel do Supabase.
 *
 * ## Quem pode
 *
 * A mesma régua da policy `perfis_admin_insert`, perguntada ao banco com o JWT
 * de quem chamou (as funções que a policy usa — nada de regra copiada):
 *
 *   • `fn_user_tem('usuarios_administrar')`;
 *   • `fn_can_access_empresa(empresa)`;
 *   • `fn_user_escopo('usuarios')` ≥ 3, ou = 2 e o setor é o de quem pede.
 *
 * E o cargo: `super_admin` só por super_admin; `administrador` só pela
 * administração (administrador ou super_admin). super_admin passa por tudo.
 *
 * O cargo é gravado DEPOIS da criação, pela service_role: o gatilho de
 * cadastro não confia mais em cargo vindo de metadado.
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

interface Corpo {
  nome?: unknown;
  email?: unknown;
  senha?: unknown;
  perfil?: unknown;
  usuario?: unknown;
  setor_id?: unknown;
  empresa_id?: unknown;
}

const MIN_SENHA = 6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_CARGO = /^[a-z0-9_]{2,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function header(req: ReqLike, nome: string): string | undefined {
  const v = req.headers?.[nome] ?? req.headers?.[nome.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function enderecoCliente(req: ReqLike): string | null {
  const cru = header(req, 'x-forwarded-for') ?? header(req, 'x-real-ip');
  if (!cru) return null;
  return cru.split(',')[0].trim().slice(0, 400) || null;
}

const texto = (v: unknown, max = 200): string =>
  (typeof v === 'string' ? v.trim() : '').slice(0, max);

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || serviceKey
  ).trim();
  if (!url || !serviceKey) {
    res.status(503).json({ error: 'Criação de usuário não configurada no servidor (falta SUPABASE_SERVICE_ROLE_KEY).' });
    return;
  }

  const auth = header(req, 'authorization') || '';
  const callerJwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!callerJwt) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }

  const admin = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  /** Uma função do banco, como QUEM CHAMOU (o JWT dele): a régua das policies. */
  const comoQuemChamou = async (fn: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: publishableKey, Authorization: `Bearer ${callerJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`${fn} recusou (${r.status})`);
    return r.json();
  };

  try {
    // 1) Quem chamou
    const userResp = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${callerJwt}` },
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
    const perfilResp = await fetch(
      `${url}/rest/v1/perfis?id=eq.${encodeURIComponent(caller.id)}&select=perfil,nome,empresa_id`,
      { headers: admin },
    );
    const callerPerfil = ((await perfilResp.json()) as Array<{ perfil?: string; nome?: string; empresa_id?: string }>)[0];
    if (!callerPerfil?.perfil) {
      res.status(403).json({ error: 'Não foi possível identificar o seu perfil.' });
      return;
    }
    const souSuper = callerPerfil.perfil === 'super_admin';

    // 2) O pedido
    let corpo: Corpo;
    try {
      corpo = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Corpo;
    } catch {
      res.status(400).json({ error: 'JSON inválido.' });
      return;
    }
    const nome = texto(corpo?.nome, 120);
    const email = texto(corpo?.email, 254).toLowerCase();
    const senha = typeof corpo?.senha === 'string' ? corpo.senha : '';
    const perfil = texto(corpo?.perfil, 40).toLowerCase();
    const usuario = texto(corpo?.usuario, 60).toLowerCase() || null;
    const setorId = texto(corpo?.setor_id, 36) || null;
    const empresaId = texto(corpo?.empresa_id, 36);

    if (!nome || !EMAIL.test(email)) {
      res.status(400).json({ error: 'Nome e e-mail válidos são obrigatórios.' });
      return;
    }
    if (senha.length < MIN_SENHA || senha.length > 72) {
      res.status(400).json({ error: `A senha deve ter entre ${MIN_SENHA} e 72 caracteres.` });
      return;
    }
    if (!SLUG_CARGO.test(perfil)) {
      res.status(400).json({ error: 'Cargo inválido.' });
      return;
    }
    if (!UUID.test(empresaId) || (setorId !== null && !UUID.test(setorId))) {
      res.status(400).json({ error: 'Empresa ou setor inválido.' });
      return;
    }

    // 3) Pode criar? Mesma régua da policy perfis_admin_insert.
    if (!souSuper) {
      const [tem, alcanca, escopo, meuSetor] = await Promise.all([
        comoQuemChamou('fn_user_tem', { p_chave: 'usuarios_administrar' }),
        comoQuemChamou('fn_can_access_empresa', { target_empresa_id: empresaId }),
        comoQuemChamou('fn_user_escopo', { p_aba: 'usuarios' }),
        comoQuemChamou('fn_user_setor_id'),
      ]);
      const nivel = Number(escopo) || 0;
      const noEscopo = nivel >= 3 || (nivel === 2 && setorId !== null && setorId === meuSetor);
      if (tem !== true || alcanca !== true || !noEscopo) {
        res.status(403).json({ error: 'Você não tem permissão para criar usuário nesta empresa ou setor.' });
        return;
      }
      if (perfil === 'super_admin') {
        res.status(403).json({ error: 'Apenas um super_admin pode criar outro super_admin.' });
        return;
      }
      if (perfil === 'administrador' && callerPerfil.perfil !== 'administrador') {
        res.status(403).json({ error: 'Apenas a administração pode criar um administrador.' });
        return;
      }
    }

    // O cargo existe e está ativo; o setor é da empresa.
    const [cargoResp, setorResp, empresaResp] = await Promise.all([
      fetch(`${url}/rest/v1/cargos?slug=eq.${encodeURIComponent(perfil)}&select=slug,ativo`, { headers: admin }),
      setorId
        ? fetch(`${url}/rest/v1/setores?id=eq.${setorId}&empresa_id=eq.${empresaId}&select=id`, { headers: admin })
        : Promise.resolve(null),
      fetch(`${url}/rest/v1/empresas?id=eq.${empresaId}&select=id,slug`, { headers: admin }),
    ]);
    const cargo = ((await cargoResp.json()) as Array<{ slug: string; ativo: boolean }>)[0];
    if (!cargo || cargo.ativo === false) {
      res.status(400).json({ error: 'Cargo inexistente ou desativado.' });
      return;
    }
    if (setorResp && !((await setorResp.json()) as unknown[]).length) {
      res.status(400).json({ error: 'O setor não pertence a esta empresa.' });
      return;
    }
    const empresa = ((await empresaResp.json()) as Array<{ id: string; slug: string }>)[0];
    if (!empresa) {
      res.status(400).json({ error: 'Empresa não encontrada.' });
      return;
    }

    // 4) A conta. O cargo NÃO vai no metadado: o gatilho cria `operador`.
    const criarResp = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome, usuario, setor_id: setorId, empresa_id: empresaId, empresa_slug: empresa.slug },
      }),
    });
    if (!criarResp.ok) {
      const msg = await criarResp.text().catch(() => '');
      if (criarResp.status === 422 || /already|registered|exists/i.test(msg)) {
        res.status(409).json({ error: 'Já existe uma conta com este e-mail ou usuário.' });
        return;
      }
      console.error('[criar-usuario] GoTrue recusou:', criarResp.status, msg);
      res.status(502).json({ error: 'Não foi possível criar a conta.' });
      return;
    }
    const novo = (await criarResp.json()) as { id?: string };
    if (!novo?.id) {
      res.status(502).json({ error: 'Resposta do provedor sem o id da conta.' });
      return;
    }

    // 5) O cargo, pela service_role (o gatilho de escalada só barra sessão de
    // usuário). Falhou: desfaz a conta, para não sobrar um operador órfão.
    const cargoUpd = await fetch(`${url}/rest/v1/perfis?id=eq.${novo.id}`, {
      method: 'PATCH',
      headers: { ...admin, Prefer: 'return=representation' },
      body: JSON.stringify({ perfil, setor_id: setorId }),
    });
    const gravado = cargoUpd.ok ? ((await cargoUpd.json()) as unknown[]) : [];
    if (!gravado.length) {
      const motivo = cargoUpd.ok ? 'perfil não foi criado' : await cargoUpd.text().catch(() => '');
      console.error('[criar-usuario] cargo não gravado:', motivo);
      await fetch(`${url}/auth/v1/admin/users/${novo.id}`, { method: 'DELETE', headers: admin }).catch(() => {});
      res.status(400).json({ error: `Não foi possível gravar o cargo/setor. ${motivo}`.trim().slice(0, 300) });
      return;
    }

    // 6) Auditoria (best-effort).
    await fetch(`${url}/rest/v1/logs_sistema`, {
      method: 'POST',
      headers: { ...admin, Prefer: 'return=minimal' },
      body: JSON.stringify({
        usuario_id: caller.id,
        usuario_nome: callerPerfil.nome ?? null,
        acao: 'usuario_criado',
        categoria: 'seguranca',
        severidade: 'aviso',
        descricao: `Criou o usuário ${nome} (${perfil})`,
        tabela: 'auth.users',
        registro_id: novo.id,
        alvo_tipo: 'usuario',
        alvo_rotulo: nome,
        empresa_id: empresaId,
        origem: 'api',
        detalhes: { perfil, setor_id: setorId, usuario, email },
        ip: enderecoCliente(req),
        user_agent: header(req, 'user-agent') ?? null,
      }),
    }).catch(() => {/* auditoria falhou, segue */});

    res.status(200).json({ id: novo.id });
  } catch (err) {
    console.error('[criar-usuario] falha:', err);
    res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
}
