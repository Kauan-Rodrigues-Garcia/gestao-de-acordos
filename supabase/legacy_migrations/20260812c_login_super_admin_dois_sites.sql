-- ═══════════════════════════════════════════════════════════════════════════
-- LOGIN — super_admin volta a entrar pelos dois sites com nome de usuário
-- ═══════════════════════════════════════════════════════════════════════════
-- Sintoma relatado em 12/08/2026: dos quatro super_admins, só um consegue entrar
-- tanto pelo site da PaguePlay quanto pelo da BookPlay.
--
-- ── A causa ─────────────────────────────────────────────────────────────────
-- Existem DUAS funções `buscar_email_por_usuario` no banco:
--
--   buscar_email_por_usuario(p_usuario text)                          ← do repositório
--   buscar_email_por_usuario(p_usuario text, p_empresa_slug text DEFAULT NULL)
--
-- A segunda não está em nenhuma migration — foi criada direto no SQL Editor, e
-- pela leitura do corpo dela a intenção era boa: ela tem um fallback explícito
-- ("super_admin pode não ter empresa_id filtrado, buscar sem empresa"), ou seja,
-- foi escrita justamente para resolver o login cruzado.
--
-- O problema é a FORMA. Como o segundo parâmetro tem DEFAULT, uma chamada com
-- um argumento só passa a servir para as duas funções — e o PostgREST não tem
-- como escolher:
--
--   POST /rest/v1/rpc/buscar_email_por_usuario  {"p_usuario":"..."}
--   → HTTP 300  PGRST203
--     "Could not choose the best candidate function between:
--        public.buscar_email_por_usuario(p_usuario => text),
--        public.buscar_email_por_usuario(p_usuario => text, p_empresa_slug => text)"
--
-- Verificado contra o projeto em 12/08/2026, pelo mesmo endpoint que o
-- navegador usa. A função escrita para consertar o login cruzado é o que o
-- quebrou.
--
-- ── Por que só um super_admin conseguia ─────────────────────────────────────
-- O login em `useAuth.signIn` tem três caminhos:
--
--   1. Identificador com "@"  → é e-mail, NÃO consulta função nenhuma.  ✅
--   2. Nome de usuário, site da PRÓPRIA empresa
--      → `buscar_email_por_usuario_empresa(usuario, slug)` — nome único,
--        sem ambiguidade → devolve o e-mail.                            ✅
--   3. Nome de usuário, site da OUTRA empresa
--      → a chamada 2 devolve NULL (o perfil não é daquela empresa)
--      → cai no fallback `buscar_email_por_usuario(usuario)`
--      → HTTP 300, o frontend lê como erro e responde
--        "Usuário não encontrado neste site".                           ❌
--
-- O único super_admin que entrava nos dois lados tem e-mail real e o digita —
-- caminho 1. Os outros três usam nome de usuário (dois deles têm e-mail
-- sintético `@interno.sistema`, que ninguém digita) — caminho 3.
--
-- Não era permissão, não era RLS, não era cargo: era o lookup de e-mail
-- respondendo 300 em vez de devolver o endereço.
--
-- ── Efeito colateral que ninguém tinha ligado ───────────────────────────────
-- `resolverEmailDeLogin` (src/services/autorizacao_lider.service.ts) usa o mesmo
-- fallback. Com ele em 300, a autorização de líder por NOME DE USUÁRIO também
-- falhava sempre que o líder não fosse da empresa do site — e o erro chegava
-- como "credenciais inválidas", mandando procurar problema na senha.
--
-- Idempotente.

-- ─── A correção ─────────────────────────────────────────────────────────────
-- Remove a sobrecarga. Não é perda de funcionalidade: nada no código chama
-- `buscar_email_por_usuario` com dois argumentos — quem precisa de empresa
-- chama `buscar_email_por_usuario_empresa`, que continua intacta. Confirmado em
-- src/hooks/useAuth.tsx, src/pages/Registro.tsx e
-- src/services/autorizacao_lider.service.ts.
--
-- E a busca cruzada que ela tentava fazer já existe: a versão de um argumento
-- delega para `buscar_email_por_usuario_empresa(p_usuario, NULL)`, que procura
-- em TODAS as empresas — que é exatamente o fallback do caminho 3.
DROP FUNCTION IF EXISTS public.buscar_email_por_usuario(text, text);

-- ─── Garantir a versão boa ──────────────────────────────────────────────────
-- Recriada aqui para que este arquivo, sozinho, deixe o login num estado
-- conhecido — sem depender de a 17_fix_signup_login_tenant ter sido aplicada.
CREATE OR REPLACE FUNCTION public.buscar_email_por_usuario(p_usuario TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Slug NULL = procura em todas as empresas. É o fallback do login cruzado:
  -- quem digita o nome de usuário no site da outra empresa chega aqui.
  --
  -- A trava de tenant continua valendo DEPOIS, no `fetchPerfil`: quem não é
  -- super_admin autentica e é recusado com "seu usuário está vinculado a outra
  -- empresa". Esta função resolve endereço, não decide acesso.
  RETURN public.buscar_email_por_usuario_empresa(p_usuario, NULL);
END $$;

COMMENT ON FUNCTION public.buscar_email_por_usuario(TEXT) IS
  'Resolve nome de usuário para e-mail em QUALQUER empresa — fallback do login '
  'pelo site da outra operação, usado por super_admin. NÃO pode ser '
  'sobrecarregada: duas versões deste nome tornam a chamada ambígua para o '
  'PostgREST (PGRST203) e derrubam o login cruzado. Ver 20260812c.';

GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario(TEXT) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
-- Falha alto e claro se a ambiguidade voltar, e mostra, para cada super_admin,
-- o que o login devolve em cada um dos dois sites.
DO $$
DECLARE
  r          RECORD;
  v_versoes  INT;
BEGIN
  SELECT count(*) INTO v_versoes
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'buscar_email_por_usuario';

  IF v_versoes <> 1 THEN
    RAISE EXCEPTION
      'buscar_email_por_usuario tem % versões — com mais de uma, o PostgREST '
      'responde PGRST203 e o login por nome de usuário quebra.', v_versoes;
  END IF;

  RAISE NOTICE '─── Login por nome de usuário, por super_admin e por site ───';
  FOR r IN
    SELECT p.usuario,
           e.slug AS empresa_do_perfil,
           public.buscar_email_por_usuario_empresa(p.usuario, 'pagueplay') AS no_site_pagueplay,
           public.buscar_email_por_usuario_empresa(p.usuario, 'bookplay')  AS no_site_bookplay,
           public.buscar_email_por_usuario(p.usuario)                      AS fallback_cruzado
      FROM public.perfis p
      LEFT JOIN public.empresas e ON e.id = p.empresa_id
     WHERE p.perfil = 'super_admin'
     ORDER BY p.criado_em
  LOOP
    RAISE NOTICE '% (de %): pagueplay=% | bookplay=% | fallback=%',
      r.usuario, r.empresa_do_perfil,
      COALESCE(r.no_site_pagueplay, 'nulo'),
      COALESCE(r.no_site_bookplay,  'nulo'),
      COALESCE(r.fallback_cruzado,  'NULO ← ainda quebrado');
  END LOOP;

  RAISE NOTICE 'Com o fallback devolvendo e-mail, todo super_admin entra pelos dois sites '
               'usando o nome de usuário.';
END $$;
