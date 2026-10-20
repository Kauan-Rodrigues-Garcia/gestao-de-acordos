-- ============================================================================
-- Comissao: excecao por subgrupo de equipe
-- ============================================================================
--
-- Pedido de 20/10/2026: «na parte de colocar excecoes em equipe, aparecer
-- tambem os subgrupos de cada equipe».
--
-- A ordem passa a ser:
--
--   usuario  >  subgrupo  >  equipe  >  setor
--
-- Quem esta num subgrupo com excecao usa os percentuais dela, no lugar dos da
-- equipe e dos do setor. A regra de quando o setor bate a meta continua so na
-- linha do setor.
--
-- ## Como a linha guarda o subgrupo
--
-- A excecao de subgrupo e uma linha de `comissao_config` com `equipe_id` (a
-- equipe do subgrupo) E `subgrupo_id`. Manter a equipe preenchida deixa intacto
-- tudo o que pergunta «e o padrao do setor?» por `equipe_id IS NULL` (salvar,
-- confirmar a meta, a CHECK da regra do setor): a excecao de subgrupo nunca e
-- confundida com o padrao.
--
-- Quem esta no subgrupo e `perfis.subgrupo_id` — o mesmo recorte dos Destaques
-- do Dia e do ranking (20260903420000). A tela le as pessoas do subgrupo ao
-- carregar a configuracao do mes; nao ha lista copiada aqui.
--
-- ## A ordem de publicar
--
-- Qualquer ordem serve. O app novo so oferece subgrupo depois que a coluna
-- existe (sem ela, a `fn_comissao_salvar` antiga gravaria por cima da excecao
-- da equipe). O app antigo nao cria excecao de subgrupo; mas uma aba antiga
-- ainda aberta leria a de subgrupo como se fosse da equipe inteira — por isso
-- vale publicar o app antes de criar a primeira.
--
-- Reaplicavel.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. A coluna, a CHECK e as UNIQUE ─────────────────────────────────────────

ALTER TABLE public.comissao_config
  ADD COLUMN IF NOT EXISTS subgrupo_id UUID REFERENCES public.equipe_subgrupos(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.comissao_config.subgrupo_id IS
  'Preenchido = excecao do subgrupo (equipe_id e a equipe dele). Passa na frente da excecao '
  'da equipe; a excecao por usuario passa na frente dela. Ver 20261020140000.';

ALTER TABLE public.comissao_config DROP CONSTRAINT IF EXISTS comissao_config_subgrupo_com_equipe;
ALTER TABLE public.comissao_config ADD CONSTRAINT comissao_config_subgrupo_com_equipe
  CHECK (subgrupo_id IS NULL OR (equipe_id IS NOT NULL AND NOT grupo_usuarios));

-- Uma excecao por equipe/mes continua valendo, agora sem contar as de subgrupo;
-- e uma por subgrupo/mes.
DROP INDEX IF EXISTS public.uq_comissao_config_equipe;
CREATE UNIQUE INDEX uq_comissao_config_equipe
  ON public.comissao_config (empresa_id, setor_id, equipe_id, ano, mes)
  WHERE equipe_id IS NOT NULL AND subgrupo_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_comissao_config_subgrupo
  ON public.comissao_config (empresa_id, setor_id, subgrupo_id, ano, mes)
  WHERE subgrupo_id IS NOT NULL;

-- ── 2. Salvar ────────────────────────────────────────────────────────────────
--
-- A versao de 20260916120000, mais `subgrupo_id`: o subgrupo tem de ser da
-- equipe pedida, e a linha e achada tambem pelo subgrupo.

CREATE OR REPLACE FUNCTION public.fn_comissao_salvar(p_config JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id_pedido UUID    := NULLIF(p_config->>'id', '')::UUID;
  v_empresa   UUID    := NULLIF(p_config->>'empresa_id', '')::UUID;
  v_setor     UUID    := NULLIF(p_config->>'setor_id', '')::UUID;
  v_equipe    UUID    := NULLIF(p_config->>'equipe_id', '')::UUID;
  v_subgrupo  UUID    := NULLIF(p_config->>'subgrupo_id', '')::UUID;
  v_ano       INTEGER := NULLIF(p_config->>'ano', '')::INTEGER;
  v_mes       INTEGER := NULLIF(p_config->>'mes', '')::INTEGER;
  v_grupo     BOOLEAN := COALESCE(NULLIF(p_config->>'grupo_usuarios', '')::BOOLEAN, false);
  v_com_pessoas BOOLEAN := p_config ? 'usuarios';
  v_usuarios  UUID[];
  v_do_setor  BOOLEAN;
  v_id        UUID;
  v_faixa     JSONB;
  v_ocupados  TEXT;
BEGIN
  IF NOT public.fn_user_tem('metas_comissao_editar') THEN
    RAISE EXCEPTION 'Seu cargo não pode configurar a comissão.' USING ERRCODE = '42501';
  END IF;

  IF v_empresa IS NULL OR v_setor IS NULL OR v_ano IS NULL OR v_mes IS NULL THEN
    RAISE EXCEPTION 'Configuração incompleta: empresa, setor, ano e mês são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_can_access_empresa(v_empresa) THEN
    RAISE EXCEPTION 'Empresa inválida para este usuário.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.setores s WHERE s.id = v_setor AND s.empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'O setor não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  IF public.fn_metas_esta_validada(v_empresa, v_setor, v_mes, v_ano) THEN
    RAISE EXCEPTION 'A meta deste setor está validada neste mês. Reabra a validação para editar a comissão.'
      USING ERRCODE = '42501';
  END IF;

  IF v_grupo AND v_equipe IS NOT NULL THEN
    RAISE EXCEPTION 'A exceção por usuário não leva equipe.' USING ERRCODE = '22023';
  END IF;

  IF v_subgrupo IS NOT NULL AND (v_equipe IS NULL OR v_grupo) THEN
    RAISE EXCEPTION 'A exceção de subgrupo leva a equipe do subgrupo.' USING ERRCODE = '22023';
  END IF;

  v_do_setor := v_equipe IS NULL AND NOT v_grupo;

  IF NOT v_do_setor THEN
    IF v_equipe IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.equipes e WHERE e.id = v_equipe AND e.setor_id = v_setor) THEN
      RAISE EXCEPTION 'A equipe não pertence a este setor.' USING ERRCODE = '22023';
    END IF;
    IF v_subgrupo IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.equipe_subgrupos sg
          WHERE sg.id = v_subgrupo AND sg.equipe_id = v_equipe AND sg.empresa_id = v_empresa
       ) THEN
      RAISE EXCEPTION 'O subgrupo não pertence a esta equipe.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.comissao_config c
       WHERE c.empresa_id = v_empresa AND c.setor_id = v_setor
         AND c.equipe_id IS NULL AND NOT c.grupo_usuarios
         AND c.ano = v_ano AND c.mes = v_mes
    ) THEN
      RAISE EXCEPTION 'Configure o padrão do setor antes de criar a exceção.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- As pessoas da excecao por usuario: todas do setor, e nenhuma em outra.
  IF v_grupo THEN
    IF v_com_pessoas THEN
      SELECT COALESCE(array_agg(DISTINCT u.valor::UUID), '{}')
        INTO v_usuarios
        FROM jsonb_array_elements_text(COALESCE(p_config->'usuarios', '[]'::JSONB)) AS u(valor);
    END IF;

    IF (v_com_pessoas AND cardinality(v_usuarios) = 0)
       OR (NOT v_com_pessoas AND v_id_pedido IS NULL) THEN
      RAISE EXCEPTION 'Escolha ao menos uma pessoa para a exceção.' USING ERRCODE = '22023';
    END IF;

    IF v_com_pessoas AND EXISTS (
      SELECT 1 FROM unnest(v_usuarios) AS u(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.perfis p
          WHERE p.id = u.id AND p.empresa_id = v_empresa AND p.setor_id = v_setor
       )
    ) THEN
      RAISE EXCEPTION 'Só pessoas deste setor podem entrar na exceção.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Qual linha: a pedida pelo id, a da chave natural (padrao/equipe/subgrupo) ou nova.
  IF v_id_pedido IS NOT NULL THEN
    SELECT c.id INTO v_id
      FROM public.comissao_config c
     WHERE c.id = v_id_pedido
       AND c.empresa_id = v_empresa AND c.setor_id = v_setor
       AND c.ano = v_ano AND c.mes = v_mes
       AND c.grupo_usuarios = v_grupo
       AND c.equipe_id IS NOT DISTINCT FROM v_equipe
       AND c.subgrupo_id IS NOT DISTINCT FROM v_subgrupo
     FOR UPDATE;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Configuração de comissão não encontrada.' USING ERRCODE = 'P0002';
    END IF;
  ELSIF NOT v_grupo THEN
    SELECT c.id INTO v_id
      FROM public.comissao_config c
     WHERE c.empresa_id = v_empresa AND c.setor_id = v_setor
       AND c.ano = v_ano AND c.mes = v_mes
       AND NOT c.grupo_usuarios
       AND c.equipe_id IS NOT DISTINCT FROM v_equipe
       AND c.subgrupo_id IS NOT DISTINCT FROM v_subgrupo
     FOR UPDATE;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.comissao_config (
      empresa_id, setor_id, equipe_id, subgrupo_id, grupo_usuarios, ano, mes,
      modo_indireta, pct_indireta, pct_indireta_especial,
      regra_setor, multiplicador,
      atualizado_por, atualizado_em
    ) VALUES (
      v_empresa, v_setor, v_equipe, v_subgrupo, v_grupo, v_ano, v_mes,
      COALESCE(NULLIF(p_config->>'modo_indireta', ''), 'junto'),
      NULLIF(p_config->>'pct_indireta', '')::NUMERIC,
      NULLIF(p_config->>'pct_indireta_especial', '')::NUMERIC,
      -- A regra do setor so existe na linha do setor.
      CASE WHEN v_do_setor THEN COALESCE(NULLIF(p_config->>'regra_setor', ''), 'nenhuma') ELSE 'nenhuma' END,
      CASE WHEN v_do_setor THEN NULLIF(p_config->>'multiplicador', '')::NUMERIC END,
      auth.uid(), NOW()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.comissao_config c SET
      modo_indireta         = COALESCE(NULLIF(p_config->>'modo_indireta', ''), 'junto'),
      pct_indireta          = NULLIF(p_config->>'pct_indireta', '')::NUMERIC,
      pct_indireta_especial = NULLIF(p_config->>'pct_indireta_especial', '')::NUMERIC,
      regra_setor           = CASE WHEN v_do_setor THEN COALESCE(NULLIF(p_config->>'regra_setor', ''), 'nenhuma') ELSE 'nenhuma' END,
      multiplicador         = CASE WHEN v_do_setor THEN NULLIF(p_config->>'multiplicador', '')::NUMERIC END,
      atualizado_por        = auth.uid(),
      atualizado_em         = NOW()
     WHERE c.id = v_id;
  END IF;

  DELETE FROM public.comissao_faixas WHERE config_id = v_id;

  FOR v_faixa IN SELECT * FROM jsonb_array_elements(COALESCE(p_config->'faixas', '[]'::JSONB)) LOOP
    INSERT INTO public.comissao_faixas (config_id, ordem, pct, pct_especial)
    VALUES (
      v_id,
      (v_faixa->>'ordem')::SMALLINT,
      (v_faixa->>'pct')::NUMERIC,
      NULLIF(v_faixa->>'pct_especial', '')::NUMERIC
    );
  END LOOP;

  IF v_grupo AND v_com_pessoas THEN
    SELECT string_agg(p.nome, ', ' ORDER BY p.nome)
      INTO v_ocupados
      FROM public.comissao_config_usuarios cu
      JOIN public.perfis p ON p.id = cu.usuario_id
     WHERE cu.empresa_id = v_empresa AND cu.ano = v_ano AND cu.mes = v_mes
       AND cu.config_id <> v_id
       AND cu.usuario_id = ANY (v_usuarios);

    IF v_ocupados IS NOT NULL THEN
      RAISE EXCEPTION 'Já estão em outra exceção por usuário neste mês: %. Tire-as de lá primeiro.', v_ocupados
        USING ERRCODE = '23505';
    END IF;

    DELETE FROM public.comissao_config_usuarios cu
     WHERE cu.config_id = v_id AND cu.usuario_id <> ALL (v_usuarios);

    INSERT INTO public.comissao_config_usuarios (config_id, usuario_id, empresa_id, ano, mes)
    SELECT v_id, u.id, v_empresa, v_ano, v_mes
      FROM unnest(v_usuarios) AS u(id)
    ON CONFLICT (config_id, usuario_id) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$function$;

-- ── 3. Importar o mes anterior leva o subgrupo ───────────────────────────────
--
-- A versao de 20260916120000, mais `subgrupo_id`. O subgrupo apagado ja levou a
-- linha junto (CASCADE); o que sobra e copiado como esta.

CREATE OR REPLACE FUNCTION public.fn_comissao_importar_mes_anterior(
  p_empresa_id UUID,
  p_setor_id   UUID,
  p_ano        INTEGER,
  p_mes        INTEGER,
  p_substituir BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ano_origem INTEGER;
  v_mes_origem INTEGER;
  v_origem     RECORD;
  v_novo       UUID;
  v_total      INTEGER := 0;
BEGIN
  IF NOT public.fn_user_tem('metas_comissao_editar') THEN
    RAISE EXCEPTION 'Seu cargo não pode configurar a comissão.' USING ERRCODE = '42501';
  END IF;

  IF p_mes IS NULL OR p_mes NOT BETWEEN 1 AND 12 OR p_ano IS NULL THEN
    RAISE EXCEPTION 'Mês inválido.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa inválida para este usuário.' USING ERRCODE = '42501';
  END IF;

  IF public.fn_metas_esta_validada(p_empresa_id, p_setor_id, p_mes, p_ano) THEN
    RAISE EXCEPTION 'A meta deste setor está validada neste mês. Reabra a validação para importar a comissão.'
      USING ERRCODE = '42501';
  END IF;

  v_ano_origem := CASE WHEN p_mes = 1 THEN p_ano - 1 ELSE p_ano END;
  v_mes_origem := CASE WHEN p_mes = 1 THEN 12 ELSE p_mes - 1 END;

  IF NOT EXISTS (
    SELECT 1 FROM public.comissao_config c
     WHERE c.empresa_id = p_empresa_id AND c.setor_id = p_setor_id
       AND c.ano = v_ano_origem AND c.mes = v_mes_origem
  ) THEN
    RAISE EXCEPTION 'Não há configuração de comissão no mês anterior para este setor.'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.comissao_config c
     WHERE c.empresa_id = p_empresa_id AND c.setor_id = p_setor_id
       AND c.ano = p_ano AND c.mes = p_mes
  ) THEN
    IF NOT COALESCE(p_substituir, FALSE) THEN
      RAISE EXCEPTION 'Este mês já tem configuração de comissão. Confirme a substituição para importar.'
        USING ERRCODE = '23505';
    END IF;
    DELETE FROM public.comissao_config c
     WHERE c.empresa_id = p_empresa_id AND c.setor_id = p_setor_id
       AND c.ano = p_ano AND c.mes = p_mes;
  END IF;

  FOR v_origem IN
    SELECT c.id, c.equipe_id, c.subgrupo_id, c.grupo_usuarios, c.modo_indireta, c.pct_indireta,
           c.pct_indireta_especial, c.regra_setor, c.multiplicador
      FROM public.comissao_config c
     WHERE c.empresa_id = p_empresa_id AND c.setor_id = p_setor_id
       AND c.ano = v_ano_origem AND c.mes = v_mes_origem
       AND (c.equipe_id IS NULL
            OR EXISTS (SELECT 1 FROM public.equipes e
                        WHERE e.id = c.equipe_id AND e.setor_id = p_setor_id))
     -- O padrao primeiro: e ele que as excecoes pressupoem.
     ORDER BY (c.equipe_id IS NOT NULL OR c.grupo_usuarios)
  LOOP
    IF v_origem.grupo_usuarios AND NOT EXISTS (
      SELECT 1
        FROM public.comissao_config_usuarios cu
        JOIN public.perfis p ON p.id = cu.usuario_id
       WHERE cu.config_id = v_origem.id
         AND p.empresa_id = p_empresa_id AND p.setor_id = p_setor_id
         AND NOT EXISTS (
           SELECT 1 FROM public.comissao_config_usuarios x
            WHERE x.empresa_id = p_empresa_id AND x.usuario_id = cu.usuario_id
              AND x.ano = p_ano AND x.mes = p_mes
         )
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.comissao_config (
      empresa_id, setor_id, equipe_id, subgrupo_id, grupo_usuarios, ano, mes,
      modo_indireta, pct_indireta, pct_indireta_especial,
      regra_setor, multiplicador,
      atualizado_por, atualizado_em
    ) VALUES (
      p_empresa_id, p_setor_id, v_origem.equipe_id, v_origem.subgrupo_id, v_origem.grupo_usuarios, p_ano, p_mes,
      v_origem.modo_indireta, v_origem.pct_indireta, v_origem.pct_indireta_especial,
      v_origem.regra_setor, v_origem.multiplicador,
      auth.uid(), NOW()
    )
    RETURNING id INTO v_novo;

    INSERT INTO public.comissao_faixas (config_id, ordem, pct, pct_especial)
    SELECT v_novo, f.ordem, f.pct, f.pct_especial
      FROM public.comissao_faixas f
     WHERE f.config_id = v_origem.id;

    IF v_origem.grupo_usuarios THEN
      INSERT INTO public.comissao_config_usuarios (config_id, usuario_id, empresa_id, ano, mes)
      SELECT v_novo, cu.usuario_id, p_empresa_id, p_ano, p_mes
        FROM public.comissao_config_usuarios cu
        JOIN public.perfis p ON p.id = cu.usuario_id
       WHERE cu.config_id = v_origem.id
         AND p.empresa_id = p_empresa_id AND p.setor_id = p_setor_id
      ON CONFLICT DO NOTHING;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

COMMIT;
