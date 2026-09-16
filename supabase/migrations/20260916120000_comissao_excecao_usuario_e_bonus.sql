-- ============================================================================
-- Comissao: excecao por usuario e bonus por usuario
-- ============================================================================
--
-- Pedido de 16/09/2026, sobre a comissao por meta (20260911190000).
--
-- ## Excecao por usuario
--
-- Ate aqui a comissao tinha dois niveis: o padrao do setor e a excecao da
-- equipe. Entra um terceiro, o mais forte:
--
--   usuario  >  equipe  >  setor
--
-- Quem esta numa excecao por usuario usa os percentuais dela e ignora os da
-- equipe e os do setor. A regra de quando o setor bate a meta continua morando
-- so na linha do setor, como na excecao de equipe.
--
-- A excecao por usuario e um GRUPO: uma configuracao (`grupo_usuarios = true`)
-- com as pessoas em `comissao_config_usuarios`. O pedido foi «selecionar os seis
-- que tem um percentual diferente» — seis configuracoes iguais pediriam seis
-- edicoes a cada ajuste. Uma pessoa esta em no maximo UMA excecao por mes
-- (`comissao_config_usuarios_um_por_mes`); sem isso, duas respostas para a
-- mesma comissao.
--
-- A UNIQUE da competencia (NULLS NOT DISTINCT em empresa, setor, equipe, ano,
-- mes) nao deixava existir um segundo registro com equipe nula alem do padrao.
-- Ela vira dois indices parciais: um padrao por setor/mes e uma excecao por
-- equipe/mes. Grupos de usuarios nao tem chave natural — o id e a chave.
--
-- ## Bonus
--
-- Dinheiro fixo prometido a uma ou mais pessoas no mes, em tres formas:
--
--   meta      bater a Na meta dela (1a, 2a, 3a, 4a...);
--   valor     chegar a um realizado (R$ 200.000,00 → mais R$ 200,00);
--   especial  fazer um valor dentro de um periodo do mes (R$ 20.000,00 numa
--             semana).
--
-- O bonus NAO entra no total da comissao: aparece ao lado dela, para o
-- operador e para a lideranca. O realizado que ele mede e o da comissao (na
-- PaguePlay, H.O.); `valor_alvo` fica em BRUTO, como `metas.meta_valor`.
--
-- `comissao_bonus.setor_id` nao tem FK de proposito: `fn_setor_bloqueios_exclusao`
-- (20260916100000) recusa excluir setor com QUALQUER tabela apontando para ele
-- fora da lista de configuracao. O bonus e do setor em que foi criado e some com
-- a empresa; as pessoas somem pelo CASCADE de `perfis`.
--
-- Importar o mes anterior copia as excecoes por usuario (so quem continua no
-- setor) e NAO copia bonus: bonus e promessa de dinheiro de um mes, e o periodo
-- da meta especial e de datas daquele mes.
--
-- ## Escrita so por RPC, leitura pela empresa
--
-- Mesma regua de 20260911190000: nenhuma policy de escrita; as RPCs checam
-- `metas_comissao_editar`, a empresa e a trava da meta do setor.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ============================================================================
-- 1. comissao_config ganha o grupo de usuarios
-- ============================================================================

ALTER TABLE public.comissao_config
  ADD COLUMN IF NOT EXISTS grupo_usuarios BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.comissao_config DROP CONSTRAINT IF EXISTS comissao_config_grupo_sem_equipe;
ALTER TABLE public.comissao_config ADD CONSTRAINT comissao_config_grupo_sem_equipe
  CHECK (NOT grupo_usuarios OR equipe_id IS NULL);

-- A regra do setor e a confirmacao continuam so na linha do setor.
ALTER TABLE public.comissao_config DROP CONSTRAINT IF EXISTS comissao_config_excecao_sem_regra;
ALTER TABLE public.comissao_config ADD CONSTRAINT comissao_config_excecao_sem_regra CHECK (
  (equipe_id IS NULL AND NOT grupo_usuarios)
  OR (regra_setor = 'nenhuma' AND multiplicador IS NULL AND setor_meta_confirmada_em IS NULL)
);

ALTER TABLE public.comissao_config DROP CONSTRAINT IF EXISTS comissao_config_competencia_unica;

CREATE UNIQUE INDEX IF NOT EXISTS uq_comissao_config_padrao
  ON public.comissao_config (empresa_id, setor_id, ano, mes)
  WHERE equipe_id IS NULL AND NOT grupo_usuarios;

CREATE UNIQUE INDEX IF NOT EXISTS uq_comissao_config_equipe
  ON public.comissao_config (empresa_id, setor_id, equipe_id, ano, mes)
  WHERE equipe_id IS NOT NULL;

COMMENT ON COLUMN public.comissao_config.grupo_usuarios IS
  'true = excecao por usuario: vale para as pessoas de comissao_config_usuarios '
  'e passa na frente da excecao de equipe e do padrao do setor.';

CREATE TABLE IF NOT EXISTS public.comissao_config_usuarios (
  config_id  UUID    NOT NULL REFERENCES public.comissao_config(id) ON DELETE CASCADE,
  usuario_id UUID    NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  -- Copias da configuracao, para a UNIQUE abaixo. So as RPCs escrevem aqui.
  empresa_id UUID    NOT NULL,
  ano        INTEGER NOT NULL,
  mes        INTEGER NOT NULL,
  PRIMARY KEY (config_id, usuario_id),
  CONSTRAINT comissao_config_usuarios_um_por_mes UNIQUE (empresa_id, usuario_id, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_comissao_config_usuarios_empresa_mes
  ON public.comissao_config_usuarios (empresa_id, ano, mes);

COMMENT ON TABLE public.comissao_config_usuarios IS
  'As pessoas de uma excecao por usuario (comissao_config.grupo_usuarios). '
  'Uma pessoa em no maximo uma excecao por mes. Escrita so por fn_comissao_salvar.';

-- ============================================================================
-- 2. Bonus
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.comissao_bonus (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- Sem FK: ver o cabecalho.
  setor_id        UUID NOT NULL,
  ano             INTEGER NOT NULL CHECK (ano >= 2024),
  mes             INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  tipo            TEXT NOT NULL CHECK (tipo IN ('meta', 'valor', 'especial')),
  meta_ordem      SMALLINT CHECK (meta_ordem BETWEEN 1 AND 20),
  valor_alvo      NUMERIC(14,2) CHECK (valor_alvo > 0),
  periodo_inicio  DATE,
  periodo_fim     DATE,
  valor_bonus     NUMERIC(12,2) NOT NULL CHECK (valor_bonus > 0),
  descricao       TEXT CHECK (char_length(descricao) <= 200),
  criado_por      UUID,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por  UUID,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT comissao_bonus_campos_do_tipo CHECK (
    (tipo = 'meta' AND meta_ordem IS NOT NULL AND valor_alvo IS NULL
      AND periodo_inicio IS NULL AND periodo_fim IS NULL)
    OR (tipo = 'valor' AND meta_ordem IS NULL AND valor_alvo IS NOT NULL
      AND periodo_inicio IS NULL AND periodo_fim IS NULL)
    OR (tipo = 'especial' AND meta_ordem IS NULL AND valor_alvo IS NOT NULL
      AND periodo_inicio IS NOT NULL AND periodo_fim IS NOT NULL AND periodo_fim >= periodo_inicio)
  )
);

CREATE INDEX IF NOT EXISTS idx_comissao_bonus_empresa_mes
  ON public.comissao_bonus (empresa_id, ano, mes);

COMMENT ON TABLE public.comissao_bonus IS
  'Bonus de comissao de um mes: ao bater uma meta, ao chegar a um realizado ou '
  'numa meta especial com periodo. Nao soma no total da comissao. valor_alvo em '
  'bruto. Escrita so por fn_comissao_bonus_*.';

CREATE TABLE IF NOT EXISTS public.comissao_bonus_usuarios (
  bonus_id   UUID NOT NULL REFERENCES public.comissao_bonus(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  PRIMARY KEY (bonus_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_comissao_bonus_usuarios_usuario
  ON public.comissao_bonus_usuarios (usuario_id);

-- ============================================================================
-- 3. RLS: so leitura, pela empresa
-- ============================================================================

ALTER TABLE public.comissao_config_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_bonus           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_bonus_usuarios  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissao_config_usuarios_select ON public.comissao_config_usuarios;
CREATE POLICY comissao_config_usuarios_select ON public.comissao_config_usuarios
  FOR SELECT TO authenticated
  USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS comissao_bonus_select ON public.comissao_bonus;
CREATE POLICY comissao_bonus_select ON public.comissao_bonus
  FOR SELECT TO authenticated
  USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS comissao_bonus_usuarios_select ON public.comissao_bonus_usuarios;
CREATE POLICY comissao_bonus_usuarios_select ON public.comissao_bonus_usuarios
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.comissao_bonus b
     WHERE b.id = bonus_id
       AND public.fn_can_access_empresa(b.empresa_id)
  ));

-- ============================================================================
-- 4. As RPCs da configuracao
-- ============================================================================

-- ── Salvar uma configuracao (padrao, excecao de equipe ou por usuario) ──────
--
-- Continua gravando a configuracao inteira e substituindo as faixas. Na excecao
-- por usuario, `id` escolhe o grupo (sem id = grupo novo) e `usuarios`, quando
-- vem, SUBSTITUI as pessoas.

CREATE OR REPLACE FUNCTION public.fn_comissao_salvar(p_config JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id_pedido UUID    := NULLIF(p_config->>'id', '')::UUID;
  v_empresa   UUID    := NULLIF(p_config->>'empresa_id', '')::UUID;
  v_setor     UUID    := NULLIF(p_config->>'setor_id', '')::UUID;
  v_equipe    UUID    := NULLIF(p_config->>'equipe_id', '')::UUID;
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

  v_do_setor := v_equipe IS NULL AND NOT v_grupo;

  IF NOT v_do_setor THEN
    IF v_equipe IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.equipes e WHERE e.id = v_equipe AND e.setor_id = v_setor) THEN
      RAISE EXCEPTION 'A equipe não pertence a este setor.' USING ERRCODE = '22023';
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

  -- Qual linha: a pedida pelo id, a da chave natural (padrao/equipe) ou nova.
  IF v_id_pedido IS NOT NULL THEN
    SELECT c.id INTO v_id
      FROM public.comissao_config c
     WHERE c.id = v_id_pedido
       AND c.empresa_id = v_empresa AND c.setor_id = v_setor
       AND c.ano = v_ano AND c.mes = v_mes
       AND c.grupo_usuarios = v_grupo
       AND c.equipe_id IS NOT DISTINCT FROM v_equipe
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
     FOR UPDATE;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.comissao_config (
      empresa_id, setor_id, equipe_id, grupo_usuarios, ano, mes,
      modo_indireta, pct_indireta, pct_indireta_especial,
      regra_setor, multiplicador,
      atualizado_por, atualizado_em
    ) VALUES (
      v_empresa, v_setor, v_equipe, v_grupo, v_ano, v_mes,
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

-- ── Importar o mes anterior ──────────────────────────────────────────────────
--
-- Igual a versao de 20260911190000, mais as excecoes por usuario: vem so quem
-- continua no setor e ainda nao tem excecao no mes de destino; grupo que fica
-- vazio nao e copiado. Bonus nao vem (ver o cabecalho).

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
    SELECT c.id, c.equipe_id, c.grupo_usuarios, c.modo_indireta, c.pct_indireta,
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
      empresa_id, setor_id, equipe_id, grupo_usuarios, ano, mes,
      modo_indireta, pct_indireta, pct_indireta_especial,
      regra_setor, multiplicador,
      atualizado_por, atualizado_em
    ) VALUES (
      p_empresa_id, p_setor_id, v_origem.equipe_id, v_origem.grupo_usuarios, p_ano, p_mes,
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

-- ── Excluir uma excecao (de equipe ou por usuario) ──────────────────────────

CREATE OR REPLACE FUNCTION public.fn_comissao_excluir_excecao(p_config_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.comissao_config%ROWTYPE;
BEGIN
  IF NOT public.fn_user_tem('metas_comissao_editar') THEN
    RAISE EXCEPTION 'Seu cargo não pode configurar a comissão.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_cfg FROM public.comissao_config WHERE id = p_config_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração de comissão não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_cfg.empresa_id) THEN
    RAISE EXCEPTION 'Empresa inválida para este usuário.' USING ERRCODE = '42501';
  END IF;

  IF v_cfg.equipe_id IS NULL AND NOT v_cfg.grupo_usuarios THEN
    RAISE EXCEPTION 'O padrão do setor não é uma exceção.' USING ERRCODE = '22023';
  END IF;

  IF public.fn_metas_esta_validada(v_cfg.empresa_id, v_cfg.setor_id, v_cfg.mes, v_cfg.ano) THEN
    RAISE EXCEPTION 'A meta deste setor está validada neste mês. Reabra a validação para editar a comissão.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.comissao_config WHERE id = v_cfg.id;
END;
$function$;

-- ============================================================================
-- 5. As RPCs do bonus
-- ============================================================================

-- ── Salvar um bonus ──────────────────────────────────────────────────────────
--
-- Sem `id` cria; com `id` substitui o bonus inteiro. `usuarios` sempre vem e
-- SUBSTITUI as pessoas. Os campos que nao sao do tipo sao gravados nulos.

CREATE OR REPLACE FUNCTION public.fn_comissao_bonus_salvar(p_bonus JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id_pedido UUID     := NULLIF(p_bonus->>'id', '')::UUID;
  v_empresa   UUID     := NULLIF(p_bonus->>'empresa_id', '')::UUID;
  v_setor     UUID     := NULLIF(p_bonus->>'setor_id', '')::UUID;
  v_ano       INTEGER  := NULLIF(p_bonus->>'ano', '')::INTEGER;
  v_mes       INTEGER  := NULLIF(p_bonus->>'mes', '')::INTEGER;
  v_tipo      TEXT     := NULLIF(p_bonus->>'tipo', '');
  v_ordem     SMALLINT := NULLIF(p_bonus->>'meta_ordem', '')::SMALLINT;
  v_alvo      NUMERIC  := NULLIF(p_bonus->>'valor_alvo', '')::NUMERIC;
  v_inicio    DATE     := NULLIF(p_bonus->>'periodo_inicio', '')::DATE;
  v_fim       DATE     := NULLIF(p_bonus->>'periodo_fim', '')::DATE;
  v_valor     NUMERIC  := NULLIF(p_bonus->>'valor_bonus', '')::NUMERIC;
  v_descricao TEXT     := NULLIF(btrim(COALESCE(p_bonus->>'descricao', '')), '');
  v_usuarios  UUID[];
  v_primeiro  DATE;
  v_id        UUID;
BEGIN
  IF NOT public.fn_user_tem('metas_comissao_editar') THEN
    RAISE EXCEPTION 'Seu cargo não pode configurar a comissão.' USING ERRCODE = '42501';
  END IF;

  IF v_empresa IS NULL OR v_setor IS NULL OR v_ano IS NULL OR v_mes IS NULL THEN
    RAISE EXCEPTION 'Bônus incompleto: empresa, setor, ano e mês são obrigatórios.'
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

  IF v_tipo IS NULL OR v_tipo NOT IN ('meta', 'valor', 'especial') THEN
    RAISE EXCEPTION 'Escolha o tipo do bônus.' USING ERRCODE = '22023';
  END IF;

  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'Informe o valor do bônus.' USING ERRCODE = '22023';
  END IF;

  IF v_tipo = 'meta' AND (v_ordem IS NULL OR v_ordem NOT BETWEEN 1 AND 20) THEN
    RAISE EXCEPTION 'Escolha a meta que libera o bônus.' USING ERRCODE = '22023';
  END IF;

  IF v_tipo IN ('valor', 'especial') AND (v_alvo IS NULL OR v_alvo <= 0) THEN
    RAISE EXCEPTION 'Informe o valor a atingir.' USING ERRCODE = '22023';
  END IF;

  IF v_tipo = 'especial' THEN
    IF v_inicio IS NULL OR v_fim IS NULL THEN
      RAISE EXCEPTION 'Informe o período da meta especial.' USING ERRCODE = '22023';
    END IF;
    IF v_fim < v_inicio THEN
      RAISE EXCEPTION 'O fim do período vem antes do início.' USING ERRCODE = '22023';
    END IF;
    v_primeiro := make_date(v_ano, v_mes, 1);
    IF v_inicio < v_primeiro OR v_fim > (v_primeiro + INTERVAL '1 month' - INTERVAL '1 day')::DATE THEN
      RAISE EXCEPTION 'O período da meta especial precisa estar dentro do mês do bônus.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT u.valor::UUID), '{}')
    INTO v_usuarios
    FROM jsonb_array_elements_text(COALESCE(p_bonus->'usuarios', '[]'::JSONB)) AS u(valor);

  IF cardinality(v_usuarios) = 0 THEN
    RAISE EXCEPTION 'Escolha ao menos uma pessoa para o bônus.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_usuarios) AS u(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.perfis p
        WHERE p.id = u.id AND p.empresa_id = v_empresa AND p.setor_id = v_setor
     )
  ) THEN
    RAISE EXCEPTION 'Só pessoas deste setor podem receber o bônus.' USING ERRCODE = '22023';
  END IF;

  IF v_id_pedido IS NULL THEN
    INSERT INTO public.comissao_bonus (
      empresa_id, setor_id, ano, mes, tipo,
      meta_ordem, valor_alvo, periodo_inicio, periodo_fim,
      valor_bonus, descricao,
      criado_por, atualizado_por
    ) VALUES (
      v_empresa, v_setor, v_ano, v_mes, v_tipo,
      CASE WHEN v_tipo = 'meta' THEN v_ordem END,
      CASE WHEN v_tipo <> 'meta' THEN v_alvo END,
      CASE WHEN v_tipo = 'especial' THEN v_inicio END,
      CASE WHEN v_tipo = 'especial' THEN v_fim END,
      v_valor, v_descricao,
      auth.uid(), auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.comissao_bonus b SET
      tipo           = v_tipo,
      meta_ordem     = CASE WHEN v_tipo = 'meta' THEN v_ordem END,
      valor_alvo     = CASE WHEN v_tipo <> 'meta' THEN v_alvo END,
      periodo_inicio = CASE WHEN v_tipo = 'especial' THEN v_inicio END,
      periodo_fim    = CASE WHEN v_tipo = 'especial' THEN v_fim END,
      valor_bonus    = v_valor,
      descricao      = v_descricao,
      atualizado_por = auth.uid(),
      atualizado_em  = NOW()
     WHERE b.id = v_id_pedido
       AND b.empresa_id = v_empresa AND b.setor_id = v_setor
       AND b.ano = v_ano AND b.mes = v_mes
    RETURNING b.id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Bônus não encontrado.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  DELETE FROM public.comissao_bonus_usuarios bu
   WHERE bu.bonus_id = v_id AND bu.usuario_id <> ALL (v_usuarios);

  INSERT INTO public.comissao_bonus_usuarios (bonus_id, usuario_id)
  SELECT v_id, u.id FROM unnest(v_usuarios) AS u(id)
  ON CONFLICT (bonus_id, usuario_id) DO NOTHING;

  RETURN v_id;
END;
$function$;

-- ── Excluir um bonus ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_comissao_bonus_excluir(p_bonus_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_bonus public.comissao_bonus%ROWTYPE;
BEGIN
  IF NOT public.fn_user_tem('metas_comissao_editar') THEN
    RAISE EXCEPTION 'Seu cargo não pode configurar a comissão.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bonus FROM public.comissao_bonus WHERE id = p_bonus_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bônus não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_bonus.empresa_id) THEN
    RAISE EXCEPTION 'Empresa inválida para este usuário.' USING ERRCODE = '42501';
  END IF;

  IF public.fn_metas_esta_validada(v_bonus.empresa_id, v_bonus.setor_id, v_bonus.mes, v_bonus.ano) THEN
    RAISE EXCEPTION 'A meta deste setor está validada neste mês. Reabra a validação para editar a comissão.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.comissao_bonus WHERE id = v_bonus.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_comissao_bonus_salvar(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_comissao_bonus_excluir(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_comissao_bonus_salvar(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_comissao_bonus_excluir(UUID) TO authenticated;

-- ============================================================================
-- 6. Tempo real
-- ============================================================================

DO $realtime$
DECLARE
  v_tabela TEXT;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['comissao_config_usuarios', 'comissao_bonus', 'comissao_bonus_usuarios'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_tabela
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tabela);
    END IF;
  END LOOP;
END
$realtime$;

-- ============================================================================
-- 7. Prova
-- ============================================================================

DO $prova$
BEGIN
  IF to_regclass('public.comissao_config_usuarios') IS NULL
     OR to_regclass('public.comissao_bonus') IS NULL
     OR to_regclass('public.comissao_bonus_usuarios') IS NULL THEN
    RAISE EXCEPTION 'As tabelas novas da comissao nao foram criadas.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid IN ('public.comissao_config_usuarios'::REGCLASS,
                   'public.comissao_bonus'::REGCLASS,
                   'public.comissao_bonus_usuarios'::REGCLASS)
       AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION 'A RLS de alguma tabela nova da comissao esta desligada.';
  END IF;

  IF to_regclass('public.uq_comissao_config_padrao') IS NULL
     OR to_regclass('public.uq_comissao_config_equipe') IS NULL THEN
    RAISE EXCEPTION 'Os indices de competencia da comissao nao foram criados.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.comissao_config'::REGCLASS
       AND conname = 'comissao_config_competencia_unica'
  ) THEN
    RAISE EXCEPTION 'A UNIQUE antiga da competencia continua na tabela.';
  END IF;

  IF to_regprocedure('public.fn_comissao_bonus_salvar(jsonb)') IS NULL
     OR to_regprocedure('public.fn_comissao_bonus_excluir(uuid)') IS NULL THEN
    RAISE EXCEPTION 'As RPCs do bonus nao foram criadas.';
  END IF;

  -- Nenhuma configuracao existente virou grupo nem perdeu o padrao unico.
  IF EXISTS (
    SELECT 1 FROM public.comissao_config
     WHERE equipe_id IS NULL AND NOT grupo_usuarios
     GROUP BY empresa_id, setor_id, ano, mes HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existe setor com dois padroes no mesmo mes.';
  END IF;
END
$prova$;

COMMIT;
