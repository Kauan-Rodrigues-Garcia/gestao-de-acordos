-- ============================================================================
-- Treinamento do Conecta Play: 6 pessoas da BookPlay → PaguePlay (05/10/2026)
-- ============================================================================
--
-- Pedido do Cleber: transferir por script, já na equipe certa. Allana Barbosa,
-- Kethely Santos e Leticia Quinallia (Play 5), Manuela Marini, Sophia Costa e
-- Luan Pinto (Play Mix Marília) vão para o Conecta Play, equipe
-- «TREINAMENTO / ISABELLA». Chegam limpas — a carteira muda — e passam a ver
-- pela regra Cofen do setor. As metas de outubro delas já foram gravadas
-- (`conecta_play_equipes_metas_2026_10.sql`).
--
-- Mesmos passos, na mesma ordem, da transferência da tela de Usuários
-- (`transferenciaUsuario.service.ts` + `fn_transferencia_mover_empresa` +
-- `fn_admin_apagar_acordos_do_usuario`), que exigem um super_admin LOGADO e por
-- isso não rodam no SQL Editor:
--
--   1. cópia dos acordos ANTES de apagar — a tela baixa um relatório; aqui eles
--      ficam inteiros em `acordos_backup_transferencia` (RLS ligada, sem
--      policy: só o banco lê);
--   2. apaga os acordos da empresa de origem, solta o ponteiro do analítico,
--      o rastro em `historico_acordos` e os NRs órfãos (o analítico em si NÃO
--      sai: o recebimento é do relatório do ERP);
--   3. tira os clones (o Luan é clone na TreiPlayMix) e guarda para o desfazer;
--   4. muda empresa, setor e equipe, com a chave `app.transferencia_em_curso`
--      que a trava `block_empresa_id_update` reconhece;
--   5. grava `perfis_transferencias` (histórico, fantasma do mês e desfazer).
--
-- Conferido antes (05/10): 418 acordos, nenhum login colide na PaguePlay,
-- nenhum acordo de outra pessoa aponta para elas, nenhum recebimento de outubro.
--
-- Tudo numa transação: se qualquer passo ou a prova falhar, nada muda.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.acordos_backup_transferencia (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  backup_em    timestamptz NOT NULL DEFAULT now(),
  perfil_id    uuid        NOT NULL,
  perfil_nome  text,
  acordo       jsonb       NOT NULL
);
COMMENT ON TABLE public.acordos_backup_transferencia IS
  'Cópia integral dos acordos apagados em transferências feitas por script (o «relatório» '
  'que a tela baixa). Ver supabase/sql_scripts/conecta_play_transferir_treinamento_2026_10.sql.';
ALTER TABLE public.acordos_backup_transferencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.acordos_backup_transferencia FROM anon, authenticated;
GRANT ALL ON public.acordos_backup_transferencia TO service_role;

DO $transferir$
DECLARE
  c_empresa  constant uuid := 'e6bfb6ac-c08b-468b-86e8-853c25fb7ef0';  -- PAGUEPLAY
  c_setor    constant uuid := '4c44cd71-378d-43aa-a1f6-7dd39339839f';  -- Conecta Play
  c_equipe   constant uuid := '5db02ddb-e313-44f9-950a-8216d3377621';  -- TREINAMENTO / ISABELLA
  c_pessoas  constant uuid[] := ARRAY[
    '8616852d-2ccc-4e7e-997a-e11bbb6a58bc',   -- Allana Barbosa
    'd4fb8410-5100-49fc-b499-2933e1d110e6',   -- Kethely Santos
    'e4f2a6ee-1f37-4614-8053-7f001c3859bc',   -- Leticia Quinallia
    '754afad1-bd60-478c-b7b6-22e760164bb5',   -- Manuela Marini
    'f480140a-6acd-4373-8dd2-55ec22be3346',   -- Sophia Costa
    'ea1df409-6fdd-404d-95d9-9f5b1b666bc4'    -- Luan Pinto
  ]::uuid[];
  v_id       uuid;
  v_antes    public.perfis%ROWTYPE;
  v_apagados integer;
  v_clones   jsonb;
BEGIN
  FOREACH v_id IN ARRAY c_pessoas LOOP
    SELECT * INTO v_antes FROM public.perfis WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'perfil % não encontrado', v_id;
    END IF;
    IF v_antes.empresa_id = c_empresa THEN
      RAISE EXCEPTION '% já está na PaguePlay — nada a transferir', v_antes.nome;
    END IF;
    IF v_antes.usuario IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.perfis
          WHERE usuario = v_antes.usuario AND empresa_id = c_empresa AND id <> v_id) THEN
      RAISE EXCEPTION 'o login % já existe na PaguePlay', v_antes.usuario;
    END IF;

    -- 1. Cópia, antes de qualquer DELETE.
    INSERT INTO public.acordos_backup_transferencia (perfil_id, perfil_nome, acordo)
    SELECT v_id, v_antes.nome, to_jsonb(a)
      FROM public.acordos a
     WHERE a.operador_id = v_id AND a.empresa_id = v_antes.empresa_id;

    -- 2. Acordos (corpo de fn_admin_apagar_acordos_do_usuario).
    UPDATE public.acordos
       SET vinculo_operador_id = NULL, vinculo_operador_nome = NULL
     WHERE vinculo_operador_id = v_id
       AND operador_id IS DISTINCT FROM v_id
       AND empresa_id = v_antes.empresa_id;

    UPDATE public.analitico_recebimentos ar
       SET acordo_id = NULL
     WHERE ar.acordo_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.acordos a
                    WHERE a.id = ar.acordo_id AND a.operador_id = v_id
                      AND a.empresa_id = v_antes.empresa_id);

    DELETE FROM public.acordos WHERE operador_id = v_id AND empresa_id = v_antes.empresa_id;
    GET DIAGNOSTICS v_apagados = ROW_COUNT;

    DELETE FROM public.historico_acordos WHERE usuario_id = v_id;

    DELETE FROM public.nr_registros nr
     WHERE nr.operador_id = v_id
       AND NOT EXISTS (SELECT 1 FROM public.acordos a WHERE a.id = nr.acordo_id);

    -- 3. Clones: guardados para o desfazer, depois removidos.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'equipe_id', c.equipe_id,
             'conta_recebimento', c.conta_recebimento IS DISTINCT FROM false)), '[]'::jsonb)
      INTO v_clones
      FROM public.equipe_operadores_clones c WHERE c.operador_id = v_id;
    DELETE FROM public.equipe_operadores_clones WHERE operador_id = v_id;

    -- 4. Empresa, setor e equipe — a chave libera a trava só nesta transação.
    PERFORM set_config('app.transferencia_em_curso', 'on', true);
    UPDATE public.perfis
       SET empresa_id = c_empresa, setor_id = c_setor, equipe_id = c_equipe
     WHERE id = v_id;
    PERFORM set_config('app.transferencia_em_curso', 'off', true);

    -- 5. Registro (histórico, fantasma do mês, desfazer).
    INSERT INTO public.perfis_transferencias (
      empresa_id, perfil_id, perfil_nome, mes, tipo,
      origem_setor_id, origem_equipe_id, destino_empresa_id, destino_setor_id,
      levou_acordos, acordos_apagados, relatorio_arquivo, clones_removidos)
    VALUES (
      v_antes.empresa_id, v_id, v_antes.nome,
      to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 'empresa',
      v_antes.setor_id, v_antes.equipe_id, c_empresa, c_setor,
      false, v_apagados,
      'acordos_backup_transferencia (no banco) — script de 05/10/2026', v_clones);

    RAISE NOTICE '% transferida: % acordos apagados, % clone(s) removido(s)',
      v_antes.nome, v_apagados, jsonb_array_length(v_clones);
  END LOOP;
END
$transferir$;

-- ── Meta de outubro da equipe «Leticia Romeu», apagada pela tela ────────────
-- A equipe saiu, a meta de 130 mil H.O. ficou solta. Setembro (mês fechado)
-- fica como histórico.
DELETE FROM public.metas
 WHERE tipo = 'equipe' AND referencia_id = 'a34f0b0c-76fb-4876-af06-e34e36c2e625'
   AND mes = 10 AND ano = 2026
   AND NOT EXISTS (SELECT 1 FROM public.equipes WHERE id = 'a34f0b0c-76fb-4876-af06-e34e36c2e625');

-- ── Prova: confere e desfaz tudo se algo não bater ──────────────────────────
DO $prova$
DECLARE
  c_pessoas constant uuid[] := ARRAY[
    '8616852d-2ccc-4e7e-997a-e11bbb6a58bc','d4fb8410-5100-49fc-b499-2933e1d110e6','e4f2a6ee-1f37-4614-8053-7f001c3859bc',
    '754afad1-bd60-478c-b7b6-22e760164bb5','f480140a-6acd-4373-8dd2-55ec22be3346','ea1df409-6fdd-404d-95d9-9f5b1b666bc4'
  ]::uuid[];
  v_no_setor int; v_na_equipe int; v_acordos int; v_backup int; v_registros int; v_clones int;
BEGIN
  SELECT count(*) INTO v_no_setor FROM public.perfis
   WHERE id = ANY (c_pessoas)
     AND empresa_id = 'e6bfb6ac-c08b-468b-86e8-853c25fb7ef0'
     AND setor_id   = '4c44cd71-378d-43aa-a1f6-7dd39339839f';
  SELECT count(*) INTO v_na_equipe FROM public.equipe_membros
   WHERE equipe_id = '5db02ddb-e313-44f9-950a-8216d3377621' AND papel = 'membro' AND pessoa_id = ANY (c_pessoas);
  SELECT count(*) INTO v_acordos FROM public.acordos WHERE operador_id = ANY (c_pessoas);
  SELECT count(*) INTO v_backup FROM public.acordos_backup_transferencia
   WHERE perfil_id = ANY (c_pessoas) AND backup_em > now() - interval '5 minutes';
  SELECT count(*) INTO v_registros FROM public.perfis_transferencias
   WHERE perfil_id = ANY (c_pessoas) AND criado_em > now() - interval '5 minutes' AND tipo = 'empresa';
  SELECT count(*) INTO v_clones FROM public.equipe_operadores_clones WHERE operador_id = ANY (c_pessoas);

  IF v_no_setor  <> 6   THEN RAISE EXCEPTION 'esperava 6 no Conecta Play/PaguePlay, achei %', v_no_setor; END IF;
  IF v_na_equipe <> 6   THEN RAISE EXCEPTION 'esperava 6 na equipe TREINAMENTO / ISABELLA, achei %', v_na_equipe; END IF;
  IF v_acordos   <> 0   THEN RAISE EXCEPTION 'sobraram % acordos delas', v_acordos; END IF;
  IF v_backup    <> 418 THEN RAISE EXCEPTION 'esperava 418 acordos na cópia, foram %', v_backup; END IF;
  IF v_registros <> 6   THEN RAISE EXCEPTION 'esperava 6 registros de transferência, foram %', v_registros; END IF;
  IF v_clones    <> 0   THEN RAISE EXCEPTION 'sobrou clone de alguma delas'; END IF;
END
$prova$;

COMMIT;

SELECT p.nome, e.nome AS empresa, s.nome AS setor, eq.nome AS equipe,
       (SELECT count(*) FROM public.acordos_backup_transferencia b WHERE b.perfil_id = p.id) AS acordos_na_copia
  FROM public.perfis p
  JOIN public.empresas e ON e.id = p.empresa_id
  LEFT JOIN public.setores s ON s.id = p.setor_id
  LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
 WHERE p.id IN ('8616852d-2ccc-4e7e-997a-e11bbb6a58bc','d4fb8410-5100-49fc-b499-2933e1d110e6','e4f2a6ee-1f37-4614-8053-7f001c3859bc',
                '754afad1-bd60-478c-b7b6-22e760164bb5','f480140a-6acd-4373-8dd2-55ec22be3346','ea1df409-6fdd-404d-95d9-9f5b1b666bc4')
 ORDER BY p.nome;
