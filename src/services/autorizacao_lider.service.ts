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
 *   3. Verifica o cargo contra `PERFIS_AUTORIZADORES` (lib/index), que espelha
 *      a checagem do servidor em `fn_transferir_acordo_nr`.
 *
 * ## Este é o único caminho de autorização
 *
 * `AcordoNovoInline` e `AcordoForm` tinham cópias inline deste mesmo fluxo, e
 * as cópias divergiram: o AcordoForm aceitava só `lider/administrador/
 * super_admin` (barrando elite, gerência e diretoria) e nem resolvia
 * usuário→e-mail, então o mesmo líder conseguia autorizar numa tela e era
 * recusado na outra. Quem precisar autenticar um líder chama daqui.
 */

import { podeAutorizarTabulacao, PERFIL_LABELS } from '@/lib/index';

/**
 * Resolve um identificador de login (USUÁRIO ou e-mail) para o e-mail de
 * autenticação — mesmo fluxo do login em useAuth. Sem isto, o líder que digita
 * o próprio usuário (como faz no login) era rejeitado: o grant_type=password do
 * GoTrue só aceita e-mail. Se não resolver, devolve o texto original para o
 * grant falhar naturalmente com "credenciais inválidas".
 *
 * supabase/tenant são importados dinamicamente: com e-mail (caso comum) a
 * função retorna antes de tocar no client, e o teste do service — que não
 * mocka o supabase — não carrega o client no import.
 */
export async function resolverEmailDeLogin(identifier: string): Promise<string> {
  const id = identifier.trim();
  if (id.includes('@')) return id;

  const { supabase } = await import('@/lib/supabase');
  const { getConfiguredTenantSlug } = await import('@/lib/tenant');

  const tenantSlug = getConfiguredTenantSlug();
  if (tenantSlug) {
    const { data, error } = await supabase.rpc('buscar_email_por_usuario_empresa', {
      p_usuario: id, p_empresa_slug: tenantSlug,
    });
    if (!error && data) return data as string;
  }
  const { data, error } = await supabase.rpc('buscar_email_por_usuario', { p_usuario: id });
  if (!error && data) return data as string;

  return id;
}

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
  const rawId = params.email.trim();
  const senha = params.senha;

  if (!rawId || !senha) {
    return { ok: false, erro: 'Informe o e-mail e a senha do líder' };
  }

  const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  if (!supabaseUrl || !supabaseAnon) {
    return { ok: false, erro: 'Configuração de ambiente ausente' };
  }

  // Aceita usuário OU e-mail, igual ao login.
  const email = await resolverEmailDeLogin(rawId);

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

  // 3. Verificar se o cargo pode autorizar.
  //
  // `PERFIS_AUTORIZADORES` espelha a checagem do servidor cargo a cargo. Antes
  // isto usava `isPerfilAdminOuLider`, que inclui `ouvidoria` (o servidor
  // recusa) e deixa `diretoria` de fora (o servidor aceita) — ou seja, aprovava
  // quem seria barrado depois e barrava quem tinha direito.
  if (!podeAutorizarTabulacao(liderPerfil.perfil)) {
    return {
      ok: false,
      erro: `O cargo "${PERFIL_LABELS[liderPerfil.perfil] ?? liderPerfil.perfil}" não tem permissão para autorizar tabulações. `
          + 'É necessário líder, elite, gerência, diretoria ou administrador.',
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
