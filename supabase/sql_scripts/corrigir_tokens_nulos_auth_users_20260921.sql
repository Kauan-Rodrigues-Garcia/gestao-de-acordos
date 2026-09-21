-- ============================================================================
-- «Entrar como» falha no Comercial: Database error finding user (21/09/2026)
-- ============================================================================
--
-- ✅ RODADO em 21/09/2026 via MCP, com «pode» do usuário para cada bloco.
--    BLOCO 1 devolveu 49 contas, todas do COMERCIAL (nenhuma outra empresa).
--    BLOCO 2 aplicou; a conferência interna passou (zero token nulo restante).
--    Não precisa rodar de novo — rodar atinge 0 linhas. Script criador de conta
--    novo por SQL deve preencher as OITO colunas com '' (ver lista abaixo).
--
-- ## O sintoma
--
--   Falha ao gerar sessão do alvo (500).
--   {"code":500,"error_code":"unexpected_failure","msg":"Database error finding user"}
--
-- Vem de `api/impersonar-usuario.ts`, no passo que chama
-- `POST /auth/v1/admin/generate_link` para a conta-alvo.
--
-- ## A causa provável
--
-- O GoTrue lê as colunas de token de `auth.users` como texto NÃO nulo. Conta
-- criada por INSERT direto em `auth.users` (script SQL, não pela Admin API)
-- que deixou alguma delas NULL faz toda leitura do usuário estourar com
-- «converting NULL to string is unsupported» — e o GoTrue devolve isso como
-- «Database error finding user» (no login com senha, como «Database error
-- querying schema»).
--
-- As 45 contas do Comercial (`{login}@interno.sistema`, senha comercial@001)
-- foram criadas por SQL em 15/09. Os scripts desta pasta que criam conta
-- (`criar_operadores_*.sql`) preenchem com '' só algumas das colunas; as que
-- ficam de fora dependem do DEFAULT do banco, e algumas não têm DEFAULT.
--
-- ============================================================================
-- BLOCO 1 — DIAGNÓSTICO (leitura). Não altera nada.
-- ============================================================================
-- Quantas contas têm alguma coluna de token nula, por empresa. Espera-se ver
-- o Comercial aqui; se aparecer zero, a causa é outra e o BLOCO 2 não resolve.

SELECT
  COALESCE(e.nome, '(sem perfil)')                                  AS empresa,
  COUNT(*)                                                          AS contas_afetadas,
  COUNT(*) FILTER (WHERE u.confirmation_token          IS NULL)     AS confirmation_token,
  COUNT(*) FILTER (WHERE u.recovery_token              IS NULL)     AS recovery_token,
  COUNT(*) FILTER (WHERE u.email_change_token_new      IS NULL)     AS email_change_token_new,
  COUNT(*) FILTER (WHERE u.email_change_token_current  IS NULL)     AS email_change_token_current,
  COUNT(*) FILTER (WHERE u.email_change                IS NULL)     AS email_change,
  COUNT(*) FILTER (WHERE u.phone_change                IS NULL)     AS phone_change,
  COUNT(*) FILTER (WHERE u.phone_change_token          IS NULL)     AS phone_change_token,
  COUNT(*) FILTER (WHERE u.reauthentication_token      IS NULL)     AS reauthentication_token
FROM auth.users u
LEFT JOIN public.perfis   p ON p.id = u.id
LEFT JOIN public.empresas e ON e.id = p.empresa_id
WHERE u.confirmation_token         IS NULL
   OR u.recovery_token             IS NULL
   OR u.email_change_token_new     IS NULL
   OR u.email_change_token_current IS NULL
   OR u.email_change               IS NULL
   OR u.phone_change               IS NULL
   OR u.phone_change_token         IS NULL
   OR u.reauthentication_token     IS NULL
GROUP BY 1
ORDER BY 2 DESC;

-- ============================================================================
-- BLOCO 2 — CORREÇÃO (escrita). Só depois do BLOCO 1 e de um «pode» próprio.
-- ============================================================================
-- Troca NULL por '' — exatamente o que a Admin API grava quando cria a conta.
-- Não mexe em senha, e-mail, confirmação, sessão nem metadados: só nas colunas
-- de token que estão NULL. Linhas atingidas = `contas_afetadas` do BLOCO 1
-- (somando as empresas). Idempotente: rodar de novo atinge 0 linhas.
--
-- Transação com conferência: se sobrar alguma conta com token nulo, desfaz.

BEGIN;

UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change               = COALESCE(email_change, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE confirmation_token         IS NULL
   OR recovery_token             IS NULL
   OR email_change_token_new     IS NULL
   OR email_change_token_current IS NULL
   OR email_change               IS NULL
   OR phone_change               IS NULL
   OR phone_change_token         IS NULL
   OR reauthentication_token     IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users
     WHERE confirmation_token IS NULL OR recovery_token IS NULL
        OR email_change_token_new IS NULL OR email_change_token_current IS NULL
        OR email_change IS NULL OR phone_change IS NULL
        OR phone_change_token IS NULL OR reauthentication_token IS NULL
  ) THEN
    RAISE EXCEPTION 'Ainda há conta com token nulo — nada foi gravado.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Se o BLOCO 1 vier zerado
-- ============================================================================
-- A causa é outra. As duas que sobram, em ordem de probabilidade:
--   1. Duas contas com o mesmo e-mail em `auth.users` (maiúscula/minúscula):
--        SELECT LOWER(email), COUNT(*) FROM auth.users GROUP BY 1 HAVING COUNT(*) > 1;
--   2. Conta sem linha em `auth.identities`:
--        SELECT u.email FROM auth.users u
--         WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id);
-- E o log do Auth mostra a frase exata do Postgres (Dashboard › Logs › Auth).
