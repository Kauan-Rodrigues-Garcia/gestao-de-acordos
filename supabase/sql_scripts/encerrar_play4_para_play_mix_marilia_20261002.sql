-- ═══════════════════════════════════════════════════════════════════════════
-- Encerrar o setor Play 4 — todo mundo vai para o Play Mix Marília (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido do Cleber em 02/10/2026: a partir de outubro o Play 4 não existe mais.
--
-- ## O que faz — a transferência de setor do app, em lote
--
-- Para cada pessoa com `perfis.setor_id = Play 4`, o mesmo que
-- `executarTransferencia` (transferenciaUsuario.service.ts) faz com
-- «Levar os acordos»:
--
--   1. registro em `perfis_transferencias` (mês 2026-10, tipo setor,
--      levou_acordos) — é o que permite desfazer pela tela de Transferências;
--   2. acordos da pessoa recarimbados para o Play Mix Marília (só `setor_id`;
--      vínculos DIRETO/EXTRA intactos);
--   3. perfil: setor = Play Mix Marília, equipe = nenhuma. Líder também chega
--      sem equipe;
--   4. clones da pessoa em equipes de OUTROS setores ficam (regra de 19/08/2026:
--      troca de setor não mexe em clone).
--
-- Depois, as equipes do Play 4 ficam vazias (sem líderes, sem clones).
--
-- O setor é DESATIVADO à mão, depois, em Admin → Setores → «Desativar setor».
-- O gatilho de `setores` exige a permissão de quem está logado, e o SQL editor
-- não tem usuário — contornar a trava não vale o atalho.
--
-- ## Diferenças da transferência da tela, de propósito
--
--   * O fantasma nasce DESLIGADO. A equipe de origem deixa de existir, e um
--     fantasma ligado devolveria o recebimento de outubro a um card morto.
--   * Desligados arquivados também vão — o setor fica sem ninguém.
--
-- ## O que NÃO faz, e por quê
--
--   * Não apaga equipe nem setor. 44 colunas apontam para `setores` e várias
--     para `equipes`, com CASCADE/SET NULL: apagar reescreveria setembro (config
--     de comissão por equipe, origem dos fantasmas, ajustes manuais, vínculo das
--     equipes do 59, setor das linhas do analítico). Equipe vazia já não aparece
--     nos painéis.
--   * Não mexe no `codigo_erp` (38) do Play 4. PENDENTE: se o ERP continuar
--     mandando a carteira do Play 4 em outubro, essas linhas ficam carimbadas no
--     Play 4 e, pela regra «recebido só no setor da pessoa», não contam para
--     ninguém no Play Mix Marília.
--   * Não mexe em analítico, diário, metas (outubro não tinha nenhuma do Play 4)
--     nem em retrato de mês fechado.
--
-- ## Travas
--
-- Tudo num bloco só: qualquer contagem diferente do inventário de 02/10/2026
-- aborta e nada é gravado. Inventário: 41 pessoas (4 de cargo líder, 9
-- desligadas arquivadas), 1.933 acordos, 5 equipes, 5 lideranças, 0 clones
-- dentro das equipes do Play 4. Acordos são contados na hora (piso 1.933),
-- porque a operação continua tabulando enquanto o script espera para rodar.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  c_empresa    CONSTANT uuid := (SELECT id FROM public.empresas WHERE slug = 'bookplay');
  c_play4      CONSTANT uuid := 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1';
  c_mix        CONSTANT uuid := 'd69898f2-4ec1-4140-86ea-1c04e0c8b484';
  c_mes        CONSTANT text := '2026-10';
  v_pessoas    uuid[];
  v_equipes    uuid[];
  v_n          integer;
  v_acordos    integer;
BEGIN
  -- ── Conferências ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.setores
                  WHERE id = c_play4 AND empresa_id = c_empresa AND nome = 'Play 4' AND ativo) THEN
    RAISE EXCEPTION 'Play 4 não encontrado (ou já desativado) na BookPlay';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.setores
                  WHERE id = c_mix AND empresa_id = c_empresa AND nome = 'Play Mix Marília' AND ativo) THEN
    RAISE EXCEPTION 'Play Mix Marília não encontrado (ou inativo) na BookPlay';
  END IF;

  v_pessoas := ARRAY(SELECT id FROM public.perfis WHERE setor_id = c_play4);
  v_equipes := ARRAY(SELECT id FROM public.equipes WHERE setor_id = c_play4);

  IF cardinality(v_pessoas) <> 41 THEN
    RAISE EXCEPTION 'Esperava 41 pessoas no Play 4, achei %', cardinality(v_pessoas);
  END IF;
  IF cardinality(v_equipes) <> 5 THEN
    RAISE EXCEPTION 'Esperava 5 equipes no Play 4, achei %', cardinality(v_equipes);
  END IF;

  -- Acordo é o único número que cresce sozinho: a operação segue tabulando
  -- (1.933 no inventário, 1.935 na primeira tentativa). A trava é o piso, e o
  -- UPDATE abaixo tem que bater com o que for contado AQUI.
  SELECT count(*) INTO v_acordos FROM public.acordos
   WHERE operador_id = ANY(v_pessoas) AND empresa_id = c_empresa;
  IF v_acordos < 1933 THEN
    RAISE EXCEPTION 'Esperava ao menos 1933 acordos das pessoas do Play 4, achei %', v_acordos;
  END IF;

  SELECT count(*) INTO v_n FROM public.acordos
   WHERE setor_id = c_play4 AND NOT (operador_id = ANY(v_pessoas));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Há % acordo(s) carimbado(s) no Play 4 de gente de fora — revisar antes', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.equipe_lideres WHERE equipe_id = ANY(v_equipes);
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'Esperava 5 lideranças nas equipes do Play 4, achei %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.equipe_operadores_clones WHERE equipe_id = ANY(v_equipes);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Esperava 0 clones dentro das equipes do Play 4, achei %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.perfis
   WHERE equipe_id = ANY(v_equipes) AND setor_id IS DISTINCT FROM c_play4;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Há % pessoa(s) de outro setor em equipe do Play 4 — revisar antes', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.perfis_transferencias
   WHERE mes = c_mes AND origem_setor_id = c_play4;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Já existem % transferência(s) de outubro saindo do Play 4 — script já rodou?', v_n;
  END IF;

  -- ── 1. Registro da transferência (antes de mexer no perfil: guarda a origem) ─
  INSERT INTO public.perfis_transferencias (
    empresa_id, perfil_id, perfil_nome, mes, tipo,
    origem_setor_id, origem_equipe_id, destino_empresa_id, destino_setor_id,
    levou_acordos, acordos_apagados, relatorio_arquivo, clones_removidos,
    fantasma_ativo, fantasma_removido_em
  )
  SELECT c_empresa, p.id, p.nome, c_mes, 'setor',
         c_play4, p.equipe_id, c_empresa, c_mix,
         true, 0, NULL, '[]'::jsonb,
         false, now()
    FROM public.perfis p
   WHERE p.id = ANY(v_pessoas);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 41 THEN RAISE EXCEPTION 'Registro: % linhas, esperava 41', v_n; END IF;

  -- ── 2. Acordos vão junto ──────────────────────────────────────────────────
  UPDATE public.acordos
     SET setor_id = c_mix
   WHERE operador_id = ANY(v_pessoas) AND empresa_id = c_empresa;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_acordos THEN RAISE EXCEPTION 'Acordos: % linhas, esperava %', v_n, v_acordos; END IF;

  -- ── 3. Perfis: novo setor, sem equipe ─────────────────────────────────────
  UPDATE public.perfis
     SET setor_id = c_mix, equipe_id = NULL
   WHERE id = ANY(v_pessoas);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 41 THEN RAISE EXCEPTION 'Perfis: % linhas, esperava 41', v_n; END IF;

  -- ── 4. Equipes do Play 4 ficam vazias ─────────────────────────────────────
  DELETE FROM public.equipe_lideres WHERE equipe_id = ANY(v_equipes);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 5 THEN RAISE EXCEPTION 'Lideranças: % linhas, esperava 5', v_n; END IF;

  -- ── 5. Setor desativado: NÃO é aqui ───────────────────────────────────────
  -- `fn_setores_validar_alteracao_permitida` exige `setores_ativar_desativar`
  -- de quem está logado, e o SQL editor não tem usuário (segunda tentativa,
  -- 02/10/2026). A trava fica de pé: desativar pela tela Admin → Setores.
END $$;

-- ── Conferência depois (só leitura) ─────────────────────────────────────────
-- `play4_ativo` continua true até a desativação pela tela.
SELECT
  (SELECT ativo FROM public.setores WHERE id = 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1')                AS play4_ativo,
  (SELECT count(*) FROM public.perfis  WHERE setor_id = 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1')      AS pessoas_no_play4,
  (SELECT count(*) FROM public.acordos WHERE setor_id = 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1')      AS acordos_no_play4,
  (SELECT count(*) FROM public.perfis p JOIN public.equipes e ON e.id = p.equipe_id
    WHERE e.setor_id = 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1')                                       AS membros_em_equipe_play4,
  (SELECT count(*) FROM public.equipe_lideres l JOIN public.equipes e ON e.id = l.equipe_id
    WHERE e.setor_id = 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1')                                       AS liderancas_play4,
  (SELECT count(*) FROM public.perfis_transferencias
    WHERE mes = '2026-10' AND origem_setor_id = 'a2f0aad7-f108-40a3-9c68-80798c7fd5c1'
      AND destino_setor_id = 'd69898f2-4ec1-4140-86ea-1c04e0c8b484' AND NOT fantasma_ativo)        AS transferencias_registradas,
  (SELECT count(*) FROM public.perfis WHERE setor_id = 'd69898f2-4ec1-4140-86ea-1c04e0c8b484')       AS pessoas_no_mix_agora;
