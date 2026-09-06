-- Editar usuário: uma chave por campo, e o painel mandando na exclusão.
--
-- IMPORTANTE: preparado para aplicação manual. Não é executado pelo frontend.
--
-- ## O que esta migration resolve
--
-- Até 06/09/2026 o que se podia mexer na janela de edição estava decidido no
-- CÓDIGO: nome, login e foto abriam para quem conseguisse abrir a janela; cargo
-- e senha exigiam `usuarios_administrar`; e excluir não checava nada. Quem
-- quisesse um líder que corrige nome mas não troca login não tinha como pedir —
-- a granularidade não existia em lugar nenhum para ser configurada.
--
-- Agora cada campo tem chave própria. Esta migration:
--   1. acrescenta as seis chaves ao catálogo do banco;
--   2. SEMEIA cada uma a partir do comportamento anterior, para que ninguém
--      perca nada no deploy;
--   3. tira a lista de cargo fixa de dentro de `fn_admin_delete_user`.
--
-- ## Sem o passo 2, o deploy tira poder de todo mundo
--
-- `useCargoPermissoes` responde NÃO para chave ausente (a doutrina desde
-- 2026-08-15: sem ausência para interpretar, não há divergência entre o que a
-- tela mostra e o que o sistema faz). A migration `20260815154058` deu a todo
-- cargo o catálogo inteiro — então uma chave NOVA nasce ausente das linhas já
-- gravadas e resolve como `false`.
--
-- Traduzindo: se o frontend subir antes desta migration, todo cargo que não
-- seja administrador abre a janela de edição com TODOS os campos de cadeado.
-- Rode isto ANTES do deploy, ou junto dele.
--
-- ## De onde vem cada semente
--
--   nome, login, foto ... de quem já conseguia abrir a janela, que era
--                         `usuarios_administrar` OU `usuarios_editar_do_setor`
--   cargo, senha ........ de `usuarios_administrar`, que era o gate na tela
--   excluir ............. de `usuarios_administrar` também — a tela mostrava o
--                         botão para mais gente, mas `fn_admin_delete_user` só
--                         deixava administrador passar. Semear pelo que o
--                         SERVIDOR permitia não dá a ninguém nada novo.
--
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Catálogo ─────────────────────────────────────────────────────────────
-- Preserva o catálogo anterior e acrescenta as chaves desta evolução, sem
-- reescrever a lista inteira (e sem risco de apagar uma chave recente).

ALTER FUNCTION public.fn_permissoes_catalogo()
  RENAME TO fn_permissoes_catalogo_antes_campos_20260906;

CREATE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_campos_20260906()
  UNION ALL
  SELECT * FROM (VALUES
    ('usuarios_editar_nome',     NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('usuarios_editar_login',    NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('usuarios_editar_foto',     NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false),
    ('usuarios_editar_cargo',    NULL::TEXT[], ARRAY[]::TEXT[], false),
    ('usuarios_redefinir_senha', NULL::TEXT[], ARRAY[]::TEXT[], false),
    ('usuarios_excluir',         NULL::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catálogo completo de permissões. A extensão 20260906 acrescenta as chaves de '
  'edição campo a campo na janela de usuário, sem perder o catálogo anterior.';

-- ── 2. Semeadura ────────────────────────────────────────────────────────────
-- O `|| cp.permissoes` no fim é o que garante que nada regride: se a chave já
-- existir na linha (reaplicação, ou alguém já configurou), o valor gravado
-- vence a semente. Só chave ausente recebe o valor derivado.

UPDATE public.cargos_permissoes cp
SET permissoes = jsonb_build_object(
  -- Quem já abria a janela editava estes três, sem chave nenhuma no meio.
  'usuarios_editar_nome',
    COALESCE((cp.permissoes->>'usuarios_administrar')::BOOLEAN, false)
    OR COALESCE((cp.permissoes->>'usuarios_editar_do_setor')::BOOLEAN, false),
  'usuarios_editar_login',
    COALESCE((cp.permissoes->>'usuarios_administrar')::BOOLEAN, false)
    OR COALESCE((cp.permissoes->>'usuarios_editar_do_setor')::BOOLEAN, false),
  'usuarios_editar_foto',
    COALESCE((cp.permissoes->>'usuarios_administrar')::BOOLEAN, false)
    OR COALESCE((cp.permissoes->>'usuarios_editar_do_setor')::BOOLEAN, false),
  -- Cargo e senha eram presos a `usuarios_administrar` na tela.
  'usuarios_editar_cargo',
    COALESCE((cp.permissoes->>'usuarios_administrar')::BOOLEAN, false),
  'usuarios_redefinir_senha',
    COALESCE((cp.permissoes->>'usuarios_administrar')::BOOLEAN, false),
  -- Excluir: pelo que o SERVIDOR permitia, não pelo que a tela mostrava.
  'usuarios_excluir',
    COALESCE((cp.permissoes->>'usuarios_administrar')::BOOLEAN, false)
) || cp.permissoes;

-- ── 3. A exclusão passa a obedecer o painel ─────────────────────────────────
--
-- `fn_admin_delete_user` conferia `fn_user_has_any_role(['administrador',
-- 'super_admin'])` — lista de cargo fixa DENTRO do banco, acima do painel. Uma
-- diretoria com todos os interruptores ligados não excluía ninguém, e nenhuma
-- chave era capaz de mudar isso.
--
-- Troca pela chave. `fn_user_tem` já responde `true` para acesso total
-- (administrador/super_admin) antes de olhar tabela, então quem excluía
-- continua excluindo — e agora quem o painel autorizar também.
--
-- Só o gate muda; o corpo da função segue igual. Substitua o bloco abaixo pelo
-- corpo VIGENTE de `fn_admin_delete_user` antes de rodar, se ela tiver mudado
-- depois de 20260903390000 — reescrever a função inteira a partir de uma cópia
-- velha desfaria correções posteriores.

DO $gate$
DECLARE
  v_src TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_admin_delete_user';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'fn_admin_delete_user não existe — confira antes de seguir.';
  END IF;

  IF position('fn_user_has_any_role' IN v_src) = 0 THEN
    RAISE NOTICE 'fn_admin_delete_user já não usa lista de cargo fixa. Nada a fazer.';
    RETURN;
  END IF;

  -- Troca APENAS a linha do gate, preservando todo o resto da função como está
  -- hoje no banco. Assim a migration não carrega uma cópia do corpo que possa
  -- estar defasada.
  v_src := replace(
    v_src,
    'public.fn_user_has_any_role(ARRAY[''administrador'',''super_admin''])',
    'public.fn_user_tem(''usuarios_excluir'')'
  );
  v_src := replace(
    v_src,
    'public.fn_user_has_any_role(ARRAY[''administrador'', ''super_admin''])',
    'public.fn_user_tem(''usuarios_excluir'')'
  );

  IF position('fn_user_has_any_role' IN v_src) > 0 THEN
    RAISE EXCEPTION
      'O gate de fn_admin_delete_user não casou com nenhum dos formatos '
      'esperados. Ajuste a substituição à mão em vez de gravar pela metade.';
  END IF;

  EXECUTE v_src;
END
$gate$;

COMMIT;


-- ── Conferência. SOMENTE LEITURA, rode depois ───────────────────────────────
--
-- Espere: uma linha por cargo, com as chaves novas coerentes com as antigas.

SELECT cargo,
       permissoes->>'usuarios_administrar'      AS administrar,
       permissoes->>'usuarios_editar_do_setor'  AS edita_do_setor,
       permissoes->>'usuarios_editar_nome'      AS nome,
       permissoes->>'usuarios_editar_login'     AS login,
       permissoes->>'usuarios_editar_foto'      AS foto,
       permissoes->>'usuarios_editar_cargo'     AS cargo_,
       permissoes->>'usuarios_redefinir_senha'  AS senha,
       permissoes->>'usuarios_excluir'          AS excluir
  FROM public.cargos_permissoes
 ORDER BY empresa_id, cargo;

-- E o gate da exclusão, que deve citar a chave e não mais a lista de cargo:
SELECT position('usuarios_excluir' IN pg_get_functiondef(p.oid)) > 0 AS usa_a_chave,
       position('fn_user_has_any_role' IN pg_get_functiondef(p.oid)) > 0 AS ainda_tem_lista
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'fn_admin_delete_user';
