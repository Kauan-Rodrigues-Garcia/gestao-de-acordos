/**
 * Autenticação de líder/admin para operações que exigem autorização superior.
 *
 * Extrai a lógica de `AcordoNovoInline.autorizarTransferencia` (linhas 664-718)
 * para um service puro, de modo a reutilizar o mesmo fluxo de autenticação
 * na importação em lote de acordos (autorização de múltiplos NRs bloqueados).
 *
 * Fluxo:
 *   1. fetch para /auth/v1/token?grant_type=password (não polui a sessão do
 *      operador logado).
 *   2. fetch para /rest/v1/perfis?id=eq.{uid} para verificar o perfil.
 *   3. Verifica se o perfil está na lista de perfis autorizadores (lider,
 *      elite, gerencia, administrador, super_admin) — uniformizando com
 *      `isPerfilAdminOuLider` da lib (que já inclui elite/gerencia).
 */

import { isPerfilAdminOuLider } from '@/lib/index';

export interface AutorizadorInfo {
  uid:    string;
  nome:   string;
  perfil: string;
  token:  string;
}

export type ResultadoAutenticacaoLider =
  | { ok: true;  autorizador: AutorizadorInfo }
  | { ok: false; erro: string };

/**
 * Autentica um líder via e-mail + senha e valida seu perfil.
 *
 * Retorna `{ ok: true, autorizador }` em caso de sucesso ou
 * `{ ok: false, erro }` com uma mensagem amigável pronta para exibir.
 *
 * NÃO toca na sessão do operador logado — usa `fetch` direto.
 */
export async function autenticarLider(params: {
  email:    string;
  senha:    string;
}): Promise<ResultadoAutenticacaoLider> {
  const email = params.email.trim();
  const senha = params.senha;

  if (!email || !senha) {
    return { ok: false, erro: 'Informe o e-mail e a senha do líder' };
  }

  const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  if (!supabaseUrl || !supabaseAnon) {
    return { ok: false, erro: 'Configuração de ambiente ausente' };
  }

  // 1. Autenticar via Supabase Auth REST (não altera a sessão do operador atual).
  let authRes: Response;
  try {
    authRes = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: supabaseAnon },
        body:    JSON.stringify({ email, password: senha }),
      },
    );
  } catch {
    return { ok: false, erro: 'Falha de rede ao autenticar líder' };
  }

  if (!authRes.ok) {
    const s = authRes.status;
    const erro =
      s === 400 || s === 401 || s === 422
        ? 'Credenciais do líder inválidas'
        : `Erro ao autenticar líder (${s})`;
    return { ok: false, erro };
  }

  const authData = (await authRes.json()) as {
    user?:         { id: string };
    access_token?: string;
  };
  const liderUid   = authData.user?.id;
  const liderToken = authData.access_token;
  if (!liderUid || !liderToken) {
    return { ok: false, erro: 'Credenciais do líder inválidas' };
  }

  // 2. Buscar perfil do líder.
  let perfilRes: Response;
  try {
    perfilRes = await fetch(
      `${supabaseUrl}/rest/v1/perfis?id=eq.${liderUid}&select=perfil,nome`,
      {
        headers: {
          apikey:        supabaseAnon,
          Authorization: `Bearer ${liderToken}`,
        },
      },
    );
  } catch {
    return { ok: false, erro: 'Falha de rede ao verificar perfil do líder' };
  }

  if (!perfilRes.ok) {
    return { ok: false, erro: 'Erro ao verificar perfil do líder' };
  }

  const perfilArr = (await perfilRes.json()) as Array<{ perfil: string; nome: string }>;
  const liderPerfil = Array.isArray(perfilArr) && perfilArr.length > 0 ? perfilArr[0] : null;

  if (!liderPerfil) {
    return { ok: false, erro: 'Perfil do líder não encontrado' };
  }

  // 3. Verificar se o perfil é autorizador (inclui elite e gerencia).
  if (!isPerfilAdminOuLider(liderPerfil.perfil)) {
    return {
      ok: false,
      erro: 'O usuário informado não tem permissão de líder/elite/gerência/administrador',
    };
  }

  return {
    ok: true,
    autorizador: {
      uid:    liderUid,
      nome:   liderPerfil.nome,
      perfil: liderPerfil.perfil,
      token:  liderToken,
    },
  };
}
