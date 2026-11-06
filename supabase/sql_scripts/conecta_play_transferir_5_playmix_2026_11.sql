-- ============================================================================
-- Conecta Play: 5 do Play Mix Marília → Conecta Play, equipe «Isabela / Layane»
-- (05/11/2026)
-- ============================================================================
--
-- Pedido do Cleber: transferir por script, já na equipe certa. Thaís
-- Rodrigues, Rhuan Silva, Poliana Varjão, Isabelle Moreira e Rafaela Lisboa
-- (R$ 5.000 H.O. cada) estão no Play Mix Marília, que é de OUTRA empresa. As
-- metas de novembro delas já estão gravadas no Conecta Play
-- (`conecta_play_equipes_metas_2026_11.sql`, aplicado 05/11).
--
-- ## Como, sem reescrever a transferência
--
-- A troca de empresa da tela chama `fn_transferencia_mover_empresa` e
-- `fn_transferencia_sai_da_lideranca`, que exigem um super admin LOGADO. No
-- SQL Editor não há login, então o script diz ao banco, SÓ DENTRO desta
-- transação, quem é o super admin (`request.jwt.claims`). Assim roda a função
-- de verdade, a versão que está em produção — nada copiado à mão.
--
-- Os passos, na ordem da tela (`transferenciaUsuario.service.ts`):
--   1. cópia dos acordos ANTES de apagar (a tela baixa um relatório; aqui eles
--      ficam inteiros em `acordos_backup_transferencia`);
--   2. `fn_transferencia_mover_empresa`: confere setor da empresa de destino e
--      colisão de login, apaga os acordos da origem (chegar limpo: troca de
--      empresa nunca leva tabulação) e muda empresa/setor;
--   3. `fn_transferencia_sai_da_lideranca` no setor antigo;
--   4. clones guardados e removidos (apontariam para equipe da outra empresa);
--   5. `perfis_transferencias` (histórico, fantasma do mês, desfazer);
--   6. e o que a tela deixa para a aba Equipes: a equipe «Isabela / Layane».
--
-- Tudo numa transação: se qualquer passo ou a prova falhar, nada muda.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- Já existe desde 05/10; o IF NOT EXISTS só protege um banco novo.
CREATE TABLE IF NOT EXISTS public.acordos_backup_transferencia (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  backup_em    timestamptz NOT NULL DEFAULT now(),
  perfil_id    uuid        NOT NULL,
  perfil_nome  text,
  acordo       jsonb       NOT NULL
);

DROP TABLE IF EXISTS pg_temp.cp5_relatorio;
CREATE TEMP TABLE cp5_relatorio (usuario TEXT, nome TEXT, de TEXT, acordos_apagados INT, clones INT, liderancas TEXT);

DO $transferir$
DECLARE
  c_empresa  CONSTANT UUID := 'e6bfb6ac-c08b-468b-86e8-853c25fb7ef0';  -- PAGUEPLAY
  c_setor    CONSTANT UUID := '4c44cd71-378d-43aa-a1f6-7dd39339839f';  -- Conecta Play
  c_equipe   CONSTANT UUID := '5db02ddb-e313-44f9-950a-8216d3377621';  -- Isabela / Layane
  c_email_super CONSTANT TEXT := 'clebervlogames@gmail.com';            -- quem executa
  c_logins   CONSTANT TEXT[] := ARRAY[
    'thais_p_rodrigues', 'rhuan_silva', 'poliana_varjao', 'isabelle_moreira', 'rafaela_lisboa'
  ];
  v_super    UUID;
  v_login    TEXT;
  v_antes    public.perfis%ROWTYPE;
  v_setor_de TEXT;
  v_backup   INTEGER;
  v_ret      JSONB;
  v_lider    JSONB;
  v_clones   JSONB;
  v_n        INTEGER;
  v_ids      UUID[] := '{}';
BEGIN
  -- ── 0. O super admin que assina a transferência ─────────────────────────
  SELECT count(DISTINCT p.id), min(p.id::TEXT)::UUID INTO v_n, v_super
    FROM public.perfis p
    LEFT JOIN auth.users u ON u.id = p.id
   WHERE p.perfil::TEXT = 'super_admin'
     AND (lower(btrim(p.email)) = c_email_super OR lower(btrim(u.email)) = c_email_super);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Esperava 1 super admin com o e-mail %, achei %. Troque c_email_super por um destes: %. Nada gravado.',
      c_email_super, v_n,
      (SELECT string_agg(p.nome || ' <' || p.email || '>', ', ') FROM public.perfis p
        WHERE p.perfil::TEXT = 'super_admin' AND p.ativo IS NOT FALSE);
  END IF;
  -- Só nesta transação: auth.uid() passa a ser o super admin.
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_super, 'role', 'authenticated')::TEXT, true);
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'O banco não reconheceu o super admin (%). Nada gravado.', v_super;
  END IF;

  FOREACH v_login IN ARRAY c_logins LOOP
    SELECT count(*) INTO v_n FROM public.perfis
     WHERE lower(btrim(usuario)) = v_login AND arquivado IS NOT TRUE;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '%: achei % perfis com esse login. Nada gravado.', v_login, v_n;
    END IF;
    SELECT * INTO v_antes FROM public.perfis
     WHERE lower(btrim(usuario)) = v_login AND arquivado IS NOT TRUE FOR UPDATE;

    IF v_antes.empresa_id = c_empresa THEN
      -- Já está na PaguePlay (rodou antes, ou alguém transferiu pela tela):
      -- só garante setor e equipe.
      UPDATE public.perfis SET setor_id = c_setor, equipe_id = c_equipe
       WHERE id = v_antes.id AND (setor_id IS DISTINCT FROM c_setor OR equipe_id IS DISTINCT FROM c_equipe);
      v_ids := v_ids || v_antes.id;
      CONTINUE;
    END IF;
    IF v_antes.perfil::TEXT NOT IN ('operador', 'elite') THEN
      RAISE EXCEPTION '% (%): cargo %, não operador. Nada gravado.', v_login, v_antes.nome, v_antes.perfil;
    END IF;

    SELECT s.nome INTO v_setor_de FROM public.setores s WHERE s.id = v_antes.setor_id;

    -- 1. Cópia, antes de qualquer DELETE.
    INSERT INTO public.acordos_backup_transferencia (perfil_id, perfil_nome, acordo)
    SELECT v_antes.id, v_antes.nome, to_jsonb(a)
      FROM public.acordos a
     WHERE a.operador_id = v_antes.id AND a.empresa_id = v_antes.empresa_id;
    GET DIAGNOSTICS v_backup = ROW_COUNT;

    -- 2. A transferência de empresa da tela.
    v_ret := public.fn_transferencia_mover_empresa(v_antes.id, c_empresa, c_setor);
    IF v_backup <> COALESCE((v_ret->>'acordos_apagados')::INT, 0) THEN
      RAISE EXCEPTION '%: copiei % acordos e a transferência apagou %. Nada gravado.',
        v_login, v_backup, v_ret->>'acordos_apagados';
    END IF;

    -- 3. Liderança no setor antigo.
    v_lider := public.fn_transferencia_sai_da_lideranca(v_antes.id, v_antes.setor_id);

    -- 4. Clones: guardados para o desfazer, depois removidos.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'equipe_id', c.equipe_id,
             'conta_recebimento', c.conta_recebimento IS DISTINCT FROM false)), '[]'::jsonb)
      INTO v_clones
      FROM public.equipe_operadores_clones c WHERE c.operador_id = v_antes.id;
    DELETE FROM public.equipe_operadores_clones WHERE operador_id = v_antes.id;

    -- 5. Registro (histórico, fantasma do mês, desfazer).
    INSERT INTO public.perfis_transferencias (
      empresa_id, perfil_id, perfil_nome, mes, tipo,
      origem_setor_id, origem_equipe_id, destino_empresa_id, destino_setor_id,
      levou_acordos, acordos_apagados, relatorio_arquivo, clones_removidos)
    VALUES (
      v_antes.empresa_id, v_antes.id, v_antes.nome,
      to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 'empresa',
      v_antes.setor_id, v_antes.equipe_id, c_empresa, c_setor,
      false, v_backup,
      'acordos_backup_transferencia (no banco) — script de 05/11/2026', v_clones);

    -- 6. A equipe (mesma empresa agora: UPDATE comum).
    UPDATE public.perfis SET equipe_id = c_equipe WHERE id = v_antes.id;

    INSERT INTO cp5_relatorio VALUES (
      v_login, v_antes.nome, coalesce(v_setor_de, 'sem setor'), v_backup,
      jsonb_array_length(v_clones),
      NULLIF((SELECT string_agg(x->>'nome', ', ') FROM jsonb_array_elements(v_lider) x), ''));
    v_ids := v_ids || v_antes.id;
  END LOOP;

  -- ── Prova ──────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.perfis
   WHERE id = ANY (v_ids) AND empresa_id = c_empresa AND setor_id = c_setor AND equipe_id = c_equipe;
  IF v_n <> 5 THEN RAISE EXCEPTION 'Esperava 5 no Conecta Play, equipe Isabela / Layane; achei %. Nada gravado.', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.acordos a
   JOIN public.perfis p ON p.id = a.operador_id
   WHERE a.operador_id = ANY (v_ids) AND a.empresa_id <> c_empresa;
  IF v_n <> 0 THEN RAISE EXCEPTION 'Sobraram % acordos delas na empresa antiga. Nada gravado.', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.equipe_operadores_clones WHERE operador_id = ANY (v_ids);
  IF v_n <> 0 THEN RAISE EXCEPTION 'Sobrou clone de alguma delas. Nada gravado.'; END IF;

  SELECT count(*) INTO v_n FROM public.metas
   WHERE tipo = 'operador' AND referencia_id = ANY (v_ids) AND empresa_id = c_empresa
     AND mes = 11 AND ano = 2026 AND meta_valor = 22123.89;
  IF v_n <> 5 THEN RAISE EXCEPTION 'Esperava as 5 metas de R$ 5.000 H.O. de novembro, achei %. Nada gravado.', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.perfis
   WHERE equipe_id = c_equipe AND arquivado IS NOT TRUE AND perfil::TEXT IN ('operador', 'elite');
  IF v_n <> 9 THEN RAISE EXCEPTION '«Isabela / Layane» deveria ter 9 operadores, tem %. Nada gravado.', v_n; END IF;

  -- Devolve a identidade: o resto da sessão não fica como super admin.
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE '5 transferidas para o Conecta Play, equipe Isabela / Layane. Tudo conferido.';
END
$transferir$;

COMMIT;

-- ── O que foi feito ─────────────────────────────────────────────────────────
SELECT * FROM cp5_relatorio ORDER BY nome;

SELECT p.nome, e.nome AS empresa, s.nome AS setor, eq.nome AS equipe,
       (SELECT count(*) FROM public.acordos_backup_transferencia b
         WHERE b.perfil_id = p.id AND b.backup_em > now() - interval '10 minutes') AS acordos_na_copia
  FROM public.perfis p
  JOIN public.empresas e ON e.id = p.empresa_id
  LEFT JOIN public.setores s ON s.id = p.setor_id
  LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
 WHERE lower(p.usuario) IN ('thais_p_rodrigues', 'rhuan_silva', 'poliana_varjao', 'isabelle_moreira', 'rafaela_lisboa')
 ORDER BY p.nome;
