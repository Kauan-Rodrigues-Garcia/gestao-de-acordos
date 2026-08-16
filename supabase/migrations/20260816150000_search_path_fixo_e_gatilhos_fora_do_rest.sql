-- ============================================================================
-- 20260816150000_search_path_fixo_e_gatilhos_fora_do_rest.sql
--
-- Duas correções de segurança apontadas na auditoria de 16/08/2026.
--
-- ── 1. `search_path` fixo em 25 funções ─────────────────────────────────────
--
-- Sem `SET search_path`, a função resolve nomes pela lista de schemas de QUEM
-- CHAMA. Em `SECURITY DEFINER` isso é vetor conhecido de escalonamento: basta
-- criar um schema com uma função de mesmo nome e colocá-lo antes de `public`
-- para que o corpo da função privilegiada execute código de terceiro.
--
-- São 25 funções do projeto. O linter aponta 56, mas 31 delas pertencem à
-- extensão `pg_trgm` — que está instalada em `public` e por isso entra na
-- conta. Extensão não se altera à mão: o conserto daquelas é mover a extensão
-- de schema, que é outro assunto e não entra aqui.
--
-- `pg_temp` vai por ÚLTIMO de propósito. Quando não é citado, o Postgres o
-- procura ANTES de tudo — inclusive antes de `pg_catalog`. Citá-lo no fim é o
-- que tira o schema temporário da frente.
--
-- ⚠️ `fn_pix_nr_normalizar` sustenta dois índices, um deles UNIQUE
-- (`idx_pix_auto_nr_unico`). O corpo é `SELECT lower(trim(p_nr))` — só
-- built-ins de `pg_catalog`, sem nada resolvido por schema do usuário. Fixar o
-- caminho torna o resultado MAIS determinístico, nunca diferente, então os
-- índices continuam válidos e não precisam de REINDEX.
--
-- ── 2. Funções de gatilho fora do REST ──────────────────────────────────────
--
-- 20 funções que retornam `trigger` estão publicadas em `/rest/v1/rpc/` e
-- executáveis por `anon` e `authenticated`. Elas não são API: existem para o
-- Postgres chamar quando uma linha muda. Chamá-las direto falha (não há
-- `NEW`/`OLD`), mas é superfície exposta sem motivo, e toda varredura marca.
--
-- Revogar EXECUTE não desliga gatilho nenhum. O privilégio é verificado em
-- CREATE TRIGGER, não a cada disparo — o gatilho continua rodando normalmente
-- para quem escreve na tabela.
-- ============================================================================

-- ── 1. search_path ──────────────────────────────────────────────────────────

-- SECURITY DEFINER — a prioridade real desta migration.
ALTER FUNCTION public.buscar_email_por_usuario_empresa(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_criar_perfil_novo_usuario()                SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_log_historico_acordo()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()                             SET search_path = public, pg_temp;

-- Demais funções do projeto. Rodam como quem chama, então o risco é menor,
-- mas a lista precisa fechar em zero para o próximo aviso do linter significar
-- alguma coisa.
ALTER FUNCTION public.fn_atualizar_timestamp()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_contrib_receptivo_touch()                  SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_diario_preencher_setor()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_doc_lgpd_set_atualizado()                  SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_eh_cpf(text)                               SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_log_contexto(text)                         SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_log_rotulo_campo(text)                     SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_nr_campo_chave(text, text)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_pix_dias_uteis_apos(timestamptz, integer)  SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_pix_nr_normalizar(text)                    SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_pix_valida_pagamento()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_pix_valor_br(numeric)                      SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_set_pago_em()                              SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_texto_censurado_cpf()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_texto_tem_cpf(text)                        SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_wpp_limpa_nao_concluido()                  SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_empresa_id_update()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.set_direto_extra_config_updated_at()          SET search_path = public, pg_temp;
ALTER FUNCTION public.set_nr_registros_updated_at()                 SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at_cargos()                       SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at()                           SET search_path = public, pg_temp;

-- ── 2. Gatilhos fora do REST ────────────────────────────────────────────────
--
-- Varre em vez de listar: assim a regra alcança o gatilho que alguém criar
-- depois desta migration, e não vira uma lista para manter à mão.
DO $$
DECLARE
  v_fn  RECORD;
  v_qtd INT := 0;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_type     t ON t.oid = p.prorettype
     WHERE n.nspname = 'public'
       AND t.typname = 'trigger'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_fn.assinatura
    );
    v_qtd := v_qtd + 1;
  END LOOP;

  RAISE NOTICE 'Gatilhos retirados do REST: %', v_qtd;
END $$;

-- ── Verificação ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_sem_path INT;
  v_expostos INT;
BEGIN
  -- Fora as da extensão pg_trgm, nenhuma função pode ficar sem search_path.
  SELECT count(*) INTO v_sem_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND NOT EXISTS (
       SELECT 1 FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
       WHERE d.objid = p.oid AND d.deptype = 'e'
     )
     AND (p.proconfig IS NULL OR NOT EXISTS (
           SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));

  IF v_sem_path > 0 THEN
    RAISE EXCEPTION 'Ainda há % função(ões) do projeto sem search_path fixo', v_sem_path;
  END IF;

  SELECT count(*) INTO v_expostos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type     t ON t.oid = p.prorettype
   WHERE n.nspname = 'public' AND t.typname = 'trigger'
     AND (p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                      WHERE a.grantee = 0
                         OR a.grantee = 'anon'::regrole
                         OR a.grantee = 'authenticated'::regrole));

  IF v_expostos > 0 THEN
    RAISE EXCEPTION 'Ainda há % função(ões) de gatilho chamável(is) pelo REST', v_expostos;
  END IF;

  RAISE NOTICE 'OK: search_path fixo em todas as funções do projeto, nenhum gatilho no REST.';
END $$;
