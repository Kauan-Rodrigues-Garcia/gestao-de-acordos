-- ═══════════════════════════════════════════════════════════════════════════
-- Excluir o setor Play 4 (BookPlay) — some de hoje, o mês fechado fica
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do Cleber em 03/11/2026: «apagar o setor do Play 4 sem prejudicar
-- meses fechados». O Play 4 deixou de existir em 02/10/2026
-- (encerrar_play4_para_play_mix_marilia_20261002.sql) e está desativado desde
-- então.
--
-- PRÉ-REQUISITO: migrations aplicadas —
--   20261103170000_setor_excluido_some_de_hoje.sql (`setores.excluido_em`,
--     o setor some do app);
--   20261103180000_setor_excluido_leva_equipes_e_sai_do_retrato.sql (as
--     equipes do setor somem junto; o retrato do mês em aberto o descarta).
--
-- ## O que faz
--
--   1. apaga as metas do setor de novembro/2026 em diante (mês fechado fica);
--   2. marca o setor como excluído (`excluido_em`). Daí em diante ele e as 5
--      equipes dele não aparecem em lugar nenhum do app — filtro, cadastro,
--      aba Setores, aba Equipes;
--   3. tira o Play 4 e as equipes dele do retrato do mês em aberto (2026-11),
--      para ele não voltar ao filtro quando novembro fechar.
--
-- ## O que NÃO faz, e por quê
--
--   * Não dá DELETE no setor. Um DELETE solta do setor (SET NULL) todo acordo,
--     recebimento, Pix e transferência que passou por ele, e apaga em CASCADE
--     o que é dele em mês fechado. A linha fica só como âncora da história.
--   * Não apaga as equipes. 8 subgrupos do 59 (`mestre_equipes.equipe_id`,
--     SET NULL) apontam para elas, e agosto/setembro leem esse vínculo ao vivo.
--   * Não mexe em acordo, analítico, diário, 59, Pix, transferência nem
--     retrato. Agosto, setembro e outubro continuam como estão.
--   * Não mexe no `codigo_erp` (38). Só o super admin logado edita (gatilho
--     fn_setor_codigo_erp_so_super_admin). A PARTE 1 mostra o valor atual.
--
-- ## Como rodar (SQL Editor do Supabase)
--
--   PARTE 1 — ensaio, só leitura. Rode sozinha e cole o resultado na conversa.
--   PARTE 2 — aplicação. Só depois de conferir a PARTE 1. Tudo num bloco: se
--             qualquer trava falhar, nada é gravado.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — ENSAIO (só leitura)
-- ───────────────────────────────────────────────────────────────────────────
-- Uma tabela só (secao | item | valor), porque o SQL Editor mostra apenas o
-- último resultado. Contagens dinâmicas via query_to_xml, sem criar função (e sem xpath).

WITH
  c AS (
    SELECT 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1'::uuid AS play4,
           (SELECT id FROM public.empresas WHERE slug = 'bookplay') AS empresa
  ),
  equipes_p4 AS (
    SELECT q.id, q.nome FROM public.equipes q, c WHERE q.setor_id = c.play4
  ),
  fk_setores AS (
    SELECT c2.conrelid::regclass::text AS tabela,
           a.attname::text             AS coluna,
           CASE c2.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
                               WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION'
                               ELSE c2.confdeltype::text END AS regra
      FROM pg_catalog.pg_constraint c2
      JOIN pg_catalog.pg_attribute a
        ON a.attrelid = c2.conrelid AND a.attnum = c2.conkey[1]
     WHERE c2.contype = 'f' AND c2.confrelid = 'public.setores'::regclass
  ),
  fk_equipes AS (
    SELECT c2.conrelid::regclass::text AS tabela,
           a.attname::text             AS coluna,
           CASE c2.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
                               WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION'
                               ELSE c2.confdeltype::text END AS regra
      FROM pg_catalog.pg_constraint c2
      JOIN pg_catalog.pg_attribute a
        ON a.attrelid = c2.conrelid AND a.attnum = c2.conkey[1]
     WHERE c2.contype = 'f' AND c2.confrelid = 'public.equipes'::regclass
  )

-- 0. A migration já está aplicada?
SELECT '0 pré-requisito' AS secao, 'setores.excluido_em existe' AS item,
       (EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'setores'
                   AND column_name = 'excluido_em'))::text AS valor
UNION ALL
SELECT '0 pré-requisito', 'policy setores_esconde_excluido existe',
       (EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'setores'
                   AND policyname = 'setores_esconde_excluido'))::text

-- 1. O setor
UNION ALL
SELECT '1 setor', 'linha', (SELECT to_jsonb(s) - 'foto_url' - 'foto_receptivo_url' - 'descricao'
                              FROM public.setores s, c WHERE s.id = c.play4)::text

-- 2. Gente
UNION ALL
SELECT '2 pessoas', 'perfis com setor = Play 4 (ativos/não arquivados)',
       (SELECT count(*) FROM public.perfis p, c
         WHERE p.setor_id = c.play4 AND COALESCE(p.arquivado, false) = false)::text
UNION ALL
SELECT '2 pessoas', 'perfis com setor = Play 4 (arquivados)',
       (SELECT count(*) FROM public.perfis p, c
         WHERE p.setor_id = c.play4 AND COALESCE(p.arquivado, false) = true)::text

-- 3. Equipes
UNION ALL
SELECT '3 equipes', e.nome || ' (' || e.id || ')',
       'perfis: '   || (SELECT count(*) FROM public.perfis p WHERE p.equipe_id = e.id)
    || ' · líderes/clones: ' || (SELECT count(*) FROM public.equipe_membros m
                                   WHERE m.equipe_id = e.id AND m.papel IN ('lider', 'clone'))
  FROM equipes_p4 e

-- 4. Tudo que aponta para o setor, com a regra do DELETE (é o que NÃO vamos fazer)
UNION ALL
SELECT '4 FK → setores', f.tabela || '.' || f.coluna || ' [' || f.regra || ']',
       substring(query_to_xml(
          format('SELECT count(*) AS n FROM %s WHERE %I = %L', f.tabela, f.coluna, c.play4),
          false, true, '')::text FROM '<n>([0-9]+)</n>')
  FROM fk_setores f, c

-- 5. Tudo que aponta para as equipes do Play 4 (por isso elas não são apagadas)
UNION ALL
SELECT '5 FK → equipes', f.tabela || '.' || f.coluna || ' [' || f.regra || ']',
       substring(query_to_xml(
          format('SELECT count(*) AS n FROM %s WHERE %I = ANY(%L::uuid[])',
                 f.tabela, f.coluna, (SELECT array_agg(id) FROM equipes_p4)),
          false, true, '')::text FROM '<n>([0-9]+)</n>')
  FROM fk_equipes f
 WHERE EXISTS (SELECT 1 FROM equipes_p4)

-- 6. Retrato dos meses fechados (tem de ter o Play 4 — é dele que o mês lê)
UNION ALL
SELECT '6 retrato', 'composicao_mes_setor ' || r.mes, to_jsonb(r)::text
  FROM public.composicao_mes_setor r, c
 WHERE r.setor_id = c.play4
UNION ALL
SELECT '6 retrato', 'composicao_mes ' || m.mes || ' (pessoas no Play 4)', count(*)::text
  FROM public.composicao_mes m, c
 WHERE m.setor_id = c.play4
 GROUP BY m.mes
UNION ALL
SELECT '6 retrato', 'composicao_mes_equipe ' || q.mes || ' (equipes do Play 4)', count(*)::text
  FROM public.composicao_mes_equipe q
 WHERE q.equipe_id IN (SELECT id FROM equipes_p4)
 GROUP BY q.mes

-- 7. Metas do setor
UNION ALL
SELECT '7 metas', m.ano || '-' || lpad(m.mes::text, 2, '0'),
       'meta_valor ' || m.meta_valor
  FROM public.metas m, c
 WHERE m.tipo = 'setor' AND m.referencia_id = c.play4

-- 8. Funções SECURITY INVOKER que leem `setores` — passam a NÃO ver o Play 4
--    quando chamadas pelo app. Se aparecer alguma de soma/relatório, me avise.
UNION ALL
SELECT '8 funções invoker', p.oid::regprocedure::text, 'lê setores'
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND NOT p.prosecdef AND p.prosrc ~* '\msetores\M'

-- 9. Ajuste manual em equipe do Play 4 sem setor carimbado: fn_ajustes_recebimento
--    (invoker) tira o setor da equipe, que vai sumir para o app. Esperado: 0.
UNION ALL
SELECT '9 ajustes', 'ajustes em equipe do Play 4 sem setor_id',
       (SELECT count(*) FROM public.analitico_ajustes_manuais a
         WHERE a.equipe_id IN (SELECT id FROM equipes_p4) AND a.setor_id IS NULL)::text

ORDER BY 1, 2;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — APLICAÇÃO (só depois de conferir a PARTE 1)
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  c_empresa  CONSTANT uuid := (SELECT id FROM public.empresas WHERE slug = 'bookplay');
  c_play4    CONSTANT uuid := 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1';
  -- Mês em aberto, no fuso da operação. Meta de mês anterior a este fica.
  c_corrente CONSTANT text := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_equipes  uuid[];
  v_n        integer;
BEGIN
  -- ── Pré-requisito ─────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'setores'
                    AND column_name = 'excluido_em') THEN
    RAISE EXCEPTION 'Aplique antes a migration 20261103170000_setor_excluido_some_de_hoje.sql';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'setores'
                    AND policyname = 'setores_esconde_excluido') THEN
    RAISE EXCEPTION 'Policy setores_esconde_excluido ausente — aplique a migration 20261103170000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'equipes'
                    AND policyname = 'equipes_esconde_do_setor_excluido')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger
                     WHERE tgname = 'trg_retrato_descarta_setor_excluido'
                       AND tgrelid = 'public.composicao_mes_setor'::regclass) THEN
    RAISE EXCEPTION 'Aplique antes a migration 20261103180000_setor_excluido_leva_equipes_e_sai_do_retrato.sql';
  END IF;

  -- ── Conferências ──────────────────────────────────────────────────────────
  -- FOR UPDATE: ninguém cria equipe nem põe gente no Play 4 enquanto isto roda.
  PERFORM 1 FROM public.setores
    WHERE id = c_play4 AND empresa_id = c_empresa AND nome = 'Play 4'
      AND ativo = false AND excluido_em IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Play 4 não encontrado na BookPlay, ainda ativo, ou já excluído';
  END IF;

  SELECT count(*) INTO v_n FROM public.perfis
   WHERE setor_id = c_play4 AND COALESCE(arquivado, false) = false;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Há % pessoa(s) não arquivada(s) no Play 4 — transferir antes', v_n;
  END IF;

  v_equipes := ARRAY(SELECT id FROM public.equipes WHERE setor_id = c_play4);

  SELECT count(*) INTO v_n FROM public.perfis
   WHERE equipe_id = ANY(v_equipes) AND COALESCE(arquivado, false) = false;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Há % pessoa(s) não arquivada(s) em equipe do Play 4 — revisar antes', v_n;
  END IF;

  -- `membro` é espelho de perfis.equipe_id (arquivado pode sobrar); líder e
  -- clone são vínculo de hoje e não podem existir numa equipe que vai sumir do app.
  SELECT count(*) INTO v_n FROM public.equipe_membros
   WHERE equipe_id = ANY(v_equipes) AND papel IN ('lider', 'clone');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Há % líder(es)/clone(s) em equipe do Play 4 — revisar antes', v_n;
  END IF;

  -- O mês fechado lê o Play 4 do retrato. Setembro foi o último mês inteiro dele.
  IF NOT EXISTS (SELECT 1 FROM public.composicao_mes_setor
                  WHERE empresa_id = c_empresa AND mes = '2026-09' AND setor_id = c_play4) THEN
    RAISE EXCEPTION 'Retrato de 2026-09 sem o Play 4 — o mês fechado perderia o nome do setor';
  END IF;

  -- ── 1. Metas do setor, do mês em aberto em diante ─────────────────────────
  DELETE FROM public.metas
   WHERE tipo = 'setor' AND referencia_id = c_play4 AND empresa_id = c_empresa
     AND (ano::text || '-' || lpad(mes::text, 2, '0')) >= c_corrente;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Metas do Play 4 de % em diante apagadas: %', c_corrente, v_n;

  -- ── 2. O setor sai do app (e as equipes dele, pela policy de 180000) ──────
  UPDATE public.setores SET excluido_em = now() WHERE id = c_play4;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava marcar 1 setor, marquei %', v_n;
  END IF;

  -- ── 3. Retrato do mês em aberto ───────────────────────────────────────────
  -- O snapshot de hoje (02:50) já gravou o Play 4 em 2026-11. Daqui em diante
  -- o gatilho de 180000 não o deixa voltar; isto tira o que já estava lá.
  -- Mês fechado (out e antes) não é tocado.
  DELETE FROM public.composicao_mes_setor
   WHERE empresa_id = c_empresa AND setor_id = c_play4 AND mes >= c_corrente;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Retrato do setor de % em diante apagado: % linha(s)', c_corrente, v_n;

  DELETE FROM public.composicao_mes_equipe
   WHERE empresa_id = c_empresa AND equipe_id = ANY(v_equipes) AND mes >= c_corrente;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Retrato das equipes de % em diante apagado: % linha(s)', c_corrente, v_n;

  RAISE NOTICE 'Play 4 excluído. A linha e as 5 equipes ficam como âncora da história de jul–out/2026.';
END
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA (depois da PARTE 2)
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT id, nome, ativo, excluido_em FROM public.setores
--  WHERE id = 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1';
--   esperado: excluido_em preenchido
-- SELECT mes FROM public.composicao_mes_setor
--  WHERE setor_id = 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1' ORDER BY mes;
--   esperado: 2026-08, 2026-09, 2026-10 (sem 2026-11)
-- No app: Play 4 e as equipes dele fora da aba Setores, da aba Equipes e dos
-- filtros de novembro; nos filtros de agosto–outubro, ele continua.
--
-- ## Desfazer
--
-- Setor e equipes voltam com um UPDATE (o retrato de novembro volta sozinho no
-- próximo snapshot, 02:50):
-- UPDATE public.setores SET excluido_em = NULL
--  WHERE id = 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1';
